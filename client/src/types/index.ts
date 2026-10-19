export interface User {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

export interface GuestStatus {
  usageCount: number;
  maxUses: number;
  remainingUses: number;
  isExhausted: boolean;
  message: string;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  user: User | null;
  guestStatus: GuestStatus;
}

export interface StructuredDiffLine {
  type: 'add' | 'del' | 'normal';
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
}

export interface StructuredDiff {
  hasChanges: boolean;
  additions: number;
  deletions: number;
  lines: StructuredDiffLine[];
}

export interface ExecutionRun {
  status: 'success' | 'compilation_error' | 'runtime_error' | 'timeout' | 'test_failure' | 'infrastructure_error';
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  errorType: string | null;
}

export interface RepairAttempt {
  attemptNumber: number;
  diagnosis: string;
  rootCause: string;
  correctedCode: string;
  confidence: string;
  runStatus: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  passed: boolean;
}

export type VerificationStatusType = 'FIX VERIFIED' | 'FIX PARTIALLY VERIFIED' | 'FIX NOT VERIFIED' | 'ANALYSIS FAILED';

export type DetailedVerificationStatus =
  | 'SUGGESTED'
  | 'STATIC_CHECK_PASSED'
  | 'EXECUTION_PASSED'
  | 'TESTS_PASSED'
  | 'PARTIALLY_VERIFIED'
  | 'VERIFICATION_FAILED'
  | 'EXECUTION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'INFRASTRUCTURE_ERROR';

export type VerificationCategory =
  | 'STATIC_CHECK_PASSED'
  | 'STATIC_CHECK_FAILED'
  | 'TESTS_GENERATED_NOT_RUN'
  | 'EXECUTION_UNAVAILABLE'
  | 'EXECUTION_PASSED_NO_ASSERTIONS'
  | 'TESTS_PASSED_VERIFIED'
  | 'TESTS_FAILED_VERIFIED'
  | 'VERIFICATION_ERROR';

export interface StaticCheckItem {
  name: string;
  passed: boolean;
  details: string;
}

export interface StaticChecksReport {
  passed: boolean;
  errors: string[];
  warnings: string[];
  checks: StaticCheckItem[];
  disclaimer: string;
}

export interface DownloadableTestFile {
  filename: string;
  content: string;
  language: string;
  testCount: number;
}

export interface TestCaseResult {
  id: string;
  name: string;
  category: 'normal' | 'boundary' | 'edge_case' | 'invalid_input' | 'user_defined';
  description: string;
  assertionCode?: string;
  isGenerated: boolean;
  executed: boolean;
  passed: boolean | null;
  status: 'passed' | 'failed' | 'timeout' | 'unavailable' | 'pending';
  errorMessage?: string | null;
}

export interface RegressionReport {
  regressionDetected: boolean;
  passed: number;
  failed: number;
  skipped: number;
  unavailable: number;
  summary: string;
  confidenceNote: string;
}

export interface VerificationChecks {
  syntaxPassed: boolean;
  executionPassed: boolean | null;
  testsPassed: boolean | null;
  expectedOutputMatched: boolean | null;
  regressionPassed: boolean | null;
  toolchainAvailable: boolean;
}

export interface LineDiagnosis {
  lineNumber: number | null;
  lineRange?: [number, number] | null;
  snippet: string;
  explanation: string;
  suggestedCorrection: string;
  whyItWorks: string;
  isUncertain?: boolean;
  confidence?: 'high' | 'medium' | 'low';
}

export interface DebugResult {
  success: boolean;
  sessionId: string;
  diagnosis: string;
  rootCause: string;
  correctedCode: string;
  affectedLines: number[];
  lineDiagnoses?: LineDiagnosis[];
  confidence: 'high' | 'medium' | 'low';
  provider: string;
  diff: string;
  structuredDiff: StructuredDiff;
  originalRun: ExecutionRun;
  correctedRun: ExecutionRun;
  verified: boolean;
  verificationStatus: VerificationStatusType;
  detailedStatus?: DetailedVerificationStatus;
  category?: VerificationCategory;
  resultCategory?: VerificationCategory;
  verificationSummary?: string;
  statusReason?: string;
  checks?: VerificationChecks;
  staticChecks?: StaticChecksReport;
  downloadableTestFile?: DownloadableTestFile | null;
  testDownload?: DownloadableTestFile | null;
  testResults?: TestCaseResult[];
  regressionReport?: RegressionReport;
  attempts?: RepairAttempt[];
  retryCount?: number;
  guestStatus?: GuestStatus;
}

export interface DebugSessionDetail {
  id: string;
  userId: string | null;
  guestSessionId: string | null;
  language: string;
  sourceCode: string;
  sourceCodePreview?: string;
  errorDescription: string;
  expectedOutput: string;
  testCases: string;
  diagnosis: string;
  rootCause: string;
  correctedCode: string;
  diff: string;
  confidence: string | null;
  lineDiagnoses?: LineDiagnosis[];
  durationMs: number | null;
  originalRun: ExecutionRun | null;
  correctedRun: ExecutionRun | null;
  verified: boolean;
  verificationStatus: VerificationStatusType;
  detailedStatus?: DetailedVerificationStatus;
  category?: VerificationCategory;
  resultCategory?: VerificationCategory;
  verificationSummary?: string;
  statusReason?: string;
  checks?: VerificationChecks;
  staticChecks?: StaticChecksReport;
  downloadableTestFile?: DownloadableTestFile | null;
  testResults?: TestCaseResult[];
  regressionReport?: RegressionReport;
  attempts?: RepairAttempt[];
  retryCount?: number;
  createdAt: string;
}

export interface LanguageMetadata {
  id: string;
  name: string;
  extensions: string[];
  executionStrategy: string;
  compiler: string;
  isCompiled: boolean;
  capabilities: {
    detection: boolean;
    parsing: boolean;
    staticAnalysis: boolean;
    compilation: boolean;
    execution: boolean;
    testVerification: boolean;
  };
  sampleCode: string;
}

export interface LanguageDetectionResult {
  detectedLanguage: string | null;
  languageName: string | null;
  confidence: number;
  reason: string;
  isUncertain: boolean;
  isAmbiguous?: boolean;
  needsConfirmation?: boolean;
  ambiguousOptions?: string[];
  message: string;
}

export interface DebugSessionSummary {
  id: string;
  language: string;
  errorDescription: string;
  sourceCodePreview?: string;
  verified: boolean;
  verificationStatus?: VerificationStatusType;
  confidence?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

export interface HistoryListResponse {
  success: boolean;
  sessions: DebugSessionSummary[];
  pagination: {
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
    limit: number;
    offset: number;
  };
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface HistoryListParams {
  page?: number;
  limit?: number;
  offset?: number;
  language?: string;
  status?: string;
  search?: string;
}


export interface EvaluationCase {
  id: string;
  title: string;
  language: string;
  category: string;
  split: string;
}

export interface EvaluationResult {
  id: string;
  timestamp: string;
  totalCases: number;
  fixSuccessRate: number;
  compilationSuccessRate: number;
  regressionRate: number;
  explanationAccuracy: number;
  sandboxFailureRate: number;
  medianLatencyMs: number;
  latencyObservations: number;
  failureCounts: {
    providerErrors?: number;
    malformedResponses?: number;
    timeouts?: number;
    compilationFailures?: number;
    testFailures?: number;
  };
  rawResults: Array<{
    id: string;
    title: string;
    language: string;
    category: string;
    status?: string;
    correctedStatus?: string;
    fixSuccess: boolean;
    compilationSuccess: boolean;
    regression: boolean;
    explanationScore: number;
    latencyMs: number;
    diagnosis?: string;
    rootCause?: string;
  }>;
}

export interface PreservedDebugWork {
  sourceCode: string;
  language: string;
  errorDescription: string;
  expectedOutput: string;
  testCases: string;
  timestamp: number;
}
