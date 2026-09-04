import { FormEvent, useRef, useState, useEffect } from 'react';
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
  
  // Determine initial state based on URL
  const hasCode = new URLSearchParams(window.location.search).has('code');

  useEffect(() => {
    if (!hasCode && !sessionReady) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setSessionReady(true);
      });
    }
  }, [hasCode, sessionReady]);

  async function handleContinue() {
    if (settledRef.current) return;
    settledRef.current = true;
    
    setExchanging(true);
    setError(null);

    // CRITICAL FIX: Extract ONLY the alphanumeric code, not the full URL
    const code = new URLSearchParams(window.location.search).get('code');

    if (!code) {
      setError('Invalid or missing recovery link.');
      setExchanging(false);
      return;
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      setError('Unable to establish a recovery session. Please use the latest link from your email.');
      setExchanging(false);
      return;
    }

    // Strip the code from the URL and unlock the password form
    window.history.replaceState({}, '', window.location.pathname);
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

  // UI STATE 1: Verify Link
  if (hasCode && !sessionReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 p-6 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
              <Mail className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Reset your password</h1>
          
          {exchanging ? (
             <div className="mt-6 space-y-3">
               <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
               <p className="text-sm text-gray-600">Verifying...</p>
             </div>
          ) : (
            <>
              {error ? (
                <div className="mt-6 space-y-4">
                  <p className="text-sm text-red-600">{error}</p>
                  <button onClick={() => window.location.href = '/login'} className="w-full px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">Return to Login</button>
                </div>
              ) : (
                <button onClick={handleContinue} className="w-full mt-6 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                  Continue
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // UI STATE 2: Set New Password Form
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-xl font-semibold text-gray-900">Set a new password</h1>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">New password</label>
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                required minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
            {submitting ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
