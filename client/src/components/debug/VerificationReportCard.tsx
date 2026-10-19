import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Play,
  Layers,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Activity,
  AlertOctagon,
  FileCheck2,
  Download,
} from 'lucide-react';
import {
  DetailedVerificationStatus,
  TestCaseResult,
  RegressionReport,
  VerificationChecks,
  VerificationStatusType,
  VerificationCategory,
  StaticChecksReport,
  DownloadableTestFile,
} from '../../types';
import { Badge } from '../common/Badge';

interface VerificationReportCardProps {
  verificationStatus?: VerificationStatusType;
  detailedStatus?: DetailedVerificationStatus;
  category?: VerificationCategory;
  statusReason?: string;
  summary?: string;
  checks?: VerificationChecks;
  staticChecks?: StaticChecksReport;
  downloadableTestFile?: DownloadableTestFile | null;
  testResults?: TestCaseResult[];
  regressionReport?: RegressionReport;
  className?: string;
}

export const VerificationReportCard: React.FC<VerificationReportCardProps> = ({
  verificationStatus = 'FIX NOT VERIFIED',
  detailedStatus = 'EXECUTION_PASSED',
  category,
  statusReason = '',
  summary = '',
  checks,
  staticChecks,
  downloadableTestFile,
  testResults = [],
  regressionReport,
  className = '',
}) => {
  const [showTestDetails, setShowTestDetails] = useState(true);

  // Derive status badge styling and truthful text based on category and detailedStatus
  const getStatusPresentation = () => {
    const effectiveCategory = category || detailedStatus;
    switch (effectiveCategory) {
      case 'TESTS_PASSED_VERIFIED':
      case 'TESTS_PASSED':
        return {
          badgeVariant: 'success' as const,
          badgeText: 'TESTS PASSED & VERIFIED (CONTAINER)',
          icon: <CheckCircle2 size={18} className="text-emerald-600" />,
          cardBorder: 'border-emerald-200 bg-emerald-50/20',
          headerBg: 'bg-emerald-50/80 border-emerald-200 text-emerald-900',
        };
      case 'EXECUTION_PASSED_NO_ASSERTIONS':
      case 'EXECUTION_PASSED':
        return {
          badgeVariant: 'primary' as const,
          badgeText: 'EXECUTION PASSED (NO ASSERTIONS)',
          icon: <Play size={18} className="text-blue-600" />,
          cardBorder: 'border-blue-200 bg-blue-50/20',
          headerBg: 'bg-blue-50/80 border-blue-200 text-blue-900',
        };
      case 'TESTS_GENERATED_NOT_RUN':
        return {
          badgeVariant: 'warning' as const,
          badgeText: 'TESTS GENERATED (NOT RUN - SANDBOX UNAVAILABLE)',
          icon: <AlertTriangle size={18} className="text-amber-600" />,
          cardBorder: 'border-amber-200 bg-amber-50/20',
          headerBg: 'bg-amber-50/80 border-amber-200 text-amber-900',
        };
      case 'STATIC_CHECK_PASSED':
        return {
          badgeVariant: 'primary' as const,
          badgeText: 'STATIC CHECK PASSED (NO EXECUTION)',
          icon: <ShieldCheck size={18} className="text-indigo-600" />,
          cardBorder: 'border-indigo-200 bg-indigo-50/20',
          headerBg: 'bg-indigo-50/80 border-indigo-200 text-indigo-900',
        };
      case 'STATIC_CHECK_FAILED':
        return {
          badgeVariant: 'danger' as const,
          badgeText: 'STATIC CHECK FAILED',
          icon: <XCircle size={18} className="text-rose-600" />,
          cardBorder: 'border-rose-200 bg-rose-50/20',
          headerBg: 'bg-rose-50/80 border-rose-200 text-rose-900',
        };
      case 'EXECUTION_UNAVAILABLE':
        return {
          badgeVariant: 'warning' as const,
          badgeText: 'EXECUTION UNAVAILABLE (CONTAINER REQUIRED)',
          icon: <AlertTriangle size={18} className="text-amber-600" />,
          cardBorder: 'border-amber-200 bg-amber-50/20',
          headerBg: 'bg-amber-50/80 border-amber-200 text-amber-900',
        };
      case 'PARTIALLY_VERIFIED':
      case 'SUGGESTED':
        return {
          badgeVariant: 'warning' as const,
          badgeText: detailedStatus === 'SUGGESTED' ? 'SUGGESTED FIX (UNTESTED)' : 'PARTIALLY VERIFIED',
          icon: <AlertTriangle size={18} className="text-amber-600" />,
          cardBorder: 'border-amber-200 bg-amber-50/20',
          headerBg: 'bg-amber-50/80 border-amber-200 text-amber-900',
        };
      case 'TIMEOUT':
        return {
          badgeVariant: 'danger' as const,
          badgeText: 'EXECUTION TIMED OUT',
          icon: <Clock size={18} className="text-rose-600" />,
          cardBorder: 'border-rose-200 bg-rose-50/20',
          headerBg: 'bg-rose-50/80 border-rose-200 text-rose-900',
        };
      case 'VERIFICATION_ERROR':
      case 'INFRASTRUCTURE_ERROR':
        return {
          badgeVariant: 'danger' as const,
          badgeText: 'VERIFICATION ERROR',
          icon: <AlertOctagon size={18} className="text-rose-600" />,
          cardBorder: 'border-rose-200 bg-rose-50/20',
          headerBg: 'bg-rose-50/80 border-rose-200 text-rose-900',
        };
      case 'TESTS_FAILED_VERIFIED':
      case 'VERIFICATION_FAILED':
      default:
        return {
          badgeVariant: 'danger' as const,
          badgeText: 'VERIFICATION FAILED',
          icon: <XCircle size={18} className="text-rose-600" />,
          cardBorder: 'border-rose-200 bg-rose-50/20',
          headerBg: 'bg-rose-50/80 border-rose-200 text-rose-900',
        };
    }
  };

  const handleDownloadTests = () => {
    if (!downloadableTestFile) return;
    const blob = new Blob([downloadableTestFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadableTestFile.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const presentation = getStatusPresentation();
  const passedTestsCount = testResults.filter((t) => t.passed === true).length;
  const failedTestsCount = testResults.filter((t) => t.passed === false).length;

  return (
    <div className={`verification-report-card rounded-xl border ${presentation.cardBorder} overflow-hidden shadow-sm ${className}`}>
      {/* Header Row */}
      <div className={`px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b ${presentation.headerBg}`}>
        <div className="flex items-center gap-2.5">
          {presentation.icon}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800 text-sm">Formal Verification Status</h3>
              <Badge variant={presentation.badgeVariant} size="sm" dot>
                {presentation.badgeText}
              </Badge>
            </div>
            {statusReason && (
              <p className="text-xs text-slate-600 mt-0.5">{statusReason}</p>
            )}
          </div>
        </div>

        {/* Verification Check Pills */}
        {checks && (
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span
              className={`px-2 py-0.5 rounded font-mono ${
                checks.syntaxPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}
            >
              Syntax {checks.syntaxPassed ? '✓' : '✗'}
            </span>
            <span
              className={`px-2 py-0.5 rounded font-mono ${
                checks.executionPassed === true
                  ? 'bg-emerald-100 text-emerald-800'
                  : checks.executionPassed === false
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              Execution {checks.executionPassed === true ? '✓' : checks.executionPassed === false ? '✗' : '–'}
            </span>
            {checks.testsPassed !== null && (
              <span
                className={`px-2 py-0.5 rounded font-mono ${
                  checks.testsPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}
              >
                Tests {checks.testsPassed ? '✓' : '✗'}
              </span>
            )}
            {checks.expectedOutputMatched !== null && (
              <span
                className={`px-2 py-0.5 rounded font-mono ${
                  checks.expectedOutputMatched ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}
              >
                Output {checks.expectedOutputMatched ? '✓' : '✗'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body Section */}
      <div className="p-4 space-y-4 bg-white/70">
        {summary && (
          <div className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200 leading-relaxed">
            {summary}
          </div>
        )}

        {/* Static Syntax & Delimiter Analysis Card */}
        {staticChecks && (
          <div className="p-3 rounded-lg bg-indigo-50/30 border border-indigo-200 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck2 size={15} className="text-indigo-600" />
                <span className="font-semibold text-slate-800">Static Checks & Syntax Analysis</span>
              </div>
              <span
                className={`font-semibold font-mono text-[11px] px-2 py-0.5 rounded ${
                  staticChecks.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}
              >
                {staticChecks.passed ? 'STATIC CHECKS PASSED' : 'STATIC CHECKS FAILED'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {staticChecks.checks.map((chk, idx) => (
                <div key={idx} className="flex items-start gap-1.5 p-2 rounded bg-white border border-slate-200">
                  {chk.passed ? (
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={13} className="text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-semibold text-slate-800 text-[11px]">{chk.name}</p>
                    <p className="text-[10px] text-slate-600 leading-tight">{chk.details}</p>
                  </div>
                </div>
              ))}
            </div>

            {staticChecks.errors && staticChecks.errors.length > 0 && (
              <div className="p-2 bg-rose-50 border border-rose-200 rounded text-rose-800 font-mono text-[11px]">
                {staticChecks.errors.join('; ')}
              </div>
            )}

            {staticChecks.disclaimer && (
              <p className="text-[10px] text-slate-500 italic leading-normal border-t border-indigo-100 pt-1.5">
                {staticChecks.disclaimer}
              </p>
            )}
          </div>
        )}

        {/* Test Suite Breakdown */}
        {testResults.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FlaskConical size={16} className="text-blue-600" />
                <h4 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">
                  Test Suite Results ({passedTestsCount}/{testResults.length} Passed)
                </h4>
              </div>

              <div className="flex items-center gap-2">
                {downloadableTestFile && (
                  <button
                    onClick={handleDownloadTests}
                    title={`Download standalone test file: ${downloadableTestFile.filename}`}
                    className="btn btn-outline btn-xs flex items-center gap-1.5 text-slate-700 hover:text-slate-900 border-slate-300 bg-white"
                  >
                    <Download size={13} className="text-blue-600" />
                    <span>Download Tests ({downloadableTestFile.filename})</span>
                  </button>
                )}
                <button
                  onClick={() => setShowTestDetails(!showTestDetails)}
                  className="btn btn-ghost btn-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                >
                  <span>{showTestDetails ? 'Collapse' : 'Expand'}</span>
                  {showTestDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              </div>
            </div>

            {showTestDetails && (
              <div className="test-cases-list space-y-2">
                {testResults.map((tc) => {
                  const isPassed = tc.passed === true;
                  const isFailed = tc.passed === false;
                  const isUnavailable = tc.status === 'unavailable';

                  return (
                    <div
                      key={tc.id}
                      className={`p-3 rounded-lg border text-xs transition-colors ${
                        isPassed
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : isFailed
                          ? 'bg-rose-50/50 border-rose-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          {isPassed ? (
                            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                          ) : isFailed ? (
                            <XCircle size={14} className="text-rose-600 shrink-0" />
                          ) : (
                            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                          )}
                          <span className="font-semibold text-slate-800">{tc.name}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-slate-200 text-slate-700">
                            {tc.category.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                              tc.isGenerated ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}
                          >
                            {tc.isGenerated ? 'Auto-Generated' : 'User-Defined'}
                          </span>
                          <span
                            className={`font-semibold ${
                              isPassed
                                ? 'text-emerald-700'
                                : isFailed
                                ? 'text-rose-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {isPassed ? 'PASSED' : isFailed ? 'FAILED' : 'SKIPPED'}
                          </span>
                        </div>
                      </div>

                      <p className="text-slate-600 leading-normal pl-5">{tc.description}</p>

                      {tc.errorMessage && (
                        <div className="mt-1.5 ml-5 p-2 bg-rose-100/70 border border-rose-200 rounded text-[11px] text-rose-800 font-mono">
                          {tc.errorMessage}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Regression Checks Report */}
        {regressionReport && (
          <div className="regression-box p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={15} className="text-indigo-600" />
                <span className="font-semibold text-slate-800">Regression Analysis</span>
              </div>
              <span
                className={`font-semibold ${
                  regressionReport.regressionDetected ? 'text-rose-600 font-bold' : 'text-emerald-600'
                }`}
              >
                {regressionReport.regressionDetected ? 'REGRESSION DETECTED' : '0 REGRESSIONS OBSERVED'}
              </span>
            </div>
            <p className="text-slate-700">{regressionReport.summary}</p>
            <p className="text-[11px] text-slate-500 italic leading-normal">
              {regressionReport.confidenceNote}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
