import express from 'express';
import crypto from 'node:crypto';
import { enforceGuestLimit } from '../middleware/guestMiddleware.js';
import { AiService, AiCallBudget } from '../services/aiService.js';
import { SandboxService } from '../services/sandboxService.js';
import { DiffService } from '../services/diffService.js';
import { GuestService } from '../services/guestService.js';
import { AiRepairService } from '../services/aiRepairService.js';
import { LanguageRegistry } from '../services/languages/languageRegistry.js';
import { LanguageDetector } from '../services/languages/languageDetector.js';
import { DebugSessionRepository } from '../db/repositories/debugSessionRepository.js';
import { validateSubmissionMiddleware, validateLanguageDetectionInput } from '../middleware/validationMiddleware.js';
import { TestGenerator } from '../services/languages/testGenerator.js';

export function createDebugRouter(options = {}) {
  const router = express.Router();
  const aiService = options.aiService || new AiService();
  const sandboxService = options.sandboxService || new SandboxService();
  const diffService = options.diffService || new DiffService();
  const guestService = options.guestService || new GuestService();
  const sessionRepo = options.sessionRepo || new DebugSessionRepository();
  const repairService = new AiRepairService({ aiService, sandboxService, diffService });

  /**
   * GET /api/v1/languages
   * Returns metadata and capabilities of all supported programming languages.
   */
  router.get('/languages', (req, res) => {
    res.json({
      success: true,
      languages: LanguageRegistry.getAll(),
      toolchains: LanguageRegistry.detectToolchains(),
      coreLanguages: LanguageRegistry.getCoreAdapters().map(a => a.id)
    });
  });

  /**
   * POST /api/v1/languages/detect
   * Automatic language detection from code content and optional filename.
   */
  router.post('/languages/detect', (req, res) => {
    try {
      const { code, filename } = req.body || {};
      validateLanguageDetectionInput({ code, filename });
      const result = LanguageDetector.detect({ code, filename });
      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      const status = err.status || 400;
      return res.status(status).json({
        error: err.code || 'INVALID_INPUT',
        message: err.message
      });
    }
  });

  /**
   * GET /api/v1/sandbox/status
   * Reports sandbox isolation mode, active runner, and container availability.
   */
  router.get('/sandbox/status', (req, res) => {
    res.json({
      success: true,
      ...sandboxService.getStatus()
    });
  });

  /**
   * POST /api/v1/debug
   * Main multi-language debugging & iterative repair entrypoint. Enforces guest limit on unauthenticated users.
   */
  router.post('/debug', validateSubmissionMiddleware, enforceGuestLimit, async (req, res) => {
    const { language, sourceCode, errorDescription = '', expectedOutput = '', testCases = '' } = req.body;
    const isGuest = !req.user;
    const guestSessionId = req.guestSessionId;

    try {
      const callBudget = new AiCallBudget();
      const repairOutcome = await repairService.repairAndVerify({
        language,
        sourceCode,
        errorDescription,
        expectedOutput,
        testCases,
        maxRetries: 2,
        budget: callBudget
      });

      // If sandbox suffered an internal infrastructure failure, refund guest attempt
      if (
        repairOutcome.originalRun?.status === 'infrastructure_error' ||
        repairOutcome.correctedRun?.status === 'infrastructure_error'
      ) {
        if (isGuest) {
          guestService.refundAttempt(guestSessionId);
        }
        return res.status(500).json({
          error: 'SANDBOX_INFRASTRUCTURE_FAILURE',
          message: 'Code verification sandbox encountered an internal error.'
        });
      }

      // Save Session to Database
      const sessionId = 'dbg_' + crypto.randomBytes(8).toString('hex');
      const sessionRecord = {
        id: sessionId,
        userId: req.user ? req.user.id : null,
        guestSessionId: isGuest ? guestSessionId : null,
        language,
        sourceCode,
        errorDescription,
        expectedOutput,
        testCases,
        diagnosis: repairOutcome.diagnosis,
        rootCause: repairOutcome.rootCause,
        correctedCode: repairOutcome.correctedCode,
        diff: repairOutcome.diff,
        confidence: repairOutcome.confidence,
        originalRun: repairOutcome.originalRun,
        correctedRun: repairOutcome.correctedRun,
        verified: repairOutcome.verified,
        verificationStatus: repairOutcome.verificationStatus,
        detailedStatus: repairOutcome.detailedStatus,
        category: repairOutcome.category,
        resultCategory: repairOutcome.resultCategory,
        staticChecks: repairOutcome.staticChecks,
        downloadableTestFile: repairOutcome.downloadableTestFile,
        testResults: repairOutcome.testResults || [],
        regressionReport: repairOutcome.regressionReport || {},
        attempts: repairOutcome.attempts,
        retryCount: repairOutcome.retryCount,
        lineDiagnoses: repairOutcome.lineDiagnoses || [],
        createdAt: new Date().toISOString()
      };

      sessionRepo.create(sessionRecord);

      // Remaining guest uses for response payload
      const guestStatus = guestService.getUsageStatus(guestSessionId);

      res.json({
        success: true,
        sessionId,
        session_id: sessionId,
        originalCode: sourceCode,
        original_code: sourceCode,
        diagnosis: repairOutcome.diagnosis,
        detected_issue: repairOutcome.diagnosis,
        rootCause: repairOutcome.rootCause,
        root_cause: repairOutcome.rootCause,
        correctedCode: repairOutcome.correctedCode,
        corrected_code: repairOutcome.correctedCode,
        explanation: repairOutcome.diagnosis,
        recommended_fix: repairOutcome.diagnosis,
        affectedLines: repairOutcome.affectedLines || [],
        affected_line: (repairOutcome.affectedLines && repairOutcome.affectedLines[0]) || null,
        lineDiagnoses: repairOutcome.lineDiagnoses || [],
        confidence: repairOutcome.confidence,
        provider: repairOutcome.provider || 'mock',
        diff: repairOutcome.diff,
        structuredDiff: repairOutcome.structuredDiff,
        originalRun: repairOutcome.originalRun,
        correctedRun: repairOutcome.correctedRun,
        verified: repairOutcome.verified,
        is_valid_fix: repairOutcome.verified,
        verificationStatus: repairOutcome.verificationStatus,
        verification_status: repairOutcome.verified ? 'Tests Passed' : 'Not Verified',
        detailedStatus: repairOutcome.detailedStatus,
        category: repairOutcome.category,
        error_category: repairOutcome.category || 'Logic',
        resultCategory: repairOutcome.resultCategory,
        verificationSummary: repairOutcome.verificationSummary,
        statusReason: repairOutcome.statusReason,
        checks: repairOutcome.checks,
        staticChecks: repairOutcome.staticChecks,
        downloadableTestFile: repairOutcome.downloadableTestFile,
        testDownload: repairOutcome.downloadableTestFile,
        testResults: repairOutcome.testResults || [],
        regressionReport: repairOutcome.regressionReport,
        executionDurationMs: repairOutcome.executionDurationMs,
        toolchainStatus: repairOutcome.toolchainStatus,
        attempts: repairOutcome.attempts,
        retryCount: repairOutcome.retryCount,
        guestStatus: {
          remainingUses: req.user ? Infinity : guestStatus.remainingUses,
          maxUses: guestStatus.maxUses,
          isExhausted: req.user ? false : guestStatus.isExhausted,
          message: guestStatus.message
        }
      });
    } catch (err) {
      if (isGuest) {
        guestService.refundAttempt(guestSessionId);
      }
      res.status(500).json({
        error: 'DEBUGGING_OPERATION_FAILED',
        message: err.message
      });
    }
  });

  /**
   * POST /api/v1/debug/tests/download
   * Formats and returns a standalone, executable test suite file for download.
   */
  router.post('/debug/tests/download', (req, res) => {
    try {
      const { language, testCases = [], correctedCode = '', expectedOutput = '', sessionId = null } = req.body || {};

      let effectiveLanguage = language;
      let effectiveTestCases = testCases;
      let effectiveCode = correctedCode;
      let effectiveOutput = expectedOutput;

      if (sessionId) {
        const session = sessionRepo.findById(sessionId);
        if (session) {
          effectiveLanguage = effectiveLanguage || session.language;
          effectiveCode = effectiveCode || session.correctedCode || session.sourceCode;
          effectiveOutput = effectiveOutput || session.expectedOutput;
          if ((!effectiveTestCases || effectiveTestCases.length === 0) && session.testResults) {
            effectiveTestCases = session.testResults;
          }
        }
      }

      if (!effectiveLanguage) {
        return res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'Language is required to format downloadable test suite.'
        });
      }

      const formatted = TestGenerator.formatDownloadableTestSuite({
        language: effectiveLanguage,
        testCases: effectiveTestCases,
        correctedCode: effectiveCode,
        expectedOutput: effectiveOutput
      });

      if (req.query.format === 'file' || req.headers.accept?.includes('text/plain')) {
        res.setHeader('Content-Disposition', `attachment; filename="${formatted.filename}"`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(formatted.content);
      }

      return res.json({
        success: true,
        ...formatted
      });
    } catch (err) {
      return res.status(500).json({
        error: 'DOWNLOAD_GENERATION_FAILED',
        message: err.message
      });
    }
  });

  /**
   * POST /api/v1/execute
   * Run standalone code snippet in the sandbox for isolated verification.
   * Enforces guest usage limit for unauthenticated guests.
   */
  router.post('/execute', validateSubmissionMiddleware, enforceGuestLimit, async (req, res) => {
    const { language, sourceCode, testCases = '' } = req.body;
    const isGuest = !req.user;
    const guestSessionId = req.guestSessionId;

    try {
      const runResult = await sandboxService.execute({
        language,
        code: sourceCode,
        testCode: testCases
      });

      // If sandbox suffered an internal infrastructure failure, refund guest attempt
      if (runResult.status === 'infrastructure_error') {
        if (isGuest) {
          guestService.refundAttempt(guestSessionId);
        }
      }

      const guestStatus = guestService.getUsageStatus(guestSessionId);

      res.json({
        success: true,
        result: runResult,
        guestStatus: {
          remainingUses: req.user ? Infinity : guestStatus.remainingUses,
          maxUses: guestStatus.maxUses,
          isExhausted: req.user ? false : guestStatus.isExhausted,
          message: guestStatus.message
        }
      });
    } catch (err) {
      if (isGuest) {
        guestService.refundAttempt(guestSessionId);
      }
      res.status(500).json({
        error: 'EXECUTION_FAILED',
        message: err.message
      });
    }
  });

  /**
   * POST /api/validate-fix
   * Validates corrected code against the sandbox.
   */
  router.post('/validate-fix', async (req, res) => {
    try {
      const { original_code, corrected_code, code, language = 'python', test_cases = '' } = req.body || {};
      const codeToRun = corrected_code || code || original_code || '';
      const runResult = await sandboxService.execute({
        language,
        code: codeToRun,
        testCode: test_cases
      });
      const isValid = runResult.status === 'success' || runResult.exitCode === 0;
      res.json({
        is_valid: isValid,
        valid: isValid,
        verification_status: isValid ? 'Tests Passed' : 'Validation Failed',
        syntax_status: runResult.status === 'compilation_error' ? 'Invalid' : 'Valid',
        runtime_status: runResult.status,
        execution_result: runResult
      });
    } catch (err) {
      res.status(500).json({ error: 'VALIDATION_FAILED', message: err.message });
    }
  });

  /**
   * POST /api/run-tests
   * Runs tests in sandbox.
   */
  router.post('/run-tests', async (req, res) => {
    try {
      const { code, language = 'python', test_cases = '' } = req.body || {};
      const runResult = await sandboxService.execute({
        language,
        code,
        testCode: test_cases
      });
      const passed = runResult.status === 'success' || runResult.exitCode === 0;
      res.json({
        passed,
        execution_result: runResult,
        status: passed ? 'Passed' : 'Failed'
      });
    } catch (err) {
      res.status(500).json({ error: 'EXECUTION_FAILED', message: err.message });
    }
  });

  return router;
}
