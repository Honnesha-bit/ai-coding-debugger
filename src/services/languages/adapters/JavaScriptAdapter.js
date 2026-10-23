import { BaseAdapter } from './BaseAdapter.js';

export class JavaScriptAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'javascript',
      name: 'JavaScript (Node.js)',
      extensions: ['.js', '.mjs', '.cjs'],
      isCompiled: false,
      isCore: true,
      binaryName: 'node',
      executionStrategy: 'native_subprocess',
      sampleCode: 'function add(a, b) {\n    return a + b;\n}\n\nconsole.log(add(2, 3));'
    });
  }

  getSetupInstructions() {
    return 'Install Node.js 20+ from nodejs.org and verify that "node" is accessible in your system PATH.';
  }

  staticAnalyze(code) {
    const errors = [];
    const warnings = [];
    const lines = (code || '').split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

      // 1. Python keywords in JavaScript
      if (/\bdef\s+[a-z_][a-z0-9_]*\s*\(/.test(trimmed)) {
        errors.push({
          line: lineNum,
          message: `Python 'def' keyword used in JavaScript. Use 'function' or an arrow function instead.`,
          rule: 'JS_PYTHON_SYNTAX'
        });
      }

      if (/\belif\b/.test(trimmed)) {
        errors.push({
          line: lineNum,
          message: `'elif' is invalid in JavaScript. Use 'else if' instead.`,
          rule: 'JS_INVALID_ELIF'
        });
      }

      if (/\b(?:None|True|False)\b/.test(trimmed)) {
        warnings.push({
          line: lineNum,
          message: `Python boolean/null constant detected. Use 'null', 'undefined', 'true', or 'false' in JavaScript.`
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  getSyntaxCheckCommand(filePath) {
    return {
      command: 'node',
      args: ['--check', filePath]
    };
  }

  getExecutionCommand(targetPath) {
    return {
      command: 'node',
      args: [targetPath]
    };
  }

  generateTestWrapper({ code, customTestCases = '', expectedOutput = '' }) {
    const testCode = this._normalizeTestCode(customTestCases);
    if (testCode) {
      return `${code}\n\n// --- AUTOMATED TESTS ---\n${testCode}`;
    }
    const expected = typeof expectedOutput === 'string' ? expectedOutput.trim() : '';
    if (expected) {
      return `${code}\n\n// --- AUTOMATED VERIFICATION ---\nconsole.log("[VERIFICATION_COMPLETE]");`;
    }
    return code;
  }
}
