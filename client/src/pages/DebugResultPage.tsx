import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Code2,
  Columns,
  Terminal,
  Trash2,
  RotateCcw,
  CheckCircle2,
  Clock,
  ShieldCheck,
  FileCode,
} from 'lucide-react';
import { api } from '../services/api';
import { storage } from '../services/storage';
import { useToast } from '../context/ToastContext';
import { Badge } from '../components/common/Badge';
import { CodeEditor } from '../components/debug/CodeEditor';
import { DiffViewer } from '../components/debug/DiffViewer';
import { ExecutionTerminal } from '../components/debug/ExecutionTerminal';
import { LineDiagnosisViewer } from '../components/debug/LineDiagnosisViewer';
import { VerificationReportCard } from '../components/debug/VerificationReportCard';
import { Skeleton } from '../components/common/Skeleton';

export const DebugResultPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'explanation' | 'diff' | 'code' | 'terminal'>('diff');

  useEffect(() => {
    if (!id) return;
    const fetchSession = async () => {
      try {
        const data = await api.history.get(id);
        setSession(data);
      } catch (err: any) {
        error(err.message || 'Failed to load session details.');
        navigate('/history');
      } finally {
        setLoading(false);
      }
    };
    fetchSession();
  }, [id, navigate, error]);

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this debugging session?')) return;
    try {
      if (id) await api.history.delete(id);
      success('Session deleted successfully.');
      navigate('/history');
    } catch (err: any) {
      error(err.message || 'Failed to delete session.');
    }
  };

  const handleOpenInWorkspace = () => {
    if (!session) return;
    storage.savePendingWork({
      sourceCode: session.sourceCode,
      language: session.language,
      errorDescription: session.errorDescription || '',
      expectedOutput: session.expectedOutput || '',
      testCases: session.testCases || '',
    });
    navigate('/debug');
  };

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-4">
        <Skeleton height={40} width={200} />
        <Skeleton height={150} />
        <Skeleton height={350} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-8 text-center">
        <h3>Session not found</h3>
        <Link to="/history" className="btn btn-primary mt-4">
          Return to History
        </Link>
      </div>
    );
  }

  return (
    <div className="session-detail-page">
      {/* Top Breadcrumb & Action Row */}
      <div className="session-top-nav">
        <button onClick={() => navigate('/history')} className="btn btn-ghost btn-sm">
          <ArrowLeft size={16} />
          <span>Back to History</span>
        </button>

        <div className="flex items-center gap-2">
          <button onClick={handleOpenInWorkspace} className="btn btn-primary btn-sm">
            <RotateCcw size={15} />
            <span>Open in Workspace</span>
          </button>
          <button onClick={handleDelete} className="btn btn-ghost btn-sm text-rose-500 hover:bg-rose-50">
            <Trash2 size={15} />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Session Title Header Card */}
      <div className="content-card session-summary-header mt-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-semibold text-slate-500">{session.id}</span>
              <Badge variant="outline" size="sm">
                {session.language}
              </Badge>
              <Badge
                variant={
                  session.verificationStatus === 'FIX VERIFIED' || (session.verified && !session.verificationStatus)
                    ? 'success'
                    : session.verificationStatus === 'FIX PARTIALLY VERIFIED'
                    ? 'warning'
                    : 'danger'
                }
                dot
                size="sm"
              >
                {session.verificationStatus || (session.verified ? 'FIX VERIFIED' : 'FIX NOT VERIFIED')}
              </Badge>
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              {session.errorDescription || 'Debugging Session'}
            </h1>
            <span className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Clock size={12} /> Recorded on {new Date(session.createdAt).toLocaleString()}
            </span>
          </div>

          <div className="header-meta-right flex gap-3">
            <div className="meta-metric-chip">
              <span className="meta-label">Exit Status</span>
              <span className="meta-val">{session.correctedRun?.status || 'N/A'}</span>
            </div>
            <div className="meta-metric-chip">
              <span className="meta-label">Sandbox Time</span>
              <span className="meta-val">{session.correctedRun?.durationMs ?? 0}ms</span>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="session-tabs-row mt-6">
          <button
            onClick={() => setActiveTab('diff')}
            className={`session-tab-btn ${activeTab === 'diff' ? 'active' : ''}`}
          >
            <Columns size={16} />
            <span>Before & After Diff</span>
          </button>
          <button
            onClick={() => setActiveTab('explanation')}
            className={`session-tab-btn ${activeTab === 'explanation' ? 'active' : ''}`}
          >
            <Sparkles size={16} />
            <span>Diagnosis & Root Cause</span>
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`session-tab-btn ${activeTab === 'code' ? 'active' : ''}`}
          >
            <Code2 size={16} />
            <span>Full Corrected Code</span>
          </button>
          <button
            onClick={() => setActiveTab('terminal')}
            className={`session-tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
          >
            <Terminal size={16} />
            <span>Execution Terminal</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="session-tab-body mt-5">
        {activeTab === 'diff' && (
          <DiffViewer
            originalCode={session.sourceCode}
            correctedCode={session.correctedCode}
            language={session.language}
          />
        )}

        {activeTab === 'explanation' && (
          <div className="space-y-4">
            <div className="content-card p-6 space-y-4">
              <div className="explanation-section">
                <h3 className="font-semibold text-slate-800 text-base mb-1">Simple English Explanation</h3>
                <p className="text-slate-700 leading-relaxed text-sm bg-slate-50 p-4 rounded-lg border border-slate-200">
                  {session.diagnosis}
                </p>
              </div>

              <div className="explanation-section">
                <h3 className="font-semibold text-slate-800 text-base mb-1">Technical Root Cause</h3>
                <p className="text-slate-700 font-mono text-xs bg-slate-900 text-slate-200 p-4 rounded-lg">
                  {session.rootCause}
                </p>
              </div>
            </div>

            <VerificationReportCard
              verificationStatus={session.verificationStatus}
              detailedStatus={session.detailedStatus}
              category={session.category}
              statusReason={session.statusReason}
              summary={session.verificationSummary}
              checks={session.checks}
              staticChecks={session.staticChecks}
              downloadableTestFile={session.downloadableTestFile}
              testResults={session.testResults}
              regressionReport={session.regressionReport}
            />

            {session.lineDiagnoses && session.lineDiagnoses.length > 0 && (
              <div className="content-card p-6">
                <LineDiagnosisViewer
                  diagnoses={session.lineDiagnoses}
                  language={session.language}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'code' && (
          <div className="content-card p-4">
            <CodeEditor
              value={session.correctedCode}
              language={session.language}
              readOnly={true}
              minHeight="450px"
            />
          </div>
        )}

        {activeTab === 'terminal' && (
          <ExecutionTerminal
            originalRun={session.originalRun}
            correctedRun={session.correctedRun}
          />
        )}
      </div>
    </div>
  );
};
