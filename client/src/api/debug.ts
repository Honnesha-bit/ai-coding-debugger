import { apiClient } from './client';
import { 
  ApiHealth, 
  DebugRequest, 
  DebugResponse, 
  ErrorCategory, 
  RunTestsRequest, 
  RunTestsResponse, 
  ValidateFixRequest, 
  ValidateFixResponse,
  VerificationStatus
} from '../types/api';

function normalizeVerificationStatus(rawStatus?: string): VerificationStatus {
  if (!rawStatus) return 'Not Verified';
  const s = rawStatus.toLowerCase().replace(/_/g, ' ').trim();
  if (s === 'code verified' || s === 'code correct') return 'Code Verified';
  if (s === 'static check passed' || s === 'static structure verified') return 'Static Check Passed';
  if (s === 'unable to verify' || s === 'execution unavailable') return 'Unable to Verify';
  if (s === 'tests passed' || s === 'passed') return 'Tests Passed';
  if (s === 'tests failed' || s === 'failed') return 'Tests Failed';
  if (s === 'fix validated') return 'Fix Validated';
  if (s === 'validated' || s === 'syntax verified') return 'Validated';
  if (s === 'partially fixed') return 'Partially Fixed';
  if (s === 'validation failed') return 'Validation Failed';
  if (s === 'not runtime tested') return 'Not Runtime Tested';
  if (s === 'suggested') return 'Suggested';
  return 'Not Verified';
}

function normalizeErrorCategory(rawType?: string): ErrorCategory {
  if (!rawType) return 'None';
  const t = rawType.toLowerCase().replace(/_/g, ' ').trim();
  if (t === 'none' || t === 'clean' || t.includes('no_defects') || t.includes('code_correct')) return 'None';
  if (t.includes('syntax')) return 'Syntax';
  if (t.includes('runtime')) return 'Runtime';
  if (t.includes('type')) return 'Type';
  if (t.includes('boundary')) return 'Boundary Condition';
  if (t.includes('logic')) return 'Logic';
  return 'Logic';
}

export const checkHealth = async (): Promise<ApiHealth> => {
  const data = await apiClient.get<Record<string, any>>('/api/health');
  const components = data.components || {};
  const sandboxAvailable = 
    data.sandbox_available !== undefined
      ? Boolean(data.sandbox_available)
      : components.sandbox?.status === 'healthy';

  return {
    status: data.status || 'ok',
    version: data.version || data.api_version || '1.0.0',
    sandbox_available: sandboxAvailable,
    message: data.message || `Backend is ${data.status || 'healthy'}`
  };
};

export interface GuestStatusResponse {
  success: boolean;
  remainingUses: number;
  maxUses: number;
  isExhausted: boolean;
  isAuthenticated: boolean;
}

export const getGuestStatus = async (): Promise<GuestStatusResponse> => {
  return await apiClient.get<GuestStatusResponse>('/api/guest/status');
};

export const debugCode = async (data: DebugRequest): Promise<DebugResponse> => {
  const raw = await apiClient.post<Record<string, any>>('/api/debug', data);

  const errorCategory = raw.error_category 
    ? (raw.error_category as ErrorCategory)
    : normalizeErrorCategory(raw.error_type || raw.errorCategory || raw.category);

  const affectedLine = raw.affected_line !== undefined && raw.affected_line !== null
    ? raw.affected_line
    : (raw.affectedLine !== undefined && raw.affectedLine !== null
        ? raw.affectedLine
        : (Array.isArray(raw.changes) && raw.changes.length > 0
            ? raw.changes[0].line
            : (Array.isArray(raw.lineDiagnoses) && raw.lineDiagnoses.length > 0 ? raw.lineDiagnoses[0].line : null)));

  const hasBug = raw.hasBug !== undefined
    ? Boolean(raw.hasBug)
    : (raw.has_bug !== undefined
        ? Boolean(raw.has_bug)
        : (raw.correctedCode && raw.originalCode ? raw.correctedCode.trim() !== raw.originalCode.trim() : true));

  const issuesList = !hasBug
    ? []
    : (Array.isArray(raw.issues)
        ? raw.issues
        : (Array.isArray(raw.lineDiagnoses)
            ? raw.lineDiagnoses.map((ld: any, idx: number) => ({
                id: `ld-${idx}`,
                line: ld.lineNumber || ld.line || null,
                column: ld.column || 1,
                category: errorCategory,
                severity: 'error' as const,
                message: ld.explanation || ld.diagnosis || ld.issue || 'Defect detected on this line',
                explanation: ld.whyItWorks || ld.explanation || '',
                suggested_fix: ld.suggestedCorrection || ld.fix || '',
                confidence: ld.confidence || 'high',
                fixable: true
              }))
            : []));

  return {
    session_id: raw.session_id || raw.sessionId,
    analyzed_code: raw.analyzed_code || raw.originalCode || data.code,
    has_bug: hasBug,
    hasBug: hasBug,
    detected_issue: raw.detected_issue || (hasBug ? (raw.root_cause || raw.rootCause || 'Issue detected in source code') : 'No defects detected in source code'),
    error_category: hasBug ? errorCategory : 'None',
    root_cause: raw.root_cause || raw.rootCause || (hasBug ? '' : 'Code is syntactically valid and executes without errors.'),
    affected_line: hasBug ? affectedLine : null,
    explanation: raw.explanation || raw.diagnosis?.explanation || raw.rootCause || '',
    recommended_fix: raw.recommended_fix || (hasBug ? (raw.recommendedFix || raw.explanation || '') : 'No code changes needed.'),
    corrected_code: raw.corrected_code || raw.correctedCode || data.code,
    issues: issuesList,
    remaining_issues: Array.isArray(raw.remaining_issues) ? raw.remaining_issues : [],
    is_valid_fix: raw.is_valid_fix !== undefined
      ? Boolean(raw.is_valid_fix)
      : (raw.verified !== undefined ? Boolean(raw.verified) : true),
    validation_note: raw.validation_note || raw.verificationSummary || raw.statusReason || '',
    syntax_status: raw.syntax_status || raw.checks?.syntaxStatus || (raw.staticChecks?.syntaxPassed ? 'PASSED' : undefined),
    static_analysis_status: raw.static_analysis_status || (raw.staticChecks?.allPassed ? 'PASSED' : undefined),
    runtime_status: raw.runtime_status || (raw.correctedRun?.status === 'success' ? 'PASSED' : undefined),
    assumptions_and_uncertainty: raw.assumptions_and_uncertainty || raw.assumptions || [],
    suggested_additional_tests: raw.suggested_additional_tests || raw.suggested_tests || [],
    explain_like_learning: raw.explain_like_learning || raw.explanation,
    quality_suggestions: raw.quality_suggestions || [],
    verification_status: normalizeVerificationStatus(raw.verification_status || raw.verificationStatus),
    execution_result: raw.execution_result || (raw.correctedRun ? {
      stdout: raw.correctedRun.stdout,
      stderr: raw.correctedRun.stderr,
      exit_code: raw.correctedRun.exitCode,
      execution_time_ms: raw.correctedRun.durationMs
    } : undefined),
    guest_status: raw.guest_status || raw.guestStatus,
  };
};

export const validateFix = async (data: ValidateFixRequest): Promise<ValidateFixResponse> => {
  const raw = await apiClient.post<Record<string, any>>('/api/validate-fix', data);

  const isValid = raw.is_valid !== undefined 
    ? Boolean(raw.is_valid) 
    : Boolean(raw.valid);

  const status = normalizeVerificationStatus(raw.verification_status);

  return {
    is_valid: isValid,
    verification_status: status,
    validation_details: raw.validation_details || raw.validation_note || raw.message || (isValid ? 'Syntax validation passed' : 'Validation failed'),
    syntax_status: raw.syntax_status,
    static_analysis_status: raw.static_analysis_status,
    runtime_status: raw.runtime_status,
    remaining_issues: Array.isArray(raw.remaining_issues) ? raw.remaining_issues : [],
    feedback: raw.feedback || raw.message,
    runtime_output: raw.runtime_output
  };
};

export const runTests = async (data: RunTestsRequest): Promise<RunTestsResponse> => {
  const raw = await apiClient.post<Record<string, any>>('/api/run-tests', data);

  const rawResults = raw.results || raw.test_results || [];
  const passedCount = raw.passed_count ?? rawResults.filter((r: any) => r.passed).length;
  const totalCount = raw.total_count ?? rawResults.length;
  const allPassed = raw.all_passed !== undefined 
    ? Boolean(raw.all_passed) 
    : (totalCount > 0 && passedCount === totalCount);

  const results = rawResults.map((r: any) => ({
    input: r.input || '',
    expected_output: r.expected_output || '',
    actual_output: r.actual_output ?? (r.passed ? r.expected_output : ''),
    passed: Boolean(r.passed),
    error_message: r.error_message,
    execution_time_ms: r.execution_time_ms
  }));

  const verificationStatus: VerificationStatus = allPassed ? 'Tests Passed' : 'Tests Failed';

  return {
    all_passed: allPassed,
    passed_count: passedCount,
    total_count: totalCount,
    results,
    execution_time_ms: raw.execution_time_ms,
    verification_status: verificationStatus
  };
};
