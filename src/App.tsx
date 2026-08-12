import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Project from './pages/Project';
import Report from './pages/Report';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import AuthCallback from './pages/AuthCallback';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { supabase } from './lib/supabase';

function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return <>{children}</>;
}

function RecoveryRoute() {
  const navigate = useNavigate();
  const [isRecoverySession, setIsRecoverySession] = useState(false);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoverySession(true);
      }
    });

    const timeout = setTimeout(() => {
      if (!isRecoverySession) {
        navigate('/login', { replace: true });
      }
    }, 3000);

    return () => {
      subscription.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [isRecoverySession, navigate]);

  if (!isRecoverySession) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return <ResetPassword />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/reset-password" element={<RecoveryRoute />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <AuthGate>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/project/:projectId" element={<Project />} />
                    <Route path="/report/:projectId" element={<Report />} />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                  </Routes>
                </AuthGate>
              }
            />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
