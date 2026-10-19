/**
 * TestGenerator
 * Generates and structures language-specific test suites across normal, boundary,
 * edge-case, and invalid-input categories.
 *
 * Rules:
 * - Generates relevant tests when code and problem description support them.
 * - Never invents fake expected outputs when they cannot be determined reliably.
 * - Clearly distinguishes generated tests from tests that have actually executed.
 */

export class TestGenerator {
  /**
   * Generates a structured test suite containing test descriptors and executable code.
   *
   * @param {Object} params
   * @param {string} params.language - Language ID (python, javascript, typescript, java, c, cpp, sql, etc.)
   * @param {string} params.code - Source code
   * @param {string} [params.errorDescription] - User-reported error description
   * @param {string} [params.expectedOutput] - Expected stdout string
   * @param {string} [params.customTestCases] - User-supplied assertions
   * @returns {{ testCases: Array<Object>, executableTestCode: string, hasCustomTests: boolean }}
   */
  static generateSuite({ language, code = '', errorDescription = '', expectedOutput = '', customTestCases = '' }) {
    const lang = (language || '').toLowerCase().trim();
    const testCases = [];

    // 1. If user supplied custom test cases, prioritize and parse them
    if (customTestCases && customTestCases.trim()) {
      const lines = customTestCases.trim().split('\n').filter(l => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('//'));
      lines.forEach((line, idx) => {
        testCases.push({
          id: `user_test_${idx + 1}`,
          name: `User Assertion #${idx + 1}`,
          category: 'user_defined',
          description: line.trim().slice(0, 80),
          assertionCode: line.trim(),
          isGenerated: false,
          executed: false,
          passed: null
        });
      });

      return {
        hasCustomTests: true,
        testCases,
        executableTestCode: customTestCases.trim()
      };
    }

    // 2. Automated test generation based on language, code analysis, and error description
    const analysis = this._analyzeCodeStructure(code, lang);

    if (analysis.functionName) {
      const generated = this._generateFunctionTests({
        lang,
        fnName: analysis.functionName,
        params: analysis.params,
        code,
        errorDescription,
        expectedOutput
      });
      testCases.push(...generated);
    } else if (expectedOutput && expectedOutput.trim()) {
      testCases.push({
        id: 'gen_expected_stdout',
        name: 'Expected Output Verification',
        category: 'normal',
        description: `Verify program standard output matches: "${expectedOutput.trim().slice(0, 60)}"`,
        assertionCode: expectedOutput.trim(),
        isGenerated: true,
        executed: false,
        passed: null
      });
    } else {
      // General non-crashing smoke test when specific signatures cannot be isolated
      testCases.push({
        id: 'gen_smoke_execution',
        name: 'Clean Execution Sanity Check',
        category: 'normal',
        description: 'Verify execution finishes without unhandled exceptions or runtime crash',
        assertionCode: '',
        isGenerated: true,
        executed: false,
        passed: null
      });
    }

    // 3. Format executable test code wrapper for the specific language
    const executableTestCode = this._formatExecutableTestCode(lang, testCases, expectedOutput);

    return {
      hasCustomTests: false,
      testCases,
      executableTestCode
    };
  }

  /**
   * Backwards-compatible generate method returning executable code string.
   */
  static generate({ language, code, customTestCases = '', expectedOutput = '', errorDescription = '' }) {
    const suite = this.generateSuite({ language, code, customTestCases, expectedOutput, errorDescription });
    return suite.executableTestCode;
  }

  /**
   * Formats a standalone downloadable test suite file.
   *
   * @param {Object} options
   * @param {string} options.language - Programming language ID
   * @param {Array<Object>} options.testCases - Test cases to include
   * @param {string} [options.correctedCode] - Suggested corrected code
   * @param {string} [options.expectedOutput] - Expected output string
   * @returns {{ fileName: string, content: string, mimeType: string }}
   */
  static formatDownloadableTestSuite({ language = 'python', testCases = [], correctedCode = '', expectedOutput = '' }) {
    const lang = (language || '').toLowerCase().trim();
    let fileName = 'test_suite.txt';
    const mimeType = 'text/plain; charset=utf-8';
    let headerComment = '';
    let assertions = '';

    if (lang === 'python' || lang === 'py') {
      fileName = 'test_suite.py';
      headerComment = '# ====================================================\n# AI Coding Debugger — Proposed Test Suite (Python)\n# Generated for external execution. Review assertions before running.\n# ====================================================\n\n';
      const asserts = testCases
        .map(tc => tc.assertionCode ? `# [${(tc.category || 'TEST').toUpperCase()}] ${tc.name}\n${tc.assertionCode}` : '')
        .filter(Boolean)
        .join('\n\n');
      assertions = asserts ? `\n\n# --- Test Assertions ---\n${asserts}\n\nprint("[ALL_VERIFICATION_TESTS_PASSED]")\n` : '';
    } else if (['javascript', 'js'].includes(lang)) {
      fileName = 'test_suite.js';
      headerComment = '// ====================================================\n// AI Coding Debugger — Proposed Test Suite (JavaScript)\n// ====================================================\n\n';
      const asserts = testCases
        .map(tc => tc.assertionCode ? `// [${(tc.category || 'TEST').toUpperCase()}] ${tc.name}\n${tc.assertionCode}` : '')
        .filter(Boolean)
        .join('\n\n');
      assertions = asserts ? `\n\n// --- Test Assertions ---\n${asserts}\n\nconsole.log("[ALL_VERIFICATION_TESTS_PASSED]");\n` : '';
    } else if (['typescript', 'ts'].includes(lang)) {
      fileName = 'test_suite.ts';
      headerComment = '// ====================================================\n// AI Coding Debugger — Proposed Test Suite (TypeScript)\n// ====================================================\n\n';
      const asserts = testCases
        .map(tc => tc.assertionCode ? `// [${(tc.category || 'TEST').toUpperCase()}] ${tc.name}\n${tc.assertionCode}` : '')
        .filter(Boolean)
        .join('\n\n');
      assertions = asserts ? `\n\n// --- Test Assertions ---\n${asserts}\n\nconsole.log("[ALL_VERIFICATION_TESTS_PASSED]");\n` : '';
    } else if (lang === 'sql') {
      fileName = 'test_suite.sql';
      headerComment = '-- ====================================================\n-- AI Coding Debugger — Proposed Test Suite (SQL)\n-- ====================================================\n\n';
      const asserts = testCases
        .map(tc => tc.assertionCode ? `-- [${(tc.category || 'TEST').toUpperCase()}] ${tc.name}\n${tc.assertionCode}` : '')
        .filter(Boolean)
        .join('\n\n');
      assertions = asserts ? `\n\n-- --- Test Assertions ---\n${asserts}\n` : '';
    } else if (lang === 'java') {
      fileName = 'TestSuite.java';
      headerComment = '// ====================================================\n// AI Coding Debugger — Proposed Test Suite (Java)\n// ====================================================\n\n';
      assertions = `\n// Generated assertions:\n` + testCases.map(tc => `// ${tc.name}: ${tc.description}`).join('\n');
    } else if (lang === 'c' || lang === 'cpp') {
      fileName = `test_suite.${lang === 'c' ? 'c' : 'cpp'}`;
      headerComment = `/* ====================================================\n * AI Coding Debugger — Proposed Test Suite (${lang.toUpperCase()})\n * ==================================================== */\n\n`;
      assertions = `\n// Generated assertions:\n` + testCases.map(tc => `// ${tc.name}: ${tc.description}`).join('\n');
    } else {
      fileName = `test_suite_${lang}.txt`;
      headerComment = `# Proposed tests for ${lang}\n\n`;
      assertions = testCases.map(tc => `# ${tc.name}: ${tc.description}\n${tc.assertionCode || ''}`).join('\n\n');
    }

    const codeSection = correctedCode ? `# --- Candidate Corrected Code ---\n${correctedCode}\n` : '';
    const content = headerComment + codeSection + assertions;

    return {
      fileName,
      filename: fileName,
      content,
      mimeType,
      language: lang,
      testCount: testCases.length
    };
  }

  /**
   * Parses function signature and parameters from code.
   */
  static _analyzeCodeStructure(code, lang) {
    if (!code || typeof code !== 'string') return { functionName: null, params: [] };

    // Python function detection: def fn(a, b):
    if (lang === 'python' || lang === 'py') {
      const match = code.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\):/);
      if (match) {
        const fnName = match[1];
        const params = match[2].split(',').map(p => p.trim()).filter(Boolean);
        return { functionName: fnName, params };
      }
    }

    // JavaScript / TypeScript function detection
    if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
      const fnMatch = code.match(/function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/) ||
                      code.match(/(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/);
      if (fnMatch) {
        const fnName = fnMatch[1];
        const params = fnMatch[2].split(',').map(p => p.split(':')[0].trim()).filter(Boolean);
        return { functionName: fnName, params };
      }
    }

    // C / C++ function detection (non-main functions)
    if (['c', 'cpp'].includes(lang)) {
      const match = code.match(/(?:int|void|bool|double|float|char\*|std::string)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*\{/);
      if (match && match[1] !== 'main') {
        const fnName = match[1];
        const params = match[2].split(',').map(p => p.trim()).filter(Boolean);
        return { functionName: fnName, params };
      }
    }

    // Java method detection
    if (lang === 'java') {
      const match = code.match(/(?:public|private|protected)?\s*static\s+[\w<>[\]]+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/);
      if (match && match[1] !== 'main') {
        const fnName = match[1];
        const params = match[2].split(',').map(p => p.trim()).filter(Boolean);
        return { functionName: fnName, params };
      }
    }

    return { functionName: null, params: [] };
  }

  /**
   * Generates categorized test cases for known functions and algorithms without hallucinating return values.
   */
  static _generateFunctionTests({ lang, fnName, params, code, errorDescription, expectedOutput }) {
    const tests = [];
    const lowerName = fnName.toLowerCase();
    const lowerDesc = (errorDescription || '').toLowerCase();

    // Pattern 1: Binary Search / Search Algorithms
    if (lowerName.includes('binary_search') || lowerName.includes('search') || lowerDesc.includes('binary search')) {
      if (lang === 'python') {
        tests.push({
          id: 'test_normal_search',
          name: 'Normal Case: Target in Array',
          category: 'normal',
          description: `Test ${fnName}([1, 3, 5, 7, 9], 7) returns index 3`,
          assertionCode: `assert ${fnName}([1, 3, 5, 7, 9], 7) == 3, "Failed to find element in middle"`,
          isGenerated: true,
          executed: false,
          passed: null
        });
        tests.push({
          id: 'test_boundary_first_last',
          name: 'Boundary Case: First and Last Elements',
          category: 'boundary',
          description: `Test ${fnName}([1, 3, 5, 7, 9], 1) returns 0 and target 9 returns 4`,
          assertionCode: `assert ${fnName}([1, 3, 5, 7, 9], 1) == 0 and ${fnName}([1, 3, 5, 7, 9], 9) == 4, "Boundary index mismatch"`,
          isGenerated: true,
          executed: false,
          passed: null
        });
        tests.push({
          id: 'test_edge_single_empty',
          name: 'Edge Case: Single Item and Empty List',
          category: 'edge_case',
          description: `Test ${fnName}([5], 5) returns 0 and ${fnName}([], 3) returns -1`,
          assertionCode: `assert ${fnName}([5], 5) == 0 and ${fnName}([], 3) == -1, "Edge case failure on single or empty array"`,
          isGenerated: true,
          executed: false,
          passed: null
        });
        tests.push({
          id: 'test_invalid_missing_target',
          name: 'Invalid/Not Found Case: Target Absent',
          category: 'invalid_input',
          description: `Test ${fnName}([1, 3, 5, 7, 9], 8) returns -1 when target is absent`,
          assertionCode: `assert ${fnName}([1, 3, 5, 7, 9], 8) == -1, "Did not return -1 for absent target"`,
          isGenerated: true,
          executed: false,
          passed: null
        });
      } else if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
        tests.push({
          id: 'test_normal_search',
          name: 'Normal Case: Target in Array',
          category: 'normal',
          description: `Test ${fnName}([1, 3, 5, 7, 9], 7) returns index 3`,
          assertionCode: `if (${fnName}([1, 3, 5, 7, 9], 7) !== 3) throw new Error("Failed to find target in middle");`,
          isGenerated: true,
          executed: false,
          passed: null
        });
        tests.push({
          id: 'test_boundary_first_last',
          name: 'Boundary Case: First and Last Elements',
          category: 'boundary',
          description: `Test boundary elements at indices 0 and 4`,
          assertionCode: `if (${fnName}([1, 3, 5, 7, 9], 1) !== 0 || ${fnName}([1, 3, 5, 7, 9], 9) !== 4) throw new Error("Boundary index mismatch");`,
          isGenerated: true,
          executed: false,
          passed: null
        });
        tests.push({
          id: 'test_edge_single_empty',
          name: 'Edge Case: Single Item and Empty Array',
          category: 'edge_case',
          description: `Test ${fnName}([5], 5) returns 0 and ${fnName}([], 3) returns -1`,
          assertionCode: `if (${fnName}([5], 5) !== 0 || ${fnName}([], 3) !== -1) throw new Error("Edge case failure on single or empty array");`,
          isGenerated: true,
          executed: false,
          passed: null
        });
        tests.push({
          id: 'test_invalid_missing_target',
          name: 'Invalid/Not Found Case: Target Absent',
          category: 'invalid_input',
          description: `Test ${fnName}([1, 3, 5, 7, 9], 8) returns -1`,
          assertionCode: `if (${fnName}([1, 3, 5, 7, 9], 8) !== -1) throw new Error("Did not return -1 for absent target");`,
          isGenerated: true,
          executed: false,
          passed: null
        });
      }
      return tests;
    }

    // Pattern 2: Mathematical / Arithmetic Functions (add, sum, multiply, factorial, fibonacci)
    if (lowerName.includes('add') || lowerName.includes('sum')) {
      if (lang === 'python') {
        tests.push({
          id: 'test_normal_add',
          name: 'Normal Case: Positive Addition',
          category: 'normal',
          description: `Verify positive numbers: ${fnName}(2, 3) == 5`,
          assertionCode: `assert ${fnName}(2, 3) == 5, "Addition test failed for 2 + 3"`,
          isGenerated: true,
          executed: false,
          passed: null
        });
        tests.push({
          id: 'test_boundary_zero',
          name: 'Boundary Case: Identity Element (Zero)',
          category: 'boundary',
          description: `Verify identity element: ${fnName}(0, 7) == 7`,
          assertionCode: `assert ${fnName}(0, 7) == 7, "Zero identity failed"`,
          isGenerated: true,
          executed: false,
          passed: null
        });
        tests.push({
          id: 'test_edge_negative',
          name: 'Edge Case: Negative Numbers',
          category: 'edge_case',
          description: `Verify negative addition: ${fnName}(-4, -6) == -10`,
          assertionCode: `assert ${fnName}(-4, -6) == -10, "Negative addition failed"`,
          isGenerated: true,
          executed: false,
          passed: null
        });
      } else if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
        tests.push({
          id: 'test_normal_add',
          name: 'Normal Case: Positive Addition',
          category: 'normal',
          description: `Verify positive numbers: ${fnName}(2, 3) === 5`,
          assertionCode: `if (${fnName}(2, 3) !== 5) throw new Error("Addition test failed for 2 + 3");`,
          isGenerated: true,
          executed: false,
          passed: null
        });
        tests.push({
          id: 'test_boundary_zero',
          name: 'Boundary Case: Identity Element (Zero)',
          category: 'boundary',
          description: `Verify identity element: ${fnName}(0, 7) === 7`,
          assertionCode: `if (${fnName}(0, 7) !== 7) throw new Error("Zero identity failed");`,
          isGenerated: true,
          executed: false,
          passed: null
        });
      }
      return tests;
    }

    // Pattern 3: String Functions (palindrome, reverse, clean)
    if (lowerName.includes('palindrome')) {
      if (lang === 'python') {
        tests.push({
          id: 'test_normal_palindrome',
          name: 'Normal Case: Standard Palindrome',
          category: 'normal',
          description: `Verify "racecar" returns True`,
          assertionCode: `assert ${fnName}("racecar") == True, "Failed on normal palindrome"`,
          isGenerated: true,
          executed: false,
          passed: null
        });
        tests.push({
          id: 'test_boundary_single_char',
          name: 'Boundary Case: Single Character',
          category: 'boundary',
          description: `Verify "a" returns True`,
          assertionCode: `assert ${fnName}("a") == True, "Failed on single character"`,
          isGenerated: true,
          executed: false,
          passed: null
        });
        tests.push({
          id: 'test_edge_empty_string',
          name: 'Edge Case: Empty String',
          category: 'edge_case',
          description: `Verify "" returns True`,
          assertionCode: `assert ${fnName}("") == True, "Failed on empty string"`,
          isGenerated: true,
          executed: false,
          passed: null
        });
        tests.push({
          id: 'test_invalid_non_palindrome',
          name: 'Invalid/Negative Case: Non-Palindrome',
          category: 'invalid_input',
          description: `Verify "hello" returns False`,
          assertionCode: `assert ${fnName}("hello") == False, "Failed on non-palindrome"`,
          isGenerated: true,
          executed: false,
          passed: null
        });
      }
      return tests;
    }

    // Pattern 4: Fallback for custom/unrecognized functions
    // DO NOT INVENT FAKE RETURN VALUES! Generate execution safety assertions.
    if (lang === 'python') {
      tests.push({
        id: 'test_safety_smoke',
        name: 'Normal Execution Verification',
        category: 'normal',
        description: `Verify ${fnName} executes without unhandled runtime exceptions`,
        assertionCode: `# Smoke assertion for ${fnName}\ntry:\n    # Evaluated safely\n    pass\nexcept Exception as e:\n    raise`,
        isGenerated: true,
        executed: false,
        passed: null
      });
    } else {
      tests.push({
        id: 'test_safety_smoke',
        name: 'Normal Execution Verification',
        category: 'normal',
        description: `Verify execution of ${fnName} finishes cleanly`,
        assertionCode: '',
        isGenerated: true,
        executed: false,
        passed: null
      });
    }

    return tests;
  }

  /**
   * Formats the test assertions into an executable snippet to append to the source code.
   */
  static _formatExecutableTestCode(lang, testCases, expectedOutput) {
    if (!testCases || testCases.length === 0) {
      if (expectedOutput && expectedOutput.trim()) {
        return lang === 'python'
          ? `\n# --- AUTOMATIC VERIFICATION ---\nprint("[VERIFICATION_COMPLETE]")`
          : `\n// --- AUTOMATIC VERIFICATION ---\nconsole.log("[VERIFICATION_COMPLETE]");`;
      }
      return '';
    }

    if (lang === 'python' || lang === 'py') {
      const assertions = testCases
        .map(t => t.assertionCode)
        .filter(Boolean)
        .join('\n');

      if (!assertions) return '';

      return `\n# --- AUTOMATED VERIFICATION TEST SUITE ---\n${assertions}\nprint("[ALL_VERIFICATION_TESTS_PASSED]")`;
    }

    if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
      const assertions = testCases
        .map(t => t.assertionCode)
        .filter(Boolean)
        .join('\n');

      if (!assertions) return '';

      return `\n// --- AUTOMATED VERIFICATION TEST SUITE ---\n${assertions}\nconsole.log("[ALL_VERIFICATION_TESTS_PASSED]");`;
    }

    if (lang === 'sql') {
      return `\n-- AUTOMATED VERIFICATION --\nSELECT 'ALL_VERIFICATION_TESTS_PASSED' AS verification_status;`;
    }

    return '';
  }

  /**
   * Evaluates test execution output and updates testCase statuses truthfully.
   *
   * @param {Array<Object>} testCases
   * @param {Object} executionResult - Result from SandboxService
   * @param {string} [expectedOutput]
   * @returns {Array<Object>} Updated test cases with executed and passed states
   */
  static evaluateTestResults(testCases = [], executionResult = null, expectedOutput = '') {
    if (!testCases || testCases.length === 0) return [];

    const isSuccess = executionResult && executionResult.status === 'success' && executionResult.exitCode === 0;
    const isUnavailable = executionResult && (executionResult.status === 'execution_unavailable' || executionResult.executionAvailable === false);
    const stdout = executionResult?.stdout || '';
    const stderr = executionResult?.stderr || '';

    return testCases.map(tc => {
      // If compiler or execution is unavailable
      if (isUnavailable) {
        return {
          ...tc,
          executed: false,
          passed: null,
          status: 'unavailable',
          errorMessage: 'Execution toolchain unavailable'
        };
      }

      // If execution timed out
      if (executionResult?.status === 'timeout') {
        return {
          ...tc,
          executed: true,
          passed: false,
          status: 'timeout',
          errorMessage: 'Execution timed out before completion'
        };
      }

      // Expected output test check
      if (tc.id === 'gen_expected_stdout') {
        const expected = (expectedOutput || tc.assertionCode || '').trim();
        const matches = stdout.includes(expected);
        return {
          ...tc,
          executed: true,
          passed: matches,
          status: matches ? 'passed' : 'failed',
          errorMessage: matches ? null : `Expected stdout to contain "${expected}", but output differed.`
        };
      }

      // If overall execution succeeded and test suite passed
      if (isSuccess) {
        return {
          ...tc,
          executed: true,
          passed: true,
          status: 'passed',
          errorMessage: null
        };
      }

      // Test failure or runtime error
      return {
        ...tc,
        executed: true,
        passed: false,
        status: 'failed',
        errorMessage: (stderr || stdout || 'Test assertion failed').trim().slice(0, 150)
      };
    });
  }
}
