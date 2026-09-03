import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { clearPasswordRecovery } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [exchanging, setExchanging] = useState(false);

  const settledRef = useRef(false);

  const hasCode = new URL(window.location.href).searchParams.has('code');

  useEffect(() => {
    if (hasCode) return;
    if (settledRef.current) return;
    settledRef.current = true;

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSessionReady(true);
      } else {
        setError('Unable to establish a recovery session. Please use the latest link from your email.');
      }
    });
  }, [hasCode]);

  function cleanUrl() {
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  async function handleContinue() {
    if (settledRef.current) return;
    settledRef.current = true;
    setExchanging(true);
    setError(null);

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setError('Unable to establish a recovery session. Please use the latest link from your email.');
      setExchanging(false);
    }, 5000);

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(window.location.href);
    clearTimeout(timeoutId);

    if (timedOut) return;

    if (exchangeError) {
      const isAlreadyConsumed = /invalid|already|expired|used/i.test(exchangeError.message);
      if (isAlreadyConsumed) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          cleanUrl();
          setSessionReady(true);
          setExchanging(false);
          return;
        }
      }
      setError('Unable to establish a recovery session. Please use the latest link from your email.');
      setExchanging(false);
      return;
    }

    cleanUrl();
    setSessionReady(true);
    setExchanging(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    clearPasswordRecovery();
    await supabase.auth.signOut();
    navigate('/login', {
      replace: true,
      state: { message: 'Your password has been updated. Sign in with your new password.' },
    });
  }

  const showContinue = hasCode && !sessionReady && !exchanging && !error;

  if (showContinue) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 p-6 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
              <Mail className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Reset your password</h1>
          <p className="text-sm text-gray-500 mt-2">Click below to continue resetting your password.</p>
          <button
            onClick={handleContinue}
            className="w-full mt-6 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (exchanging) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 p-6 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-600">Verifying your recovery link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-xl font-semibold text-gray-900">Set a new password</h1>
        <p className="text-sm text-gray-500 mt-1">Choose a new password for your account.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">New password</label>
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !sessionReady}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? 'Please wait...' : !sessionReady ? 'Verifying...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
