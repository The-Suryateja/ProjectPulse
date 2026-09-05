import { FormEvent, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { session, clearPasswordRecovery } = useAuth();
  
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isExchanging, setIsExchanging] = useState(true);

  // Guard to prevent React StrictMode from double-firing the single-use token
  const exchangeAttempted = useRef(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    const urlError = searchParams.get('error_description');

    // 1. Instantly handle any backend errors passed in the URL
    if (urlError) {
      setError(urlError.replace(/\+/g, ' '));
      setIsExchanging(false);
      return;
    }

    // 2. Execute the token exchange exactly once
    if (code && !exchangeAttempted.current) {
      exchangeAttempted.current = true;

      const exchangeToken = async () => {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        
        if (exchangeError) {
          setError(exchangeError.message);
        } else {
          // Clean the URL so the token isn't visible in the address bar
          window.history.replaceState({}, '', window.location.pathname);
        }
        setIsExchanging(false);
      };

      exchangeToken();
    } else if (!code && !session) {
      // If there is no code and no active session, stop spinning
      setIsExchanging(false);
    }
  }, [session]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!session) {
      setError("Session was lost. Please request a new reset link.");
      setSubmitting(false);
      return;
    }

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

  // UI STATE 1: Exchanging token or showing exchange error
  if (isExchanging || (!session && error)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 p-6 text-center space-y-4">
           {error ? (
             <div className="space-y-4">
               <p className="text-sm text-red-600">{error}</p>
               <button onClick={() => navigate('/login')} className="w-full px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                 Return to Login
               </button>
             </div>
           ) : (
             <>
               <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
               <p className="text-sm text-gray-600">Securely verifying your link...</p>
             </>
           )}
        </div>
      </div>
    );
  }

  // UI STATE 2: Session established, form unlocked
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
