import { BaseAdapter } from './BaseAdapter.js';

export class TypeScriptAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'typescript',
      name: 'TypeScript',
      extensions: ['.ts', '.tsx', '.mts'],
      isCompiled: true,
      isCore: true,
      binaryName: 'node',
      compilerBinary: 'node --experimental-strip-types',
      executionStrategy: 'native_subprocess',
      sampleCode: 'function multiply(a: number, b: number): number {\n    return a * b;\n}\n\nconsole.log(multiply(4, 5));'
    });
  }

  getSetupInstructions() {
    return 'TypeScript execution uses Node.js v22.6+ native type-stripping (--experimental-strip-types). Ensure Node.js v22.6+ or higher is installed and in your PATH, or install the compiler via "npm install -g typescript".';
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

      // 1. Python keywords
      if (/\bdef\s+[a-z_][a-z0-9_]*\s*\(/.test(trimmed)) {
        errors.push({
          line: lineNum,
          message: `Python 'def' keyword used in TypeScript. Use 'function' or type-annotated arrow function instead.`,
          rule: 'TS_PYTHON_SYNTAX'
        });
      }

      // 2. Malformed interface declaration
      if (/^interface\s*\{/.test(trimmed)) {
        errors.push({
          line: lineNum,
          message: `Malformed interface declaration: missing interface identifier name.`,
          rule: 'TS_MISSING_INTERFACE_NAME'
        });
      }

      // 3. Malformed type alias
      if (/^type\s+[a-zA-Z0-9_]+\s*[^=;{]/i.test(trimmed) && !trimmed.includes('=')) {
        errors.push({
          line: lineNum,
          message: `Malformed type alias: missing '=' assignment operator.`,
          rule: 'TS_MISSING_TYPE_EQUALS'
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
      args: ['--experimental-strip-types', '--check', filePath]
    };
  }

  getExecutionCommand(targetPath) {
    return {
      command: 'node',
      args: ['--experimental-strip-types', targetPath]
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
