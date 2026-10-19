import { BaseAdapter } from './BaseAdapter.js';

export class CAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'c',
      name: 'C',
      extensions: ['.c', '.h'],
      isCompiled: true,
      isCore: true,
      binaryName: 'gcc',
      compilerBinary: 'gcc',
      executionStrategy: 'native_subprocess',
      sampleCode: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello from C!\\n");\n    return 0;\n}'
    });
  }

  getSetupInstructions() {
    return 'Install GCC via MinGW-w64 (MSYS2 or winlibs.com) on Windows, or "build-essential" on Linux, and ensure "gcc" is accessible from system PATH.';
  }

  getSourceFileName() {
    return 'solution.c';
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

      if (/\bint\s+main\s*\(|\bvoid\s+main\s*\(/.test(trimmed)) {
        hasMain = true;
      }

      // 1. C++ specific features in C
      if (/\b(?:std::cout|std::cin|std::endl|namespace\s+[A-Za-z0-9_]+|template\s*<)\b/.test(trimmed)) {
        errors.push({
          line: lineNum,
          message: `C++ syntax detected in C source file: '${trimmed}'. Select C++ for standard library streams and templates.`,
          rule: 'C_INVALID_CPP_FEATURE'
        });
      }

      // 2. Class keyword in C
      if (/^class\s+[A-Za-z0-9_]+/.test(trimmed)) {
        errors.push({
          line: lineNum,
          message: `'class' keyword is not supported in C. Use 'struct' or switch language to C++.`,
          rule: 'C_UNSUPPORTED_CLASS'
        });
      }

      // 3. Missing semicolon on executable statements
      if (/^(?:int|double|float|char|long|short|unsigned|return|printf|scanf)\b/.test(trimmed)) {
        if (!trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.endsWith(':')) {
          errors.push({
            line: lineNum,
            message: `Missing semicolon (';') at end of statement: '${trimmed}'`,
            rule: 'C_MISSING_SEMICOLON'
          });
        }
      }
    }

    if (!hasMain) {
      warnings.push({
        line: 1,
        message: 'No main() function found. C executable programs require an entrypoint: int main(void).'
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
      command: 'gcc',
      args: ['-O2', '-Wall', filePath, '-o', outputExecutablePath]
    };
  }

  getExecutionCommand(outputExecutablePath) {
    return {
      command: outputExecutablePath,
      args: []
    };
  }

  generateTestWrapper({ code, customTestCases = '', expectedOutput = '' }) {
    if (customTestCases && customTestCases.trim()) {
      return `${code}\n\n/* --- AUTOMATED TESTS --- */\n${customTestCases.trim()}`;
    }
    return code;
  }
}
