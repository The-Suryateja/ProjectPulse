import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Presentation,
  X,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Circle,
  HelpCircle,
  TrendingUp,
  RotateCcw,
  Sparkles,
  FileText,
  AlertCircle,
  Loader2
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList
} from 'recharts';
import { supabase } from '../lib/supabase';
import type { Report, Document } from '../types';

const COLORS = {
  primary: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  gray: '#6B7280',
  blue: '#60A5FA',
  green: '#34D399',
  orange: '#FBBF24',
  red: '#F87171',
  purple: '#A78BFA',
  pink: '#F472B6',
  teal: '#2DD4BF',
  indigo: '#818CF8'
};

const TREND_COLORS = {
  new: '#3B82F6',
  recurring: '#F59E0B',
  escalating: '#EF4444'
};

const TREND_ICONS = {
  new: Sparkles,
  recurring: RotateCcw,
  escalating: TrendingUp
};

export default function ReportView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [presentMode, setPresentMode] = useState(false);
  const [expandedRisks, setExpandedRisks] = useState<Set<number>>(new Set());
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
  const [expandedDecisions, setExpandedDecisions] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (projectId) {
      fetchData();
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    setLoading(true);
    const { data: reportData } = await supabase
      .from('reports')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (reportData) {
      setReport(reportData);
    }

    const { data: documentsData } = await supabase
      .from('documents')
      .select('*')
      .eq('project_id', projectId);

    if (documentsData) {
      setDocuments(documentsData);
    }
    setLoading(false);
  }

  const data = report?.aggregated_data;
  const docMap = new Map(documents.map((d) => [d.id, d]));

  function getDocName(docId: string): string {
    const doc = docMap.get(docId);
    return doc?.file_name || 'Unknown Document';
  }

  function toggleSet(set: Set<number>, index: number): Set<number> {
    const newSet = new Set(set);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    return newSet;
  }

  const actionItemsChartData = data
    ? [
        { name: 'Open', value: data.action_items_summary.open, color: COLORS.warning },
        { name: 'Closed', value: data.action_items_summary.closed, color: COLORS.success },
        { name: 'Unclear', value: data.action_items_summary.unclear, color: COLORS.gray }
      ]
    : [];

  const isSingleActionCategory =
    actionItemsChartData.length > 0 &&
    actionItemsChartData.filter((d) => d.value > 0).length === 1;
  const singleActionCategory = isSingleActionCategory
    ? actionItemsChartData.find((d) => d.value > 0)
    : null;

  const risksByTrendData = data
    ? Object.entries(
        data.merged_risks.reduce(
          (acc, risk) => {
            acc[risk.trend] = (acc[risk.trend] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        )
      ).map(([trend, count]) => ({
        name: trend.charAt(0).toUpperCase() + trend.slice(1),
        value: count,
        color: TREND_COLORS[trend as keyof typeof TREND_COLORS]
      }))
    : [];

  const isSingleTrendCategory =
    risksByTrendData.length === 1;
  const singleTrendName = isSingleTrendCategory ? risksByTrendData[0]?.name : null;

  const risksByDocData =
    data && documents.length > 0
      ? documents.map((doc) => ({
          name: doc.file_name.length > 20 ? doc.file_name.slice(0, 20) + '...' : doc.file_name,
          fullName: doc.file_name,
          risks:
            data.merged_risks.filter((r) => r.mentioned_in.includes(doc.id)).length || 0
        }))
      : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!report || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="text-gray-500 mt-4">Report not found</p>
          <Link
            to={`/project/${projectId}`}
            className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to project
          </Link>
        </div>
      </div>
    );
  }

  const ReportContent = () => (
    <>
      {/* Executive Summary */}
      <section className="bg-white rounded-xl border border-gray-200 p-8 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Executive Summary</h2>
        <p className="text-gray-600 leading-relaxed">{data.executive_summary}</p>
      </section>

      {/* Stat Cards */}
      <section className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Total Action Items</p>
          <p className="text-3xl font-bold text-gray-900">{data.action_items_summary.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Circle className="w-4 h-4 text-orange-500" />
            <p className="text-sm text-gray-500">Open</p>
          </div>
          <p className="text-3xl font-bold text-orange-600">{data.action_items_summary.open}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <p className="text-sm text-gray-500">Closed</p>
          </div>
          <p className="text-3xl font-bold text-green-600">{data.action_items_summary.closed}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <HelpCircle className="w-4 h-4 text-gray-400" />
            <p className="text-sm text-gray-500">Unclear</p>
          </div>
          <p className="text-3xl font-bold text-gray-500">{data.action_items_summary.unclear}</p>
        </div>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-3 gap-6 mb-8">
        {/* Action Items Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Action Items Breakdown</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={actionItemsChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ cx, cy }) => {
                    if (singleActionCategory) {
                      return (
                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={cx} y={cy - 8} fontSize="28" fontWeight="700" fill="#1F2937">
                            {singleActionCategory.value}
                          </tspan>
                          <tspan x={cx} y={cy + 16} fontSize="13" fill="#6B7280">
                            {singleActionCategory.name}
                          </tspan>
                        </text>
                      );
                    }
                    return null;
                  }}
                >
                  {actionItemsChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {actionItemsChartData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-sm text-gray-600">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risks by Trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Risk Trends</h3>
          {isSingleTrendCategory && singleTrendName && (
            <p className="text-sm text-gray-500 mb-3">
              Only '{singleTrendName}' risks identified across documents
            </p>
          )}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={risksByTrendData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {risksByTrendData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                  <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: '#6B7280' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {Object.entries(TREND_COLORS).map(([trend, color]) => {
              const Icon = TREND_ICONS[trend as keyof typeof TREND_ICONS];
              return (
                <div key={trend} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <Icon className="w-3 h-3" style={{ color }} />
                  <span className="text-sm text-gray-600 capitalize">{trend}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Risk Mentions per Document */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Risk Mentions by Document</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={risksByDocData}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={50}
                />
                <YAxis allowDecimals={false} />
                <Tooltip
                  formatter={(value) => [value, 'Risks']}
                  labelFormatter={(label) => {
                    const item = risksByDocData.find((d) => d.name === label);
                    return item?.fullName || label;
                  }}
                />
                <Bar dataKey="risks" fill={COLORS.primary} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="risks" position="top" style={{ fontSize: 12, fill: '#6B7280' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Conflicts Detected */}
      {data.conflicts_detected.length > 0 && (
        <section className="bg-red-50 border-2 border-red-200 rounded-xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-red-900">Conflicts Detected</h2>
              <p className="text-sm text-red-700">
                Contradictions found between documents that should be reviewed
              </p>
            </div>
          </div>
          <div className="space-y-4">
            {data.conflicts_detected.map((conflict, idx) => (
              <div
                key={idx}
                className="bg-white rounded-lg p-4 border border-red-200 shadow-sm"
              >
                <p className="text-gray-900">{conflict.description}</p>
                <div className="flex items-center gap-2 mt-3">
                  {conflict.document_ids.map((docId) => (
                    <span
                      key={docId}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs rounded"
                    >
                      <FileText className="w-3 h-3" />
                      {getDocName(docId)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Merged Risks */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Merged Risks</h2>
        {data.merged_risks.length === 0 ? (
          <p className="text-gray-500">No risks identified in the documents.</p>
        ) : (
          <div className="space-y-3">
            {data.merged_risks.map((risk, idx) => {
              const TrendIcon = TREND_ICONS[risk.trend];
              const isExpanded = expandedRisks.has(idx);
              return (
                <div key={idx} className="border border-gray-200 rounded-lg">
                  <button
                    onClick={() => setExpandedRisks(toggleSet(expandedRisks, idx))}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 text-left">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                      )}
                      <span className="font-medium text-gray-900">{risk.risk}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                          risk.severity_hint === 'explicit'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {risk.severity_hint === 'explicit' ? (
                          <AlertTriangle className="w-3 h-3" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {risk.severity_hint}
                      </span>
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${TREND_COLORS[risk.trend]}20`,
                          color: TREND_COLORS[risk.trend]
                        }}
                      >
                        <TrendIcon className="w-3 h-3" />
                        {risk.trend}
                      </span>
                      <span className="text-xs text-gray-500">
                        {risk.mentioned_in.length} doc{risk.mentioned_in.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                      <div className="space-y-3">
                        {risk.evidence_quotes.map((quote, qIdx) => (
                          <div key={qIdx} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-sm font-medium text-gray-700">
                                {getDocName(quote.document_id)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 italic">"{quote.quote}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Decisions Timeline */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Decisions Timeline</h2>
        {data.decisions_timeline.length === 0 ? (
          <p className="text-gray-500">No decisions identified in the documents.</p>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-2 bottom-2 w-px bg-gray-200" />
            <div className="space-y-4">
              {data.decisions_timeline
                .sort((a, b) =>
                  new Date(a.document_date).getTime() - new Date(b.document_date).getTime()
                )
                .map((decision, idx) => {
                  const isExpanded = expandedDecisions.has(idx);
                  return (
                    <div key={idx} className="relative pl-10">
                      <div className="absolute left-2 top-2 w-4 h-4 bg-blue-100 rounded-full border-2 border-blue-500" />
                      <button
                        onClick={() => setExpandedDecisions(toggleSet(expandedDecisions, idx))}
                        className="w-full text-left"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="text-sm text-gray-500">
                            {new Date(decision.document_date).toLocaleDateString()}
                          </span>
                          <span className="text-sm text-gray-400">|</span>
                          <span className="text-sm text-gray-500">
                            {getDocName(decision.document_id)}
                          </span>
                        </div>
                        <p className="font-medium text-gray-900 mt-1">{decision.decision}</p>
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </section>

      {/* Open Questions */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Unresolved Open Questions</h2>
        {data.open_questions_unresolved.length === 0 ? (
          <p className="text-gray-500">No unresolved questions found.</p>
        ) : (
          <div className="space-y-3">
            {data.open_questions_unresolved.map((question, idx) => {
              const isExpanded = expandedQuestions.has(idx);
              return (
                <div key={idx} className="border border-gray-200 rounded-lg">
                  <button
                    onClick={() => setExpandedQuestions(toggleSet(expandedQuestions, idx))}
                    className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <span className="font-medium text-gray-900 text-left">{question.question}</span>
                    <span className="text-xs text-gray-500 ml-auto">
                      {getDocName(question.document_id)}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                      <p className="text-sm text-gray-600 italic bg-gray-50 rounded-lg p-3">
                        "{question.evidence_quote}"
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {!presentMode && (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link
                  to={`/project/${projectId}`}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    {data.project_name} - Report
                  </h1>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Generated {new Date(report.generated_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPresentMode(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Presentation className="w-4 h-4" />
                Present
              </button>
            </div>
          </div>
        </header>
      )}

      <main className={`max-w-6xl mx-auto px-6 py-8 ${presentMode ? 'py-16' : ''}`}>
        {presentMode ? (
          <div className="max-w-4xl mx-auto">
            {presentMode && (
              <button
                onClick={() => setPresentMode(false)}
                className="fixed top-6 right-6 p-2 bg-white/90 backdrop-blur rounded-full shadow-lg hover:bg-white transition-colors"
              >
                <X className="w-6 h-6 text-gray-600" />
              </button>
            )}
            <div className="space-y-16">
              <section className="max-w-2xl mx-auto">
                <h1 className="text-5xl font-bold text-gray-900 mb-6 text-center">{data.project_name}</h1>
                <p className="text-xl text-gray-600 leading-relaxed text-left">
                  {data.executive_summary}
                </p>
              </section>

              <section className="grid grid-cols-4 gap-8">
                <div className="text-center">
                  <p className="text-6xl font-bold text-gray-900">
                    {data.action_items_summary.total}
                  </p>
                  <p className="text-lg text-gray-500 mt-2">Total Actions</p>
                </div>
                <div className="text-center">
                  <p className="text-6xl font-bold text-orange-500">
                    {data.action_items_summary.open}
                  </p>
                  <p className="text-lg text-gray-500 mt-2">Open</p>
                </div>
                <div className="text-center">
                  <p className="text-6xl font-bold text-green-500">
                    {data.action_items_summary.closed}
                  </p>
                  <p className="text-lg text-gray-500 mt-2">Closed</p>
                </div>
                <div className="text-center">
                  <p className="text-6xl font-bold text-gray-400">
                    {data.action_items_summary.unclear}
                  </p>
                  <p className="text-lg text-gray-500 mt-2">Unclear</p>
                </div>
              </section>

              {data.conflicts_detected.length > 0 && (
                <section className="bg-red-50 border-2 border-red-300 rounded-2xl p-10">
                  <div className="flex items-center justify-center gap-4 mb-6">
                    <AlertTriangle className="w-10 h-10 text-red-600" />
                    <h2 className="text-3xl font-bold text-red-900">Conflicts Detected</h2>
                  </div>
                  <div className="space-y-6">
                    {data.conflicts_detected.map((conflict, idx) => (
                      <div key={idx} className="bg-white rounded-xl p-6 shadow-sm">
                        <p className="text-xl text-gray-900">{conflict.description}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {data.merged_risks.length > 0 && (
                <section>
                  <h2 className="text-3xl font-bold text-gray-900 text-center mb-8">Key Risks</h2>
                  <div className="space-y-6">
                    {data.merged_risks.slice(0, 5).map((risk, idx) => (
                      <div key={idx} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                        <p className="text-lg font-medium text-gray-900">{risk.risk}</p>
                        <div className="flex items-center justify-between mt-4">
                          <span
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                              risk.severity_hint === 'explicit'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {risk.severity_hint === 'explicit' ? 'Explicit' : 'Implied'}
                          </span>
                          <span
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
                            style={{
                              backgroundColor: `${TREND_COLORS[risk.trend]}20`,
                              color: TREND_COLORS[risk.trend]
                            }}
                          >
                            {risk.trend.charAt(0).toUpperCase() + risk.trend.slice(1)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        ) : (
          <ReportContent />
        )}
      </main>
    </div>
  );
}
