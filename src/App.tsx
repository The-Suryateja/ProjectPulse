import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Project from './pages/Project';
import Report from './pages/Report';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/project/:projectId" element={<Project />} />
          <Route path="/report/:projectId" element={<Report />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
