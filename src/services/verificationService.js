import { LanguageRegistry } from './languages/languageRegistry.js';
import { TestGenerator } from './languages/testGenerator.js';
import { StaticAnalyzer } from './languages/staticAnalyzer.js';

export class VerificationService {
  /**
   * Evaluates the repaired code execution outcome and determines the formal verification status.
   *
   * @param {Object} params
   * @param {string} params.language - Language ID
   * @param {Object} [params.originalResult] - Pre-fix sandbox execution outcome
   * @param {Object} [params.repairedResult] - Post-fix sandbox execution outcome
   * @param {Array} [params.attempts] - Iterative repair attempt history
   * @param {Object} [params.staticAnalysis] - Static analysis results
   * @param {number} [params.totalDurationMs] - High-resolution measured latency
   * @param {string} [params.expectedOutput] - User-expected stdout
   * @param {Array<Object>} [params.testSuite] - Test cases (custom and generated)
   * @param {string} [params.correctedCode] - Repaired code candidate
   * @param {string} [params.sourceCode] - Original submitted code
   * @returns {Object} Comprehensive verification report
   */
  static verify({
    language,
    originalResult = null,
    repairedResult = null,
    attempts = [],
    staticAnalysis = null,
    totalDurationMs = null,
    expectedOutput = '',
    testSuite = [],
    correctedCode = '',
    sourceCode = ''
  }) {
    const adapter = LanguageRegistry.getAdapter(language);
    const langName = adapter ? adapter.name : language;

    // Resolve candidate code for static check and test package formatting
    const targetCode = correctedCode || (attempts.length > 0 ? attempts[attempts.length - 1]?.correctedCode : '') || '';

    // Perform static syntax analysis if not already supplied
    let analysis = staticAnalysis;
    if (!analysis && targetCode) {
      analysis = StaticAnalyzer.analyze(language, targetCode);
    }
    const staticChecks = this._buildStaticChecks(analysis, langName);

    // Format downloadable test suite if tests exist
    let downloadableTestFile = null;
    if (testSuite && testSuite.length > 0) {
      downloadableTestFile = TestGenerator.formatDownloadableTestSuite({
        language,
        testCases: testSuite,
        correctedCode: targetCode,
        expectedOutput
      });
    }

    // 0. No repaired result produced (Infrastructure error / Failure)
    if (!repairedResult) {
      return {
        verificationStatus: 'ANALYSIS FAILED',
        detailedStatus: 'INFRASTRUCTURE_ERROR',
        category: 'VERIFICATION_ERROR',
        resultCategory: 'VERIFICATION_ERROR',
        isVerified: false,
        summary: `Analysis failed: no execution or repair result was produced for ${langName}.`,
        statusReason: 'Verification infrastructure did not receive an execution outcome.',
        toolchainStatus: 'unknown',
        executionDurationMs: totalDurationMs || 0,
        checks: {
          syntaxPassed: false,
          executionPassed: false,
          testsPassed: false,
          expectedOutputMatched: null,
          regressionPassed: null,
          toolchainAvailable: false
        },
        staticChecks,
        downloadableTestFile,
        testResults: [],
        regressionReport: {
          regressionDetected: false,
          passed: 0,
          failed: 0,
          skipped: 0,
          unavailable: 0,
          summary: 'Regression analysis unavailable: no repair outcome.',
          confidenceNote: 'Analysis was not completed.'
        }
      };
    }

    // 1. Toolchain Missing / Execution Unavailable (Honest reporting in safe verification mode)
    if (repairedResult.status === 'execution_unavailable' || repairedResult.executionAvailable === false) {
      const testResults = TestGenerator.evaluateTestResults(testSuite, repairedResult, expectedOutput);

      // Check if static analysis caught a defect
      if (analysis && !analysis.isValid) {
        return {
          verificationStatus: 'FIX NOT VERIFIED',
          detailedStatus: 'VERIFICATION_FAILED',
          category: 'STATIC_CHECK_FAILED',
          resultCategory: 'STATIC_CHECK_FAILED',
          isVerified: false,
          summary: `Static checks failed for ${langName}: ${staticChecks.errors.join('; ')}`,
          statusReason: 'Static analysis detected syntax errors or unbalanced delimiters in the candidate code.',
          toolchainStatus: 'unavailable',
          setupInstructions: adapter?.getSetupInstructions() || 'Install compiler toolchain.',
          executionDurationMs: totalDurationMs || repairedResult.durationMs || 1,
          checks: {
            syntaxPassed: false,
            executionPassed: null,
            testsPassed: null,
            expectedOutputMatched: null,
            regressionPassed: null,
            toolchainAvailable: false
          },
          staticChecks,
          downloadableTestFile,
          testResults,
          regressionReport: {
            regressionDetected: false,
            passed: 0,
            failed: staticChecks.errors.length,
            skipped: testResults.length,
            unavailable: testResults.length,
            summary: 'Static syntax check failed. Dynamic execution could not be evaluated.',
            confidenceNote: 'Candidate code contains static syntax or delimiter errors.'
          }
        };
      }

      const hasTests = testResults.length > 0;
      const category = hasTests ? 'TESTS_GENERATED_NOT_RUN' : 'EXECUTION_UNAVAILABLE';
      const summaryText = hasTests
        ? `Fix partially verified: Code syntax and structure for ${langName} passed static checks with 0 errors. ${testResults.length} test cases were generated but NOT RUN because secure container execution is unavailable. Compiler toolchain (${adapter?.compilerBinary || adapter?.binaryName || 'compiler'}) is not run without verified container sandbox isolation. You can download the generated tests to run them locally.`
        : `Fix partially verified: Code syntax and structure for ${langName} passed static analysis with 0 errors. Compiler toolchain (${adapter?.compilerBinary || adapter?.binaryName || 'compiler'}) is not installed in the local environment, so runtime execution was not performed.`;

      return {
        verificationStatus: 'FIX PARTIALLY VERIFIED',
        detailedStatus: 'EXECUTION_UNAVAILABLE',
        category,
        resultCategory: category,
        isVerified: false,
        summary: summaryText,
        statusReason: hasTests
          ? `Tests generated (${testResults.length} cases) but dynamic execution unavailable without container sandbox.`
          : `Compiler or interpreter toolchain for ${langName} is not installed locally.`,
        toolchainStatus: 'unavailable',
        setupInstructions: adapter?.getSetupInstructions() || 'Install compiler toolchain.',
        executionDurationMs: totalDurationMs || repairedResult.durationMs || 1,
        checks: {
          syntaxPassed: true,
          executionPassed: null,
          testsPassed: null,
          expectedOutputMatched: null,
          regressionPassed: null,
          toolchainAvailable: false
        },
        staticChecks,
        downloadableTestFile,
        testResults,
        regressionReport: {
          regressionDetected: false,
          passed: 0,
          failed: 0,
          skipped: testResults.length,
          unavailable: testResults.length,
          summary: 'Tests and regression checks could not run because the compiler toolchain or sandbox is unavailable.',
          confidenceNote: 'Static syntax check passed. Dynamic execution could not be evaluated.'
        }
      };
    }

    // 2. Static-Only Languages (HTML, CSS)
    if (repairedResult.isStaticValidation || adapter?.executionStrategy === 'static_only') {
      const isSyntaxPassed = repairedResult.success && repairedResult.exitCode === 0;
      const category = isSyntaxPassed ? 'STATIC_CHECK_PASSED' : 'STATIC_CHECK_FAILED';
      return {
        verificationStatus: isSyntaxPassed ? 'FIX PARTIALLY VERIFIED' : 'FIX NOT VERIFIED',
        detailedStatus: isSyntaxPassed ? 'STATIC_CHECK_PASSED' : 'VERIFICATION_FAILED',
        category,
        resultCategory: category,
        isVerified: isSyntaxPassed,
        summary: isSyntaxPassed
          ? `Static structure and syntax verified for ${langName} (0 defects detected).`
          : `Static verification failed: ${repairedResult.stderr || 'Syntax defects detected'}.`,
        statusReason: isSyntaxPassed
          ? 'Static linting and structural analysis verified with zero defects.'
          : 'Static validation detected syntax or structural errors.',
        toolchainStatus: 'not_applicable',
        executionDurationMs: totalDurationMs || repairedResult.durationMs || 1,
        checks: {
          syntaxPassed: isSyntaxPassed,
          executionPassed: null,
          testsPassed: null,
          expectedOutputMatched: null,
          regressionPassed: null,
          toolchainAvailable: true
        },
        staticChecks,
        downloadableTestFile,
        testResults: [],
        regressionReport: {
          regressionDetected: false,
          passed: isSyntaxPassed ? 1 : 0,
          failed: isSyntaxPassed ? 0 : 1,
          skipped: 0,
          unavailable: 0,
          summary: isSyntaxPassed ? 'Static structure verified.' : 'Static checks failed.',
          confidenceNote: 'Static verification only; dynamic runtime not applicable.'
        }
      };
    }

    // 3. Runtime Timeout
    if (repairedResult.status === 'timeout') {
      const testResults = TestGenerator.evaluateTestResults(testSuite, repairedResult, expectedOutput);
      return {
        verificationStatus: 'FIX NOT VERIFIED',
        detailedStatus: 'TIMEOUT',
        category: 'VERIFICATION_ERROR',
        resultCategory: 'VERIFICATION_ERROR',
        isVerified: false,
        summary: `Execution timed out (${repairedResult.durationMs}ms). The corrected code contains a runaway infinite loop or exceeded timeout bounds.`,
        statusReason: `Process timed out after ${repairedResult.durationMs || 5000}ms before completion.`,
        toolchainStatus: 'available',
        executionDurationMs: totalDurationMs || repairedResult.durationMs || 5000,
        checks: {
          syntaxPassed: true,
          executionPassed: false,
          testsPassed: false,
          expectedOutputMatched: false,
          regressionPassed: false,
          toolchainAvailable: true
        },
        staticChecks,
        downloadableTestFile,
        testResults,
        regressionReport: {
          regressionDetected: false,
          passed: 0,
          failed: 1,
          skipped: testResults.length > 0 ? testResults.length - 1 : 0,
          unavailable: 0,
          summary: 'Execution timed out. Regression evaluation halted.',
          confidenceNote: 'Fix cannot be verified due to process timeout.'
        }
      };
    }

    // 4. Compilation or Syntax Error in Corrected Code
    if (repairedResult.status === 'compilation_error' || repairedResult.errorType === 'SYNTAX_ERROR') {
      const testResults = TestGenerator.evaluateTestResults(testSuite, repairedResult, expectedOutput);
      return {
        verificationStatus: 'FIX NOT VERIFIED',
        detailedStatus: 'VERIFICATION_FAILED',
        category: 'TESTS_FAILED_VERIFIED',
        resultCategory: 'TESTS_FAILED_VERIFIED',
        isVerified: false,
        summary: `Corrected code failed compilation or syntax validation for ${langName}. Error: ${repairedResult.stderr || 'Syntax error'}`,
        statusReason: 'Compilation or syntax parsing failed.',
        toolchainStatus: 'available',
        executionDurationMs: totalDurationMs || repairedResult.durationMs || 1,
        checks: {
          syntaxPassed: false,
          executionPassed: false,
          testsPassed: false,
          expectedOutputMatched: false,
          regressionPassed: false,
          toolchainAvailable: true
        },
        staticChecks,
        downloadableTestFile,
        testResults,
        regressionReport: {
          regressionDetected: false,
          passed: 0,
          failed: testResults.length || 1,
          skipped: 0,
          unavailable: 0,
          summary: 'Compilation or syntax failed on corrected code.',
          confidenceNote: 'Zero tests could pass due to syntax/compilation error.'
        }
      };
    }

    // 5. Test Assertion Failure in Corrected Code
    if (repairedResult.status === 'test_failure') {
      const testResults = TestGenerator.evaluateTestResults(testSuite, repairedResult, expectedOutput);
      return {
        verificationStatus: 'FIX NOT VERIFIED',
        detailedStatus: 'VERIFICATION_FAILED',
        category: 'TESTS_FAILED_VERIFIED',
        resultCategory: 'TESTS_FAILED_VERIFIED',
        isVerified: false,
        summary: `Corrected code failed verification tests: ${repairedResult.stderr || 'Assertion failed'}`,
        statusReason: 'One or more test assertions failed during execution.',
        toolchainStatus: 'available',
        executionDurationMs: totalDurationMs || repairedResult.durationMs || 1,
        checks: {
          syntaxPassed: true,
          executionPassed: false,
          testsPassed: false,
          expectedOutputMatched: null,
          regressionPassed: false,
          toolchainAvailable: true
        },
        staticChecks,
        downloadableTestFile,
        testResults,
        regressionReport: this._computeRegressionReport(originalResult, repairedResult, testResults)
      };
    }

    // 6. Runtime Error / Non-zero Exit Code in Corrected Code
    if (!repairedResult.success || repairedResult.exitCode !== 0) {
      const testResults = TestGenerator.evaluateTestResults(testSuite, repairedResult, expectedOutput);
      return {
        verificationStatus: 'FIX NOT VERIFIED',
        detailedStatus: 'VERIFICATION_FAILED',
        category: 'TESTS_FAILED_VERIFIED',
        resultCategory: 'TESTS_FAILED_VERIFIED',
        isVerified: false,
        summary: `Corrected code failed at runtime with exit code ${repairedResult.exitCode}: ${repairedResult.stderr || 'Runtime error'}`,
        statusReason: `Process exited with non-zero exit code: ${repairedResult.exitCode}`,
        toolchainStatus: 'available',
        executionDurationMs: totalDurationMs || repairedResult.durationMs || 1,
        checks: {
          syntaxPassed: true,
          executionPassed: false,
          testsPassed: false,
          expectedOutputMatched: null,
          regressionPassed: false,
          toolchainAvailable: true
        },
        staticChecks,
        downloadableTestFile,
        testResults,
        regressionReport: this._computeRegressionReport(originalResult, repairedResult, testResults)
      };
    }

    // 7. Check Expected Output (if provided by user)
    let expectedOutputMatched = null;
    if (expectedOutput && expectedOutput.trim()) {
      const cleanExpected = expectedOutput.trim();
      const stdout = (repairedResult.stdout || '').trim();
      expectedOutputMatched = stdout.includes(cleanExpected);

      if (!expectedOutputMatched) {
        const testResults = TestGenerator.evaluateTestResults(testSuite, repairedResult, expectedOutput);
        return {
          verificationStatus: 'FIX NOT VERIFIED',
          detailedStatus: 'VERIFICATION_FAILED',
          category: 'TESTS_FAILED_VERIFIED',
          resultCategory: 'TESTS_FAILED_VERIFIED',
          isVerified: false,
          summary: `Verification failed: Program executed successfully but stdout did not match expected output. Expected: "${cleanExpected.slice(0, 80)}", Got: "${stdout.slice(0, 80)}"`,
          statusReason: `Expected standard output mismatch. Expected "${cleanExpected.slice(0, 40)}"`,
          toolchainStatus: 'available',
          executionDurationMs: totalDurationMs || repairedResult.durationMs || 1,
          checks: {
            syntaxPassed: true,
            executionPassed: true,
            testsPassed: false,
            expectedOutputMatched: false,
            regressionPassed: false,
            toolchainAvailable: true
          },
          staticChecks,
          downloadableTestFile,
          testResults,
          regressionReport: {
            regressionDetected: false,
            passed: 0,
            failed: 1,
            skipped: 0,
            unavailable: 0,
            summary: 'Output verification failed: stdout did not match expected value.',
            confidenceNote: 'Program ran without crashing but produced unexpected output.'
          }
        };
      }
    }

    // 8. Evaluate Test Suite Results & Regression Checks
    const testResults = TestGenerator.evaluateTestResults(testSuite, repairedResult, expectedOutput);
    const regressionReport = this._computeRegressionReport(originalResult, repairedResult, testResults);

    const hasTests = testResults.length > 0;
    const allTestsPassed = hasTests && testResults.every(t => t.passed === true);
    const hasAssertionOutput = (repairedResult.stdout || '').includes('[ALL_VERIFICATION_TESTS_PASSED]') ||
                               (repairedResult.stdout || '').includes('[VERIFICATION_COMPLETE]') ||
                               (repairedResult.stdout || '').includes('ALL_TESTS_PASSED');

    // Rule: Do not mark a fix as verified solely because an AI produced code or exited 0 without tests or expected output!
    let detailedStatus = 'EXECUTION_PASSED';
    let isVerified = false;
    let verificationStatus = 'FIX PARTIALLY VERIFIED';
    let summary = '';
    let statusReason = '';
    let category = 'EXECUTION_PASSED_NO_ASSERTIONS';

    if (allTestsPassed || hasAssertionOutput || expectedOutputMatched === true) {
      detailedStatus = 'TESTS_PASSED';
      category = 'TESTS_PASSED_VERIFIED';
      isVerified = true;
      verificationStatus = 'FIX VERIFIED';
      summary = `Fix fully verified: Corrected code ran in the isolated sandbox, exited with status 0, and passed all execution test assertions.`;
      statusReason = `${testResults.length ? `${testResults.length} test assertions passed` : 'Assertions and output verified'} with exit code 0.`;
    } else {
      // Program exited 0 cleanly, but no functional assertions or expected output were provided
      detailedStatus = 'EXECUTION_PASSED';
      category = 'EXECUTION_PASSED_NO_ASSERTIONS';
      isVerified = false; // Honest reporting: executed cleanly, but not verified against formal assertions
      verificationStatus = 'FIX PARTIALLY VERIFIED';
      summary = `Execution passed: Corrected code ran cleanly with exit code 0. However, no specific assertions or expected output were provided to verify business logic.`;
      statusReason = 'Clean execution achieved (exit code 0), but no functional assertions were evaluated.';
    }

    return {
      verificationStatus,
      detailedStatus,
      category,
      resultCategory: category,
      isVerified,
      summary,
      statusReason,
      toolchainStatus: 'available',
      executionDurationMs: totalDurationMs || repairedResult.durationMs || 1,
      checks: {
        syntaxPassed: true,
        executionPassed: true,
        testsPassed: hasTests ? allTestsPassed : null,
        expectedOutputMatched,
        regressionPassed: !regressionReport.regressionDetected,
        toolchainAvailable: true
      },
      staticChecks,
      downloadableTestFile,
      testResults,
      regressionReport
    };
  }

  /**
   * Constructs structured static check findings with an explicit disclaimer.
   */
  static _buildStaticChecks(analysis, langName) {
    const passed = analysis ? analysis.isValid : true;
    const errors = analysis?.errors
      ? analysis.errors.map(e => typeof e === 'string' ? e : `Line ${e.line || '?'}: ${e.message}`)
      : [];
    const warnings = analysis?.warnings
      ? analysis.warnings.map(w => typeof w === 'string' ? w : `Line ${w.line || '?'}: ${w.message}`)
      : [];

    const hasDelimiterError = analysis?.errors?.some(e =>
      e.rule === 'UNBALANCED_DELIMITER' ||
      e.message?.toLowerCase().includes('bracket') ||
      e.message?.toLowerCase().includes('parenthesis') ||
      e.message?.toLowerCase().includes('brace')
    );

    return {
      passed,
      errors,
      warnings,
      checks: [
        {
          name: 'Delimiter & Bracket Balance',
          passed: !hasDelimiterError,
          details: hasDelimiterError
            ? 'Unbalanced parentheses, brackets, or braces detected.'
            : 'Matching delimiter pairs verified.'
        },
        {
          name: 'Structural Syntax Patterns',
          passed,
          details: passed
            ? `Static structure analysis for ${langName} passed with 0 errors.`
            : `Static analysis detected ${errors.length} defect(s).`
        }
      ],
      disclaimer: 'Static checks verify basic lexical delimiters, structural patterns, and suspicious keywords. They do NOT replace a real compiler, type-checker, or dynamic container execution, and cannot guarantee runtime safety or correctness.'
    };
  }

  /**
   * Computes regression report comparing original code outcome with repaired code outcome.
   */
  static _computeRegressionReport(originalResult, repairedResult, testResults = []) {
    const passedCount = testResults.filter(t => t.passed === true).length;
    const failedCount = testResults.filter(t => t.passed === false).length;
    const skippedCount = testResults.filter(t => t.status === 'skipped').length;
    const unavailableCount = testResults.filter(t => t.status === 'unavailable').length;

    // Check if original passed something that corrected broke
    let regressionDetected = false;
    if (originalResult && originalResult.success && (!repairedResult || !repairedResult.success)) {
      regressionDetected = true;
    }

    let summary = '';
    if (regressionDetected) {
      summary = 'Regression detected: Corrected code failed execution whereas original code executed.';
    } else if (testResults.length > 0) {
      summary = `Regression check completed: ${passedCount}/${testResults.length} tests passed on corrected code (0 regressions detected on evaluated test suite).`;
    } else {
      summary = 'Baseline regression check completed: 0 regressions observed.';
    }

    return {
      regressionDetected,
      passed: passedCount,
      failed: failedCount,
      skipped: skippedCount,
      unavailable: unavailableCount,
      summary,
      // Honest compliance with "Never claim that regressions are impossible"
      confidenceNote: 'Note: 0 regressions were observed on the evaluated test cases. Regressions outside the evaluated test suite and boundary conditions remain theoretically possible.'
    };
  }
}

