import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Project from './pages/Project';
import Report from './pages/Report';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './lib/AuthContext';

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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <AuthGate>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/project/:projectId" element={<Project />} />
              <Route path="/report/:projectId" element={<Report />} />
            </Routes>
          </AuthGate>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
