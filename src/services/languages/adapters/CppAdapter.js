import { BaseAdapter } from './BaseAdapter.js';

export class CppAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'cpp',
      name: 'C++',
      extensions: ['.cpp', '.cc', '.cxx', '.hpp'],
      isCompiled: true,
      isCore: true,
      binaryName: 'g++',
      compilerBinary: 'g++',
      executionStrategy: 'native_subprocess',
      sampleCode: '#include <iostream>\n\nint main() {\n    std::cout << "Hello from C++!" << std::endl;\n    return 0;\n}'
    });
  }

  getSetupInstructions() {
    return 'Install G++ via MinGW-w64 (MSYS2 or winlibs.com) on Windows, or "g++" on Linux, and verify that "g++" is accessible from system PATH.';
  }

  getSourceFileName() {
    return 'solution.cpp';
  }

  staticAnalyze(code) {
    const errors = [];
    const warnings = [];
    const lines = (code || '').split('\n');

    let hasMain = false;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

      if (/\bint\s+main\s*\(/.test(trimmed)) {
        hasMain = true;
      }

      // 1. Missing semicolon on statements
      if (/^(?:int|double|float|char|long|short|unsigned|return|std::cout|std::cin|auto)\b/.test(trimmed)) {
        if (!trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.endsWith(':')) {
          errors.push({
            line: lineNum,
            message: `Missing semicolon (';') at end of statement: '${trimmed}'`,
            rule: 'CPP_MISSING_SEMICOLON'
          });
        }
      }

      // 2. Python syntax in C++
      if (/\bdef\s+[a-z_]/.test(trimmed)) {
        errors.push({
          line: lineNum,
          message: `Python 'def' keyword used in C++. C++ requires explicit type declarations or 'auto'.`,
          rule: 'CPP_PYTHON_SYNTAX'
        });
      }
    }

    if (!hasMain) {
      warnings.push({
        line: 1,
        message: 'No main() function found. C++ executable programs require an entrypoint: int main().'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  getCompilationCommand(filePath, tempDir, outputExecutablePath) {
    return {
      command: 'g++',
      args: ['-std=c++17', '-O2', '-Wall', filePath, '-o', outputExecutablePath]
    };
  }

  getExecutionCommand(outputExecutablePath) {
    return {
      command: outputExecutablePath,
      args: []
    };
  }

  generateTestWrapper({ code, customTestCases = '', expectedOutput = '' }) {
    const testCode = this._normalizeTestCode(customTestCases);
    if (testCode) {
      return `${code}\n\n// --- AUTOMATED TESTS ---\n${testCode}`;
    }
    return code;
  }
}
