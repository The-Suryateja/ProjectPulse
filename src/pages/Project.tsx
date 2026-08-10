import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  FileText,
  Presentation,
  FileCode,
  Loader2,
  CheckCircle,
  XCircle,
  Trash2,
  Play,
  BarChart3,
  Calendar,
  FileStack,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { triggerExtraction, triggerAggregation } from '../lib/api';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import type { Project, Document, DocumentType, ExtractionStatus, Report } from '../types';

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'meeting_notes', label: 'Meeting Notes' },
  { value: 'spec', label: 'Specification' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' }
];

const STATUS_CONFIG: Record<ExtractionStatus, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'bg-gray-100 text-gray-600', icon: <FileStack className="w-3.5 h-3.5" />, label: 'Pending' },
  processing: { color: 'bg-blue-100 text-blue-600', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: 'Processing' },
  done: { color: 'bg-green-100 text-green-600', icon: <CheckCircle className="w-3.5 h-3.5" />, label: 'Complete' },
  failed: { color: 'bg-red-100 text-red-600', icon: <XCircle className="w-3.5 h-3.5" />, label: 'Failed' }
};

export default function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [docPendingDelete, setDocPendingDelete] = useState<{ id: string; storagePath: string } | null>(null);

  useEffect(() => {
    if (projectId) {
      fetchData();
      const cleanup = subscribeToUpdates();
      return cleanup;
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    setLoading(true);
    const { data: projectData } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectData) {
      setProject(projectData);
    }

    const { data: documentsData } = await supabase
      .from('documents')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (documentsData) {
      setDocuments(documentsData);
    }

    const { data: reportData } = await supabase
      .from('reports')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    setReport(reportData);
    setLoading(false);
  }

  function subscribeToUpdates() {
    const channel = supabase
      .channel(`project-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documents',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          const updatedDoc = payload.new as Document;
          setDocuments((prev) => {
            const exists = prev.find((d) => d.id === updatedDoc.id);
            if (exists) {
              return prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d));
            }
            return [...prev, updatedDoc];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'documents',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          const newDoc = payload.new as Document;
          setDocuments((prev) => {
            if (prev.find((d) => d.id === newDoc.id)) {
              return prev;
            }
            return [...prev, newDoc];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reports',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          setReport(payload.new as Report);
          setGenerating(false);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reports',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          setReport(payload.new as Report);
          setGenerating(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    // Process files sequentially to avoid race conditions
    for (const file of Array.from(files)) {
      if (documents.length >= 3) break;

      const confirmed = await showUploadDialog(file);
      if (!confirmed) continue;

      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storageFileName = `${Date.now()}-${sanitizedFileName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(`${projectId}/${storageFileName}`, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        setToastMessage(`Failed to upload ${file.name}: ${uploadError.message}`);
        continue;
      }

      const { error: insertError, data: newDoc } = await supabase
        .from('documents')
        .insert({
          project_id: projectId,
          file_name: file.name,
          storage_path: uploadData.path,
          document_type: confirmed.type,
          document_date: confirmed.date
        })
        .select()
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        setToastMessage(`Failed to create document record for ${file.name}: ${insertError.message}`);
        continue;
      }

      // Immediately update local state
      if (newDoc) {
        setDocuments((prev) => {
          if (prev.find((d) => d.id === newDoc.id)) {
            return prev;
          }
          return [...prev, newDoc];
        });

        // Trigger extraction asynchronously — don't block the UI
        triggerExtraction(newDoc.id).catch((err) => {
          console.error('Extraction trigger error:', err);
        });
      }
    }

    setUploading(false);
    event.target.value = '';
  }

  async function showUploadDialog(file: File): Promise<{ type: DocumentType; date: string } | null> {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'rounded-lg shadow-xl p-6 max-w-sm bg-white';
      dialog.innerHTML = `
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Upload: ${file.name}</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
            <select id="doc-type" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              ${DOCUMENT_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Document Date</label>
            <input type="date" id="doc-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button id="cancel" class="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button id="confirm" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Upload</button>
        </div>
      `;
      document.body.appendChild(dialog);
      dialog.showModal();

      const today = new Date().toISOString().split('T')[0];
      (dialog.querySelector('#doc-date') as HTMLInputElement).value = today;

      dialog.querySelector('#cancel')!.addEventListener('click', () => {
        dialog.close();
        dialog.remove();
        resolve(null);
      });

      dialog.querySelector('#confirm')!.addEventListener('click', () => {
        const type = (dialog.querySelector('#doc-type') as HTMLSelectElement).value as DocumentType;
        const date = (dialog.querySelector('#doc-date') as HTMLInputElement).value;
        if (!date) {
          (dialog.querySelector('#doc-date') as HTMLInputElement).classList.add('border-red-500');
          return;
        }
        dialog.close();
        dialog.remove();
        resolve({ type, date });
      });
    });
  }

  async function processDocument(docId: string) {
    // Optimistically update status
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, extraction_status: 'processing' as ExtractionStatus, error_message: null } : d))
    );

    // Clear report when reprocessing
    setReport(null);

    await supabase
      .from('documents')
      .update({ extraction_status: 'processing', error_message: null })
      .eq('id', docId);

    const result = await triggerExtraction(docId);
    if (result.error) {
      console.error('Extraction error:', result.error);
    }
    await fetchData();
  }

  async function deleteDocument(docId: string, storagePath: string) {
    await supabase.storage.from('documents').remove([storagePath]);
    await supabase.from('documents').delete().eq('id', docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    setReport(null);
    setDocPendingDelete(null);
  }

  async function generateReport() {
    setGenerating(true);

    try {
      // Create/update report record to processing status
      await supabase
        .from('reports')
        .upsert({
          project_id: projectId,
          generation_status: 'processing',
          error_message: null
        }, { onConflict: 'project_id' });

      const result = await triggerAggregation(projectId!);
      if (result.error) {
        console.error('Aggregation error:', result.error);
      }
    } catch (err) {
      console.error('Aggregation error:', err);
    } finally {
      // Always re-fetch so UI reflects the latest report state immediately
      await fetchData();
      setGenerating(false);
    }
  }

  const allProcessed = documents.length > 0 && documents.every((d) => d.extraction_status === 'done');
  const hasSuccessfulReport = report?.generation_status === 'done';

  function toggleError(docId: string) {
    setExpandedErrors((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(docId)) {
        newSet.delete(docId);
      } else {
        newSet.add(docId);
      }
      return newSet;
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-gray-900">{project?.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {documents.length} document{documents.length !== 1 ? 's' : ''} uploaded
              </p>
            </div>
            {hasSuccessfulReport && report.aggregated_data && (
              <Link
                to={`/report/${projectId}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                <BarChart3 className="w-4 h-4" />
                View Report
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-medium text-gray-900">Documents</h2>
              <p className="text-sm text-gray-500 mt-0.5">Upload 2-3 documents (PDF, PPTX, DOCX, TXT, or MD)</p>
            </div>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Upload File'}
              <input
                type="file"
                accept=".pdf,.pptx,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading || documents.length >= 3}
              />
            </label>
          </div>

          {documents.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-12 text-center">
              <FileText className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="text-gray-500 mt-3">Drop files here or click to upload</p>
              <p className="text-sm text-gray-400 mt-1">Accepts PDF, PPTX, DOCX, TXT, MD — Maximum 3 documents</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => {
                const status = STATUS_CONFIG[doc.extraction_status];
                const showError = expandedErrors.has(doc.id);
                const ext = doc.file_name.toLowerCase().split('.').pop() || '';

                // Determine file type icon and styling
                const getFileTypeInfo = (extension: string) => {
                  switch (extension) {
                    case 'pptx':
                      return { icon: Presentation, label: 'PowerPoint', color: 'text-orange-500' };
                    case 'docx':
                      return { icon: FileText, label: 'Word', color: 'text-blue-500' };
                    case 'txt':
                      return { icon: FileText, label: 'TXT', color: 'text-gray-500' };
                    case 'md':
                      return { icon: FileCode, label: 'Markdown', color: 'text-purple-500' };
                    case 'pdf':
                    default:
                      return { icon: FileText, label: 'PDF', color: 'text-red-500' };
                  }
                };
                const fileInfo = getFileTypeInfo(ext);
                const FileTypeIcon = fileInfo.icon;

                return (
                  <div key={doc.id}>
                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-gray-200">
                        <FileTypeIcon className={`w-5 h-5 ${fileInfo.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${fileInfo.color}`}>
                            {fileInfo.label}
                          </span>
                          <span className="text-xs text-gray-300">|</span>
                          <span className="text-xs text-gray-500 capitalize">
                            {doc.document_type.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-gray-300">|</span>
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            {new Date(doc.document_date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}
                      >
                        {status.icon}
                        {status.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {doc.extraction_status === 'pending' && (
                          <button
                            onClick={() => processDocument(doc.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          >
                            <Play className="w-3.5 h-3.5" />
                            Process
                          </button>
                        )}
                        {doc.extraction_status === 'failed' && (
                          <>
                            <button
                              onClick={() => toggleError(doc.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {showError ? 'Hide Error' : 'Show Error'}
                            </button>
                            <button
                              onClick={() => processDocument(doc.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
                            >
                              <Play className="w-3.5 h-3.5" />
                              Retry
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setDocPendingDelete({ id: doc.id, storagePath: doc.storage_path })}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {doc.extraction_status === 'failed' && doc.error_message && showError && (
                      <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-red-800">Extraction Failed</p>
                            <p className="text-sm text-red-700 mt-1 font-mono whitespace-pre-wrap">{doc.error_message}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {documents.length > 0 && !hasSuccessfulReport && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Generate Report</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {report?.generation_status === 'failed'
                    ? 'Report generation failed. Try again.'
                    : allProcessed
                    ? 'All documents processed. Ready to generate your report.'
                    : 'Process all documents first to generate the report.'}
                </p>
              </div>
              <button
                onClick={generateReport}
                disabled={!allProcessed || generating}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : report?.generation_status === 'failed' ? (
                  <>
                    <BarChart3 className="w-4 h-4" />
                    Retry
                  </>
                ) : (
                  <>
                    <BarChart3 className="w-4 h-4" />
                    Generate Report
                  </>
                )}
              </button>
            </div>
            {report?.generation_status === 'failed' && report.error_message && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Report Generation Failed</p>
                    <p className="text-sm text-red-700 mt-1 font-mono whitespace-pre-wrap">{report.error_message}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />

      <ConfirmDialog
        open={docPendingDelete !== null}
        title="Delete document?"
        message="This will permanently remove the document and its extracted data."
        confirmLabel="Delete"
        destructive
        onConfirm={() => docPendingDelete && deleteDocument(docPendingDelete.id, docPendingDelete.storagePath)}
        onCancel={() => setDocPendingDelete(null)}
      />
    </div>
  );
}
