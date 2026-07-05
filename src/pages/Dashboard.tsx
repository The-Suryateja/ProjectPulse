import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FolderOpen, FileText, ChevronRight, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Project } from '../types';

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setLoading(true);
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setProjects(data);
    }
    setLoading(false);
  }

  async function createProject() {
    if (!newProjectName.trim()) return;

    setCreating(true);
    const { data, error } = await supabase
      .from('projects')
      .insert({ name: newProjectName.trim() })
      .select()
      .single();

    if (!error && data) {
      setProjects([data, ...projects]);
      setShowNewProject(false);
      setNewProjectName('');
    }
    setCreating(false);
  }

  async function deleteProject(projectId: string) {
    if (!confirm('Are you sure you want to delete this project and all its documents?')) return;

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (!error) {
      setProjects(projects.filter(p => p.id !== projectId));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">ProjectPulse</h1>
              <p className="text-sm text-gray-500 mt-1">Multi-document project analysis</p>
            </div>
            <button
              onClick={() => setShowNewProject(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-4">Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="w-12 h-12 text-gray-300 mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No projects yet</h3>
            <p className="mt-2 text-gray-500">Get started by creating your first project.</p>
            <button
              onClick={() => setShowNewProject(true)}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Project
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-white rounded-lg border border-gray-200 p-5 hover:border-gray-300 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <Link
                        to={`/project/${project.id}`}
                        className="text-base font-medium text-gray-900 hover:text-blue-600 transition-colors"
                      >
                        {project.name}
                      </Link>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Created {new Date(project.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/project/${project.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      View
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showNewProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900">Create New Project</h2>
            <p className="text-sm text-gray-500 mt-1">Give your project a name to get started.</p>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
              className="mt-4 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') createProject();
                if (e.key === 'Escape') setShowNewProject(false);
              }}
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowNewProject(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createProject}
                disabled={!newProjectName.trim() || creating}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
