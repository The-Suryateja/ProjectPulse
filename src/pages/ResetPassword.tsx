import { FormEvent, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

export default function ResetPassword() {
  const navigate = useNavigate();
  // Consume the session directly from AuthContext
  const { session, clearPasswordRecovery } = useAuth();
  
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Clean the URL purely for visual purposes after AuthContext auto-exchanges the code
  useEffect(() => {
    const hasCode = new URLSearchParams(window.location.search).has('code');
    if (session && hasCode) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [session]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    // Final validation to ensure the JWT exists before network request
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

  // UI STATE 1: Waiting for AuthContext to process the URL
  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 p-6 text-center space-y-4">
           <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
           <p className="text-sm text-gray-600">Securely verifying your link...</p>
        </div>
      </div>
    );
  }

  // UI STATE 2: Token validated by AuthContext, form unlocked
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
