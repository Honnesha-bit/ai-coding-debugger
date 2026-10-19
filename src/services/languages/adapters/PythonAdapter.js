import { BaseAdapter } from './BaseAdapter.js';

export class PythonAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'python',
      name: 'Python 3',
      extensions: ['.py', '.py3'],
      isCompiled: false,
      isCore: true,
      binaryName: 'python',
      executionStrategy: 'native_subprocess',
      sampleCode: 'def add(a, b):\n    return a + b\n\nprint(add(2, 3))'
    });
  }

  getSetupInstructions() {
    return 'Install Python 3.10+ from python.org or via Microsoft Store, and verify that "python" is accessible from system PATH.';
  }

  staticAnalyze(code) {
    const errors = [];
    const warnings = [];
    const lines = (code || '').split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) continue;

      // 1. Missing colon on block statements
      if (/^(?:def|class|if|elif|else|for|while|try|except|finally|with)\b/.test(trimmed)) {
        if (!trimmed.endsWith(':') && !trimmed.includes('#')) {
          errors.push({
            line: lineNum,
            message: `Missing colon (':') at end of statement: '${trimmed}'`,
            rule: 'PYTHON_MISSING_COLON'
          });
        }
      }

      // 2. JS operators in Python
      if (/\b===\b|\b!==\b/.test(trimmed)) {
        errors.push({
          line: lineNum,
          message: `JavaScript strict equality operator detected in Python. Use '==' or '!=' instead.`,
          rule: 'PYTHON_INVALID_OPERATOR'
        });
      }

      // 3. Python 2 print statement
      if (/^print\s+["'][^"']*["']/.test(trimmed)) {
        errors.push({
          line: lineNum,
          message: `Python 3 requires parentheses for print function: print(...)`,
          rule: 'PYTHON_PRINT_PARENS'
        });
      }

      // 4. Semicolons are discouraged
      if (trimmed.endsWith(';') && !trimmed.includes('{')) {
        warnings.push({
          line: lineNum,
          message: `Unnecessary trailing semicolon in Python code.`
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
      command: 'python',
      args: ['-m', 'py_compile', filePath]
    };
  }

  getExecutionCommand(targetPath) {
    return {
      command: 'python',
      args: [targetPath]
    };
  }

  generateTestWrapper({ code, customTestCases = '', expectedOutput = '' }) {
    if (customTestCases && customTestCases.trim()) {
      return `${code}\n\n# --- AUTOMATED TESTS ---\n${customTestCases.trim()}`;
    }
    if (expectedOutput && expectedOutput.trim()) {
      return `${code}\n\n# --- AUTOMATED VERIFICATION ---\nprint("[VERIFICATION_COMPLETE]")`;
    }
    return code;
  }
}
