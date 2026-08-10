import { useState, FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase, redirectTo } from '../lib/supabase';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'sign_in' | 'sign_up' | 'forgot_password'>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    if (mode === 'forgot_password') {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (resetError) {
        setError(resetError.message);
      } else {
        setInfo('Password reset link sent. Check your email for instructions.');
      }
      setSubmitting(false);
      return;
    }

    const result = mode === 'sign_in' ? await signIn(email, password) : await signUp(email, password);

    if (result.error) {
      setError(result.error);
    } else if (mode === 'sign_up') {
      setInfo('Account created. Check your email to confirm, then sign in.');
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-xl font-semibold text-gray-900">ProjectPulse</h1>
        <p className="text-sm text-gray-500 mt-1">
          {mode === 'sign_in'
            ? 'Sign in to your account'
            : mode === 'sign_up'
              ? 'Create an account'
              : 'Reset your password'}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {mode !== 'forgot_password' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-green-600">{info}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting
              ? 'Please wait...'
              : mode === 'sign_in'
                ? 'Sign In'
                : mode === 'sign_up'
                  ? 'Sign Up'
                  : 'Send Reset Link'}
          </button>
        </form>

        {mode === 'sign_in' && (
          <button
            onClick={() => {
              setMode('forgot_password');
              setError(null);
              setInfo(null);
            }}
            className="mt-4 text-sm text-blue-600 hover:text-blue-700"
          >
            Forgot password?
          </button>
        )}

        {mode === 'forgot_password' ? (
          <button
            onClick={() => {
              setMode('sign_in');
              setError(null);
              setInfo(null);
            }}
            className="mt-4 text-sm text-blue-600 hover:text-blue-700"
          >
            Back to sign in
          </button>
        ) : (
          <button
            onClick={() => {
              setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in');
              setError(null);
              setInfo(null);
            }}
            className="mt-4 text-sm text-blue-600 hover:text-blue-700"
          >
            {mode === 'sign_in' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        )}
      </div>
    </div>
  );
}
