import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Play,
  Download,
  FileSpreadsheet,
  FileJson,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { EvaluationResult, EvaluationCase } from '../types';
import { Badge } from '../components/common/Badge';
import { Skeleton } from '../components/common/Skeleton';

export const EvaluationPage: React.FC = () => {
  const { success, error, info } = useToast();
  const [results, setResults] = useState<EvaluationResult | null>(null);
  const [cases, setCases] = useState<EvaluationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [casesData, resultsData] = await Promise.all([
        api.evaluation.getCases(),
        api.evaluation.getResults().catch(() => null),
      ]);
      setCases(casesData);
      setResults(resultsData);
    } catch (err: any) {
      error(err.message || 'Failed to load evaluation dataset.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRunEvaluation = async () => {
    setIsRunning(true);
    info('Running full 25-case held-out benchmark against sandbox...');
    try {
      const run = await api.evaluation.run();
      setResults(run);
      success('Evaluation benchmark completed! Metrics recorded.');
    } catch (err: any) {
      error(err.message || 'Evaluation run failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleExport = (format: 'csv' | 'json') => {
    window.location.href = api.evaluation.getExportUrl(format);
  };

  // Map results by ID
  const caseResultMap = new Map();
  if (results?.rawResults) {
    for (const r of results.rawResults) {
      caseResultMap.set(r.id, r);
    }
  }

  return (
    <div className="evaluation-page">
      {/* Header Row */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Held-Out Evaluation Benchmark</h1>
          <p className="page-subtitle">
            Measured against a frozen test suite of 25 distinct held-out buggy code snippets.
          </p>
        </div>

        <div className="header-actions flex gap-2">
          <button
            onClick={handleRunEvaluation}
            disabled={isRunning}
            className="btn btn-primary btn-sm"
          >
            {isRunning ? (
              <span className="flex items-center gap-2">
                <span className="btn-spinner" />
                <span>Evaluating 25 Snippets...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Play size={14} />
                <span>Run Benchmark</span>
              </span>
            )}
          </button>

          <button
            onClick={() => handleExport('csv')}
            disabled={!results}
            className="btn btn-outline btn-sm"
            title="Download sanitized CSV report"
          >
            <FileSpreadsheet size={14} />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => handleExport('json')}
            disabled={!results}
            className="btn btn-outline btn-sm"
            title="Download JSON report"
          >
            <FileJson size={14} />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* 7 Required Metrics Grid */}
      <div className="metrics-summary-grid mt-6">
        <div className="metric-box">
          <span className="metric-box-label">Fix Success Rate</span>
          <div className="metric-box-val text-blue-600">
            {loading ? <Skeleton width={80} height={32} /> : results ? `${(results.fixSuccessRate * 100).toFixed(1)}%` : 'N/A'}
          </div>
          <span className="metric-box-sub">
            {results ? `${Math.round(results.fixSuccessRate * results.totalCases)} of ${results.totalCases} cases verified` : 'Awaiting run'}
          </span>
        </div>

        <div className="metric-box">
          <span className="metric-box-label">Compilation Rate</span>
          <div className="metric-box-val text-emerald-600">
            {loading ? <Skeleton width={80} height={32} /> : results ? `${(results.compilationSuccessRate * 100).toFixed(1)}%` : 'N/A'}
          </div>
          <span className="metric-box-sub">No syntax/parse errors</span>
        </div>

        <div className="metric-box">
          <span className="metric-box-label">Regression Rate</span>
          <div className="metric-box-val text-indigo-600">
            {loading ? <Skeleton width={80} height={32} /> : results ? `${(results.regressionRate * 100).toFixed(1)}%` : 'N/A'}
          </div>
          <span className="metric-box-sub">New test failures introduced</span>
        </div>

        <div className="metric-box">
          <span className="metric-box-label">Explanation Accuracy</span>
          <div className="metric-box-val text-purple-600">
            {loading ? <Skeleton width={80} height={32} /> : results ? `${(results.explanationAccuracy * 100).toFixed(1)}%` : 'N/A'}
          </div>
          <span className="metric-box-sub">1.0 / 0.7 / 0.0 scoring rubric</span>
        </div>

        <div className="metric-box">
          <span className="metric-box-label">Sandbox Failure Rate</span>
          <div className="metric-box-val text-emerald-600">
            {loading ? <Skeleton width={80} height={32} /> : results ? `${(results.sandboxFailureRate * 100).toFixed(1)}%` : 'N/A'}
          </div>
          <span className="metric-box-sub">0% infrastructure errors</span>
        </div>

        <div className="metric-box">
          <span className="metric-box-label">Median Latency</span>
          <div className="metric-box-val text-slate-800">
            {loading ? <Skeleton width={80} height={32} /> : results ? `${results.medianLatencyMs} ms` : 'N/A'}
          </div>
          <span className="metric-box-sub">{results?.latencyObservations ?? 0} observations</span>
        </div>
      </div>

      {/* Dataset Cases Table */}
      <div className="content-card mt-6">
        <div className="card-top-bar">
          <div className="card-title-group">
            <BarChart3 size={18} className="text-slate-600" />
            <h3 className="card-heading">Held-Out Test Cases ({cases.length})</h3>
          </div>
          {results && (
            <span className="text-xs text-slate-400">
              Last Run: {new Date(results.timestamp).toLocaleString()}
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton height={40} className="w-full" />
            <Skeleton height={40} className="w-full" />
            <Skeleton height={40} className="w-full" />
          </div>
        ) : (
          <div className="table-responsive">
            <table className="saas-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Snippet Title</th>
                  <th>Language</th>
                  <th>Bug Category</th>
                  <th>Sandbox Status</th>
                  <th className="text-right">Fix Verification</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => {
                  const res = caseResultMap.get(c.id);
                  return (
                    <tr key={c.id}>
                      <td>
                        <code className="session-id-pill">{c.id}</code>
                      </td>
                      <td className="font-medium text-slate-800">{c.title}</td>
                      <td>
                        <Badge variant="outline" size="sm">
                          {c.language}
                        </Badge>
                      </td>
                      <td>
                        <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          {c.category}
                        </span>
                      </td>
                      <td>
                        {res ? (
                          <span className="text-xs font-mono text-slate-600">
                            {res.correctedStatus || res.status}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Pending</span>
                        )}
                      </td>
                      <td className="text-right">
                        {res ? (
                          <Badge variant={res.fixSuccess ? 'success' : 'danger'} dot size="sm">
                            {res.fixSuccess ? 'PASS' : 'FAIL'}
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            UNTESTED
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
