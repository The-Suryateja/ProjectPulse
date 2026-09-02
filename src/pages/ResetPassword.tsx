import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
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
  
  // Guard reference to prevent React Strict Mode double-execution
  const settledRef = useRef(false);

  useEffect(() => {
    const establishSession = async () => {
      if (settledRef.current) return;
      settledRef.current = true;

      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');

      if (code) {
        // 1. Explicitly exchange the token
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        
        if (exchangeError) {
          setError('Unable to establish a recovery session. Please use the latest link from your email.');
          return;
        }

        // 2. Clean the URL to prevent token reuse on accidental refresh
        window.history.replaceState({}, '', window.location.pathname);
        setSessionReady(true);
      } else {
        // 3. Fallback: Check if a valid session is already active
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          setSessionReady(true);
        } else {
          setError('Unable to establish a recovery session. Please use the latest link from your email.');
        }
      }
    };

    establishSession();
  }, []);

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
