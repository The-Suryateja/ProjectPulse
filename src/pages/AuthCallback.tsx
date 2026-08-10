import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let resolved = false;

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (resolved) return;
      if (event === 'SIGNED_IN' && session) {
        resolved = true;
        navigate('/', { replace: true });
      }
    });

    const timeout = setTimeout(() => {
      if (!resolved) {
        const hash = window.location.hash;
        if (hash.includes('error_description=')) {
          setError('Authentication link is invalid or has expired.');
        } else {
          navigate('/', { replace: true });
        }
      }
    }, 3000);

    return () => {
      subscription.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
        <p className="mt-3 text-sm text-gray-600">Verifying your account...</p>
      </div>
    </div>
  );
}
