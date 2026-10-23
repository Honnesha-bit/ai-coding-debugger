import { DiffService } from './diffService.js';
import { TestGenerator } from './languages/testGenerator.js';
import { VerificationService } from './verificationService.js';
import { AiCallBudget } from './aiService.js';
import { config } from '../config.js';
import { validateDebugSubmission } from '../middleware/validationMiddleware.js';

export class AiRepairService {
  constructor({ aiService, sandboxService, diffService = null, maxCallsPerRequest = null } = {}) {
    this.aiService = aiService;
    this.sandboxService = sandboxService;
    this.diffService = diffService || new DiffService();
    this.maxCallsPerRequest = maxCallsPerRequest || aiService?.maxCallsPerRequest || config.AI_MAX_CALLS_PER_REQUEST || 3;
  }

  /**
   * Performs automated debugging, sandbox verification, and iterative feedback repair,
   * strictly bounded by a request-scoped AI call budget.
   *
   * @param {Object} options
   * @param {string} options.language - Programming language ID
   * @param {string} options.sourceCode - Original buggy code
   * @param {string} [options.errorDescription] - User-reported error description
   * @param {string} [options.expectedOutput] - Expected stdout
   * @param {string} [options.testCases] - Optional test cases
   * @param {number} [options.maxRetries=2] - Max feedback repair iterations
   * @param {AiCallBudget} [options.budget] - Shared request-scoped call budget
   */
  async repairAndVerify({
    language,
    sourceCode,
    errorDescription = '',
    expectedOutput = '',
    testCases = '',
    maxRetries = 2,
    budget = null
  }) {
    validateDebugSubmission({ language, sourceCode, errorDescription, expectedOutput, testCases });

    const overallStartTime = Date.now();
    const callBudget = budget instanceof AiCallBudget
      ? budget
      : (budget && typeof budget.consume === 'function' ? budget : new AiCallBudget(this.maxCallsPerRequest));

    // 1. Generate or prepare verification test suite
    const suite = TestGenerator.generateSuite({
      language,
      code: sourceCode,
      errorDescription,
      expectedOutput,
      customTestCases: testCases
    });
    const effectiveTestCode = suite.executableTestCode;
    const testSuite = suite.testCases;

    // 2. Run original baseline in sandbox
    const originalRun = await this.sandboxService.execute({
      language,
      code: sourceCode,
      testCode: effectiveTestCode
    });

    let currentErrorDesc = errorDescription;
    let attempts = [];
    let bestResult = null;
    let finalCorrectedRun = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      // Hard cap: If the call budget is exhausted, stop repair iterations immediately
      if (callBudget.isExhausted) {
        break;
      }

      const attemptStartTime = Date.now();

      // Generate AI diagnosis and correction with request-scoped budget
      let aiResult;
      try {
        aiResult = await this.aiService.diagnoseAndFix({
          language,
          sourceCode,
          errorDescription: currentErrorDesc,
          expectedOutput,
          testCases: effectiveTestCode,
          budget: callBudget
        });
      } catch (err) {
        // If an error occurred (e.g. budget exhausted or provider failure)
        // If we already obtained a fix candidate from a prior attempt, return it safely!
        if (bestResult) {
          break;
        }
        throw err;
      }

      // Verify corrected code in sandbox
      const correctedRun = await this.sandboxService.execute({
        language,
        code: aiResult.correctedCode,
        testCode: effectiveTestCode
      });

      const attemptDuration = Math.max(1, Date.now() - attemptStartTime);
      const isSuccess = correctedRun.status === 'success';
      const isUnavailable = correctedRun.status === 'execution_unavailable';

      attempts.push({
        attemptNumber: attempt,
        diagnosis: aiResult.diagnosis,
        rootCause: aiResult.rootCause,
        correctedCode: aiResult.correctedCode,
        confidence: aiResult.confidence,
        runStatus: correctedRun.status,
        stdout: correctedRun.stdout,
        stderr: correctedRun.stderr,
        exitCode: correctedRun.exitCode,
        durationMs: attemptDuration,
        passed: isSuccess || isUnavailable
      });

      bestResult = aiResult;
      finalCorrectedRun = correctedRun;

      if (isSuccess || isUnavailable) {
        break; // Stop immediately upon verified fix or unavailable toolchain
      }

      // If failed and retries remain, feed back compiler/runtime error into next repair attempt
      if (attempt <= maxRetries) {
        const failureOutput = (correctedRun.stderr || correctedRun.stdout || '').trim();
        currentErrorDesc = `${errorDescription}\n\n[Previous Fix Attempt #${attempt} Failed]:\nExit status: ${correctedRun.status}\nError details: ${failureOutput.slice(0, 500)}\nPlease fix this error specifically and ensure all assertions pass.`;
      }
    }

    const isCodeUnchanged = !bestResult || (bestResult.correctedCode && bestResult.correctedCode.trim() === sourceCode.trim());
    const hasBug = (bestResult && typeof bestResult.hasBug === 'boolean')
      ? bestResult.hasBug
      : (!isCodeUnchanged);

    if (!hasBug && bestResult) {
      bestResult.hasBug = false;
      bestResult.correctedCode = sourceCode;
      bestResult.affectedLines = [];
      bestResult.lineDiagnoses = [];
    }

    const totalDurationMs = Math.max(1, Date.now() - overallStartTime);

    // 3. Delegate to VerificationService for formal status and audit metrics
    const verification = VerificationService.verify({
      language,
      originalResult: originalRun,
      repairedResult: !hasBug ? originalRun : finalCorrectedRun,
      attempts,
      totalDurationMs,
      expectedOutput,
      testSuite,
      correctedCode: bestResult ? bestResult.correctedCode : sourceCode,
      sourceCode,
      hasBug
    });

    // 4. Generate line diffs against original code
    const unifiedDiff = hasBug
      ? this.diffService.generateUnifiedDiff(sourceCode, bestResult.correctedCode)
      : '';
    const structuredDiff = hasBug
      ? this.diffService.generateStructuredDiff(sourceCode, bestResult.correctedCode)
      : { hasChanges: false, additions: 0, deletions: 0, lines: [] };

    return {
      hasBug,
      diagnosis: bestResult ? bestResult.diagnosis : 'No analysis result available.',
      rootCause: bestResult ? bestResult.rootCause : '',
      correctedCode: bestResult ? bestResult.correctedCode : sourceCode,
      confidence: bestResult ? bestResult.confidence : 'medium',
      provider: bestResult?.provider || this.aiService.provider || 'mock',
      affectedLines: hasBug ? (bestResult.affectedLines || []) : [],
      lineDiagnoses: hasBug ? (bestResult.lineDiagnoses || []) : [],
      diff: unifiedDiff,
      structuredDiff,
      originalRun,
      correctedRun: !hasBug ? originalRun : finalCorrectedRun,
      verified: verification.isVerified,
      verificationStatus: verification.verificationStatus,
      detailedStatus: verification.detailedStatus,
      category: verification.category,
      resultCategory: verification.resultCategory,
      verificationSummary: verification.summary,
      statusReason: verification.statusReason,
      checks: verification.checks,
      staticChecks: verification.staticChecks,
      downloadableTestFile: verification.downloadableTestFile,
      testDownload: verification.downloadableTestFile,
      testResults: verification.testResults,
      regressionReport: verification.regressionReport,
      toolchainStatus: verification.toolchainStatus,
      executionDurationMs: totalDurationMs,
      attempts,
      retryCount: attempts.length - 1,
      aiCallsMade: callBudget.callsMade,
      callBudget: {
        maxCalls: callBudget.maxCalls,
        callsMade: callBudget.callsMade,
        isExhausted: callBudget.isExhausted
      }
    };
  }
}
