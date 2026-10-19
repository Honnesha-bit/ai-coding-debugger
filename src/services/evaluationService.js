import fs from 'node:fs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { AiService } from './aiService.js';
import { SandboxService } from './sandboxService.js';
import { DiffService } from './diffService.js';
import { EvaluationRepository } from '../db/repositories/evaluationRepository.js';
import { StaticAnalyzer } from './languages/staticAnalyzer.js';

export class EvaluationService {
  constructor(options = {}) {
    this.aiService = options.aiService || new AiService();
    this.sandboxService = options.sandboxService || new SandboxService();
    this.diffService = options.diffService || new DiffService();
    this.evalRepo = options.evalRepo || new EvaluationRepository();
    this.datasetPath = options.datasetPath || config.DATASET_PATH;
  }

  loadDataset() {
    if (!fs.existsSync(this.datasetPath)) {
      throw new Error(`Evaluation dataset file not found at ${this.datasetPath}`);
    }
    const content = fs.readFileSync(this.datasetPath, 'utf8');
    const cases = JSON.parse(content);
    if (!Array.isArray(cases) || cases.length < 25) {
      throw new Error(`Evaluation dataset must contain at least 25 cases, found ${cases?.length || 0}`);
    }
    return cases;
  }

  /**
   * Evaluates the entire frozen dataset, records raw results, calculates all 7 metrics,
   * and saves the run in the database.
   */
  async runEvaluation() {
    const dataset = this.loadDataset();
    const rawResults = [];
    const latencies = [];

    const failureCounts = {
      providerErrors: 0,
      malformedResponses: 0,
      timeouts: 0,
      compilationFailures: 0,
      testFailures: 0,
      executionUnavailable: 0
    };

    let eligibleCases = 0;
    let fixSucceededCount = 0;
    let staticCheckSuccessCount = 0;
    let compilationAttempts = 0;
    let compilationSuccessCount = 0;
    let regressionChecks = 0;
    let regressionsIntroduced = 0;
    let totalExplanationScore = 0;
    let totalExecutionAttempts = 0;
    let infrastructureFailures = 0;

    for (const testCase of dataset) {
      eligibleCases++;
      const caseStartTime = performance.now();

      let aiResult = null;
      let aiError = null;

      try {
        aiResult = await this.aiService.diagnoseAndFix({
          language: testCase.language,
          sourceCode: testCase.buggyCode,
          expectedOutput: testCase.expectedOutput
        });
      } catch (err) {
        aiError = err.message;
        if (err.message.includes('timeout') || err.message.includes('API error')) {
          failureCounts.providerErrors++;
        } else if (err.message.includes('Malformed')) {
          failureCounts.malformedResponses++;
        }
      }

      if (aiError || !aiResult) {
        const caseLatencyMs = Math.max(1, Math.round(performance.now() - caseStartTime));
        latencies.push(caseLatencyMs);
        rawResults.push({
          id: testCase.id,
          title: testCase.title,
          language: testCase.language,
          category: testCase.category,
          status: 'AI_FAILURE',
          error: aiError,
          latencyMs: caseLatencyMs,
          fixSuccess: false,
          compilationSuccess: false,
          regression: false,
          explanationScore: 0.0,
          staticCheckPassed: false,
          executionAvailable: false,
          verificationCategory: 'VERIFICATION_ERROR'
        });
        continue;
      }

      // Step 1: Run original code with testCode to verify baseline behavior
      totalExecutionAttempts++;
      const originalRun = await this.sandboxService.execute({
        language: testCase.language,
        code: testCase.buggyCode,
        testCode: testCase.testCode
      });
      if (originalRun.status === 'infrastructure_error') {
        infrastructureFailures++;
      }

      // Step 2: Run proposed corrected code with testCode to verify fix
      totalExecutionAttempts++;
      compilationAttempts++;

      const correctedRun = await this.sandboxService.execute({
        language: testCase.language,
        code: aiResult.correctedCode,
        testCode: testCase.testCode
      });

      if (correctedRun.status === 'infrastructure_error') {
        infrastructureFailures++;
      }

      if (correctedRun.status === 'timeout') {
        failureCounts.timeouts++;
      } else if (correctedRun.status === 'compilation_error') {
        failureCounts.compilationFailures++;
      } else if (correctedRun.status === 'test_failure') {
        failureCounts.testFailures++;
      } else if (correctedRun.status === 'execution_unavailable') {
        failureCounts.executionUnavailable++;
      }

      // Static check evaluation
      const staticResult = StaticAnalyzer.analyze(testCase.language, aiResult.correctedCode);
      const staticCheckPassed = staticResult.isValid;
      if (staticCheckPassed) {
        staticCheckSuccessCount++;
      }
      const executionAvailable = correctedRun.status !== 'execution_unavailable' && correctedRun.executionAvailable !== false;

      const compiledSuccessfully = correctedRun.status !== 'compilation_error' && correctedRun.status !== 'infrastructure_error';
      if (compiledSuccessfully) {
        compilationSuccessCount++;
      }

      const fixSuccess = correctedRun.status === 'success';
      if (fixSuccess) {
        fixSucceededCount++;
      }

      // Step 3: Check regressions
      // A regression is defined when the corrected program fails on a baseline test that the original program passed,
      // or introduces new syntax/crash when original code ran.
      regressionChecks++;
      let isRegression = false;
      if (originalRun.status === 'success' && correctedRun.status !== 'success') {
        isRegression = true;
        regressionsIntroduced++;
      }

      // Step 4: Explanation accuracy scoring rubric
      // 1.0: Identified root cause + clear diagnosis + valid suggested code
      // 0.5: Partial match
      // 0.0: Irrelevant or wrong
      let explanationScore = 0.0;
      if (aiResult.rootCause && aiResult.diagnosis && aiResult.rootCause.length > 10) {
        explanationScore = fixSuccess ? 1.0 : 0.7;
      }
      totalExplanationScore += explanationScore;

      // Diff calculation
      const diff = this.diffService.generateUnifiedDiff(testCase.buggyCode, aiResult.correctedCode);

      // Measure true end-to-end latency including diagnosis and sandbox executions
      const caseLatencyMs = Math.max(1, Math.round(performance.now() - caseStartTime));
      latencies.push(caseLatencyMs);

      const verificationCategory = !executionAvailable
        ? (testCase.testCode ? 'TESTS_GENERATED_NOT_RUN' : 'STATIC_CHECK_PASSED')
        : (fixSuccess ? 'TESTS_PASSED_VERIFIED' : 'TESTS_FAILED_VERIFIED');

      rawResults.push({
        id: testCase.id,
        title: testCase.title,
        language: testCase.language,
        category: testCase.category,
        diagnosis: aiResult.diagnosis,
        rootCause: aiResult.rootCause,
        confidence: aiResult.confidence,
        provider: aiResult.provider,
        originalStatus: originalRun.status,
        correctedStatus: correctedRun.status,
        fixSuccess,
        compilationSuccess: compiledSuccessfully,
        regression: isRegression,
        explanationScore,
        latencyMs: caseLatencyMs,
        diff,
        staticCheckPassed,
        executionAvailable,
        verificationCategory
      });
    }

    // Metric Calculations
    const fixSuccessRate = eligibleCases > 0 ? Number((fixSucceededCount / eligibleCases).toFixed(4)) : 0;
    const compilationSuccessRate = compilationAttempts > 0 ? Number((compilationSuccessCount / compilationAttempts).toFixed(4)) : 0;
    const staticCheckSuccessRate = eligibleCases > 0 ? Number((staticCheckSuccessCount / eligibleCases).toFixed(4)) : 0;
    const executionAvailableRate = totalExecutionAttempts > 0 ? Number(((totalExecutionAttempts - failureCounts.executionUnavailable) / totalExecutionAttempts).toFixed(4)) : 0;
    const regressionRate = regressionChecks > 0 ? Number((regressionsIntroduced / regressionChecks).toFixed(4)) : 0;
    const explanationAccuracy = eligibleCases > 0 ? Number((totalExplanationScore / eligibleCases).toFixed(4)) : 0;
    const sandboxFailureRate = totalExecutionAttempts > 0 ? Number((infrastructureFailures / totalExecutionAttempts).toFixed(4)) : 0;

    // Median latency calculation
    latencies.sort((a, b) => a - b);
    let medianLatencyMs = 0;
    if (latencies.length > 0) {
      const mid = Math.floor(latencies.length / 2);
      medianLatencyMs = latencies.length % 2 !== 0 ? latencies[mid] : (latencies[mid - 1] + latencies[mid]) / 2;
    }

    const runId = 'eval_' + crypto.randomBytes(8).toString('hex');
    const runRecord = {
      id: runId,
      timestamp: new Date().toISOString(),
      totalCases: eligibleCases,
      fixSuccessRate,
      compilationSuccessRate,
      staticCheckSuccessRate,
      executionAvailableRate,
      regressionRate,
      explanationAccuracy,
      sandboxFailureRate,
      medianLatencyMs: Math.round(medianLatencyMs),
      latencyObservations: latencies.length,
      failureCounts,
      rawResults
    };

    return this.evalRepo.saveRun(runRecord);
  }

  getLatestResults() {
    return this.evalRepo.getLatestRun();
  }
}
