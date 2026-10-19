import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Code2,
  Terminal,
  FileCode2,
  CheckCircle2,
  Copy,
  ChevronDown,
  Upload,
  RefreshCw,
  Info,
  Check,
  Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../services/api';
import { storage } from '../services/storage';
import { DebugResult, LanguageDetectionResult } from '../types';
import { CodeEditor } from '../components/debug/CodeEditor';
import { DiffViewer } from '../components/debug/DiffViewer';
import { ExecutionTerminal } from '../components/debug/ExecutionTerminal';
import { WorkPreservedBanner } from '../components/debug/WorkPreservedBanner';
import { LineDiagnosisViewer } from '../components/debug/LineDiagnosisViewer';
import { VerificationReportCard } from '../components/debug/VerificationReportCard';
import { Badge } from '../components/common/Badge';

export const DebugWorkspacePage: React.FC = () => {
  const { guestStatus, isAuthenticated, openLoginModal, updateGuestStatus } = useAuth();
  const { success, error, info } = useToast();
  const navigate = useNavigate();

  // Form State
  const [language, setLanguage] = useState<string>('python');
  const [sourceCode, setSourceCode] = useState('');
  const [errorDescription, setErrorDescription] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [testCases, setTestCases] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto-detection State
  const [detection, setDetection] = useState<LanguageDetectionResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const detectTimeoutRef = useRef<any>(null);

  // Execution & UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasPreservedWork, setHasPreservedWork] = useState(false);
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);
  const [showRetryDetails, setShowRetryDetails] = useState(false);

  // Restore preserved work on mount if present
  useEffect(() => {
    const saved = storage.getPendingWork();
    if (saved && saved.sourceCode) {
      setSourceCode(saved.sourceCode);
      setLanguage(saved.language || 'python');
      setErrorDescription(saved.errorDescription || '');
      setExpectedOutput(saved.expectedOutput || '');
      setTestCases(saved.testCases || '');
      setHasPreservedWork(true);
    }
  }, []);

  // Trigger language auto-detection when source code changes
  const runAutoDetect = async (code: string, filename?: string) => {
    if (!code || code.trim().length < 15) {
      setDetection(null);
      return;
    }

    setIsDetecting(true);
    try {
      const res = await api.languages.detect({ code, filename });
      setDetection(res);
    } catch {
      // Ignore background detection errors
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSourceCodeChange = (val: string) => {
    setSourceCode(val);

    // Sync draft work
    storage.savePendingWork({
      sourceCode: val,
      language,
      errorDescription,
      expectedOutput,
      testCases,
    });

    // Debounce language auto-detection
    if (detectTimeoutRef.current) {
      clearTimeout(detectTimeoutRef.current);
    }
    detectTimeoutRef.current = setTimeout(() => {
      runAutoDetect(val);
    }, 450);
  };

  const handleApplyDetectedLanguage = () => {
    if (detection?.detectedLanguage) {
      setLanguage(detection.detectedLanguage);
      info(`Switched language to ${detection.languageName}.`);
      setDetection(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content !== undefined) {
        setSourceCode(content);
        runAutoDetect(content, file.name);
        info(`Loaded ${file.name} into workspace.`);
      }
    };
    reader.readAsText(file);
    // Reset file input value
    e.target.value = '';
  };

  const handleDismissBanner = () => {
    storage.clearPendingWork();
    setHasPreservedWork(false);
  };

  const handleLoadSample = (sampleType: string) => {
    switch (sampleType) {
      case 'typescript': {
        setLanguage('typescript');
        const code = `function add(a: number, b: number): number {\n    return a - b; // Logic error: minus instead of plus\n}\n\nconsole.log("Result:", add(2, 3));`;
        setSourceCode(code);
        setErrorDescription('Subtracts numbers instead of adding them');
        setExpectedOutput('Result: 5');
        setTestCases('if (add(2, 3) !== 5) throw new Error("Test failed");\nconsole.log("TESTS_PASSED");');
        info('Loaded TypeScript sample bug.');
        break;
      }
      case 'sql': {
        setLanguage('sql');
        const code = `-- Broken query missing FROM clause\nSELECT id, name WHERE active = 1;`;
        setSourceCode(code);
        setErrorDescription('SQLite Error: no such column or missing FROM clause');
        setExpectedOutput('');
        setTestCases('');
        info('Loaded SQL sample bug.');
        break;
      }
      case 'java': {
        setLanguage('java');
        const code = `public class Main {\n    public static void main(String[] args) {\n        String a = new String("hello");\n        String b = new String("hello");\n        // Bug: == compares references instead of string content\n        if (a == b) {\n            System.out.println("Strings match");\n        } else {\n            System.out.println("Strings do not match");\n        }\n    }\n}`;
        setSourceCode(code);
        setErrorDescription('String comparison logic bug: compares references using == instead of .equals()');
        setExpectedOutput('Strings match');
        setTestCases('');
        info('Loaded Java sample bug.');
        break;
      }
      case 'c': {
        setLanguage('c');
        const code = `#include <stdio.h>\n\nint main(void) {\n    int sum = 0;\n    // Syntax defect: missing semicolon\n    printf("Calculating sum...\\n")\n    for (int i = 1; i <= 5; i++) {\n        sum += i;\n    }\n    printf("Sum: %d\\n", sum);\n    return 0;\n}`;
        setSourceCode(code);
        setErrorDescription("error: expected ';' before 'for'");
        setExpectedOutput('Sum: 15');
        setTestCases('');
        info('Loaded C sample bug.');
        break;
      }
      case 'cpp': {
        setLanguage('cpp');
        const code = `#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> nums = {10, 20, 30};\n    // Syntax bug: missing semicolon after stream insertion\n    std::cout << "Vector size: " << nums.size() << std::endl\n    return 0;\n}`;
        setSourceCode(code);
        setErrorDescription("error: expected ';' before 'return'");
        setExpectedOutput('');
        setTestCases('');
        info('Loaded C++ sample bug.');
        break;
      }
      default: {
        // Python default
        setLanguage('python');
        const code = `def binary_search(arr, target):\n    low = 0\n    high = len(arr)\n    while low <= high:\n        mid = (low + high) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1\n\nnums = [1, 3, 5, 7, 9, 11]\nprint("Index of 11:", binary_search(nums, 11))`;
        setSourceCode(code);
        setErrorDescription('IndexError: list index out of range in binary search');
        setExpectedOutput('Index of 11: 5');
        setTestCases('assert binary_search([1, 3, 5, 7, 9, 11], 11) == 5\nprint("ALL_TESTS_PASSED")');
        info('Loaded Python sample bug.');
        break;
      }
    }
  };

  const handleAnalyzeAndFix = async () => {
    if (!sourceCode.trim()) {
      error('Please write or paste source code to debug.');
      return;
    }

    storage.savePendingWork({
      sourceCode,
      language,
      errorDescription,
      expectedOutput,
      testCases,
    });

    if (!isAuthenticated && guestStatus.remainingUses <= 0) {
      openLoginModal();
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await api.debug.submit({
        language,
        sourceCode,
        errorDescription: errorDescription.trim() || undefined,
        expectedOutput: expectedOutput.trim() || undefined,
        testCases: testCases.trim() || undefined,
      });

      setDebugResult(result);

      if (!isAuthenticated && result.guestStatus) {
        updateGuestStatus(result.guestStatus);
      }

      if (result.verificationStatus === 'FIX VERIFIED') {
        success('Fix verified successfully in sandbox with passing tests!');
      } else if (result.verificationStatus === 'FIX PARTIALLY VERIFIED') {
        info('Fix partially verified (static analysis passed; execution toolchain not installed on host).');
      } else {
        error('Fix not verified: code failed tests or could not pass sandbox execution.');
      }

      storage.clearPendingWork();
      setHasPreservedWork(false);

      setTimeout(() => {
        const el = document.getElementById('debug-results-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      if (err instanceof ApiError && (err.status === 403 || err.code === 'LOGIN_REQUIRED')) {
        updateGuestStatus({
          usageCount: 2,
          maxUses: 2,
          remainingUses: 0,
          isExhausted: true,
          message: 'You have used your 2 free debugging attempts.',
        });
        openLoginModal();
      } else {
        error(err.message || 'Debugging analysis failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartNew = () => {
    setDebugResult(null);
    setSourceCode('');
    setErrorDescription('');
    setExpectedOutput('');
    setTestCases('');
    setDetection(null);
    storage.clearPendingWork();
    setHasPreservedWork(false);
  };

  const getStatusBadgeVariant = (status?: string) => {
    switch (status) {
      case 'FIX VERIFIED':
      case 'TESTS_PASSED':
        return 'success';
      case 'EXECUTION_PASSED':
      case 'STATIC_CHECK_PASSED':
        return 'primary';
      case 'FIX PARTIALLY VERIFIED':
      case 'PARTIALLY_VERIFIED':
      case 'SUGGESTED':
        return 'warning';
      case 'FIX NOT VERIFIED':
      case 'VERIFICATION_FAILED':
      case 'TIMEOUT':
      case 'INFRASTRUCTURE_ERROR':
      case 'EXECUTION_UNAVAILABLE':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="workspace-page-container">
      {/* Work Preserved Alert Banner */}
      {hasPreservedWork && (
        <WorkPreservedBanner
          onContinue={handleAnalyzeAndFix}
          onDismiss={handleDismissBanner}
        />
      )}

      {/* Workspace Header */}
      <div className="workspace-header-bar">
        <div>
          <h1 className="workspace-title">Multi-Language Debugging Workspace</h1>
          <p className="workspace-desc">
            Supports 16 programming languages with automatic language detection, sandboxed execution, and iterative feedback repair.
          </p>
        </div>

        <div className="workspace-header-tools flex items-center gap-2">
          {/* Sample bug selector */}
          <select
            onChange={(e) => handleLoadSample(e.target.value)}
            className="select-field text-xs py-1"
            defaultValue=""
          >
            <option value="" disabled>Load Sample Bug...</option>
            <option value="python">Python 3 (Binary Search)</option>
            <option value="typescript">TypeScript (Arithmetic Logic Bug)</option>
            <option value="java">Java (String Reference Bug)</option>
            <option value="c">C (Missing Semicolon Bug)</option>
            <option value="cpp">C++ (Stream Insertion Bug)</option>
            <option value="sql">SQL (Missing Relation)</option>
            <option value="html">HTML5 (Tag Imbalance)</option>
          </select>

          {/* File Upload Button */}
          <label className="btn btn-outline btn-sm cursor-pointer" title="Upload source file to debug">
            <Upload size={14} />
            <span>Upload File</span>
            <input
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              accept=".py,.js,.ts,.tsx,.sql,.html,.css,.java,.cpp,.c,.cs,.go,.rs,.php,.rb,.kt,.swift"
            />
          </label>

          <button
            onClick={handleStartNew}
            className="btn btn-ghost btn-sm"
            title="Clear workspace inputs"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Split Grid */}
      <div className="workspace-layout-grid">
        {/* Left Side: Code Input & Error Metadata */}
        <div className="workspace-input-col">
          <div className="card-panel">
            <div className="panel-subhead">
              <div className="flex items-center gap-2">
                <Code2 size={18} className="text-blue-500" />
                <span className="font-semibold text-slate-800 text-sm">Source Code Input</span>
              </div>

              {/* Language Selector */}
              <div className="language-selector-wrap">
                <select
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    setDetection(null);
                  }}
                  className="select-field font-medium text-xs"
                  aria-label="Programming Language"
                >
                  <optgroup label="Core Languages (Adapters)">
                    <option value="python">Python 3 (Isolated Runtime)</option>
                    <option value="javascript">JavaScript (Node.js)</option>
                    <option value="typescript">TypeScript (Type-Strip)</option>
                    <option value="java">Java (Toolchain / Static Analysis)</option>
                    <option value="c">C (Toolchain / Static Analysis)</option>
                    <option value="cpp">C++ (Toolchain / Static Analysis)</option>
                  </optgroup>
                  <optgroup label="Database & Web">
                    <option value="sql">SQL (SQLite In-Memory)</option>
                    <option value="html">HTML5 (DOM Structure)</option>
                    <option value="css">CSS3 (Syntax & Rules)</option>
                  </optgroup>
                  <optgroup label="Other Supported Languages">
                    <option value="csharp">C# (Static Analysis)</option>
                    <option value="go">Go (Static Analysis)</option>
                    <option value="rust">Rust (Static Analysis)</option>
                    <option value="php">PHP (Static Analysis)</option>
                    <option value="ruby">Ruby (Static Analysis)</option>
                    <option value="kotlin">Kotlin (Static Analysis)</option>
                    <option value="swift">Swift (Static Analysis)</option>
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Auto-Detection & Ambiguity Notification Pill */}
            {detection && (
              <div
                className={`mt-2 mb-2 p-2.5 rounded-lg text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 ${
                  detection.isUncertain || detection.isAmbiguous
                    ? 'bg-amber-50 text-amber-900 border border-amber-200'
                    : 'bg-blue-50 text-blue-900 border border-blue-200'
                }`}
              >
                <div className="flex items-start sm:items-center gap-1.5">
                  <Sparkles
                    size={14}
                    className={
                      detection.isUncertain || detection.isAmbiguous
                        ? 'text-amber-600 mt-0.5 sm:mt-0'
                        : 'text-blue-600 mt-0.5 sm:mt-0'
                    }
                  />
                  <span>{detection.message}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {detection.ambiguousOptions && detection.ambiguousOptions.length > 0 ? (
                    detection.ambiguousOptions.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setLanguage(opt);
                          info(`Confirmed language: ${opt.toUpperCase()}`);
                          setDetection(null);
                        }}
                        className={`btn btn-xs py-0.5 px-2 ${
                          language === opt ? 'btn-primary font-bold' : 'btn-outline'
                        }`}
                      >
                        Confirm {opt.toUpperCase()}
                      </button>
                    ))
                  ) : (
                    detection.detectedLanguage &&
                    detection.detectedLanguage !== language && (
                      <button
                        type="button"
                        onClick={handleApplyDetectedLanguage}
                        className="btn btn-primary btn-xs py-0.5 px-2 text-xs"
                      >
                        Switch to {detection.languageName}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

            <div className="editor-wrap">
              <CodeEditor
                value={sourceCode}
                onChange={handleSourceCodeChange}
                language={language}
                placeholder={`# Paste, write, or upload your ${language} code here...`}
                minHeight="340px"
                errorLines={debugResult?.affectedLines}
              />
            </div>

            {/* Error Description Field */}
            <div className="form-group mt-4">
              <label htmlFor="error-desc" className="form-label flex items-center gap-1.5">
                <span>Observed Error or Unexpected Behavior</span>
                <span className="text-xs text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                id="error-desc"
                type="text"
                value={errorDescription}
                onChange={(e) => setErrorDescription(e.target.value)}
                placeholder="e.g. TypeError, SyntaxError, or logic bug description"
                className="form-input"
              />
            </div>

            {/* Advanced Verification Assertions Dropdown */}
            <div className="advanced-accordion mt-3">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="accordion-toggle"
              >
                <span>Advanced: Expected Output & Test Assertions</span>
                <ChevronDown
                  size={16}
                  className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                />
              </button>

              {showAdvanced && (
                <div className="accordion-content">
                  <div className="form-group mb-3">
                    <label htmlFor="expected-output" className="form-label text-xs">
                      Expected Standard Output
                    </label>
                    <input
                      id="expected-output"
                      type="text"
                      value={expectedOutput}
                      onChange={(e) => setExpectedOutput(e.target.value)}
                      placeholder="e.g. 5 or Result: [1, 2, 3]"
                      className="form-input text-sm"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="test-cases" className="form-label text-xs">
                      Verification Test Assertions
                    </label>
                    <textarea
                      id="test-cases"
                      value={testCases}
                      onChange={(e) => setTestCases(e.target.value)}
                      placeholder="Custom test assertions to append during verification..."
                      className="form-input font-mono text-xs"
                      rows={3}
                      spellCheck="false"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="panel-actions-bar mt-5">
              <button
                onClick={handleAnalyzeAndFix}
                disabled={isSubmitting || !sourceCode.trim()}
                className="btn btn-primary btn-lg w-full"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="btn-spinner" />
                    <span>Analyzing & Verifying Sandbox...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles size={18} />
                    <span>Analyze & Fix Code</span>
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Results & Verification */}
        <div className="workspace-output-col">
          {!debugResult ? (
            <div className="empty-workspace-placeholder">
              <div className="placeholder-icon-wrap">
                <Terminal size={38} className="text-slate-400" />
              </div>
              <h3 className="placeholder-title">Awaiting Analysis</h3>
              <p className="placeholder-desc">
                Paste code or upload a source file on the left and click <strong>Analyze & Fix Code</strong> to generate
                a root-cause explanation, before-and-after diff, and execute sandboxed verification.
              </p>
              <div className="placeholder-features-list">
                <div className="feature-bullet">
                  <CheckCircle2 size={16} className="text-blue-500" />
                  <span>Automatic language detection from syntax & extensions</span>
                </div>
                <div className="feature-bullet">
                  <CheckCircle2 size={16} className="text-blue-500" />
                  <span>Iterative feedback repair loop with retry history</span>
                </div>
                <div className="feature-bullet">
                  <CheckCircle2 size={16} className="text-blue-500" />
                  <span>Rigorous verification status: Verified, Partially Verified, or Not Verified</span>
                </div>
              </div>
            </div>
          ) : (
            <div id="debug-results-section" className="debug-results-container space-y-5">
              {/* Diagnosis Summary Card */}
              <div className="card-panel diagnosis-result-card">
                <div className="result-header-row">
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-blue-500" />
                    <h3 className="font-semibold text-slate-800">Root-Cause Diagnosis</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" size="sm">
                      {debugResult.provider === 'mock' || !debugResult.provider
                        ? 'ENGINE: MOCK'
                        : `AI: ${debugResult.provider.toUpperCase()}`}
                    </Badge>
                    <Badge
                      variant={debugResult.confidence === 'high' ? 'success' : 'warning'}
                      size="sm"
                    >
                      {debugResult.confidence.toUpperCase()} CONFIDENCE
                    </Badge>
                    <Badge
                      variant={getStatusBadgeVariant(debugResult.verificationStatus)}
                      dot
                      size="sm"
                    >
                      {debugResult.verificationStatus || (debugResult.verified ? 'FIX VERIFIED' : 'FIX NOT VERIFIED')}
                    </Badge>
                  </div>
                </div>

                <div className="diagnosis-text-body mt-3">
                  <p className="simple-explanation">{debugResult.diagnosis}</p>
                  <div className="technical-cause-box mt-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Technical Root Cause
                    </span>
                    <p className="text-sm text-slate-700 font-mono">{debugResult.rootCause}</p>
                  </div>
                  {debugResult.affectedLines && debugResult.affectedLines.length > 0 && (
                    <div className="affected-lines-tag mt-2 text-xs text-slate-500">
                      Affected Lines: <span className="font-mono font-bold text-slate-700">{debugResult.affectedLines.join(', ')}</span>
                    </div>
                  )}
                </div>

                {/* Iterative Retry & Repair Section */}
                {debugResult.attempts && debugResult.attempts.length > 1 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <button
                      onClick={() => setShowRetryDetails(!showRetryDetails)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <RefreshCw size={12} className={showRetryDetails ? 'rotate-180 transition-transform' : ''} />
                      <span>Automatic Feedback Repair: {debugResult.retryCount} retries performed</span>
                    </button>

                    {showRetryDetails && (
                      <div className="mt-2 space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                        {debugResult.attempts.map((att, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="font-mono font-bold text-slate-600">Attempt {att.attemptNumber}:</span>
                            <span className={att.passed ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                              {att.runStatus.toUpperCase()} {att.passed ? '✓ Passed tests' : '✗ Tests failed, fed back to engine'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Line-by-Line Diagnosis Section */}
              {debugResult.lineDiagnoses && debugResult.lineDiagnoses.length > 0 && (
                <LineDiagnosisViewer
                  diagnoses={debugResult.lineDiagnoses}
                  language={language}
                />
              )}

              {/* Formal Verification & Test Suite Report */}
              <VerificationReportCard
                verificationStatus={debugResult.verificationStatus}
                detailedStatus={debugResult.detailedStatus}
                category={debugResult.category}
                statusReason={debugResult.statusReason}
                summary={debugResult.verificationSummary}
                checks={debugResult.checks}
                staticChecks={debugResult.staticChecks}
                downloadableTestFile={debugResult.downloadableTestFile || debugResult.testDownload}
                testResults={debugResult.testResults}
                regressionReport={debugResult.regressionReport}
              />

              {/* Interactive Diff Viewer */}
              <DiffViewer
                originalCode={sourceCode}
                correctedCode={debugResult.correctedCode}
                structuredDiff={debugResult.structuredDiff}
                language={language}
              />

              {/* Sandboxed Execution Terminal */}
              <ExecutionTerminal
                originalRun={debugResult.originalRun}
                correctedRun={debugResult.correctedRun}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
