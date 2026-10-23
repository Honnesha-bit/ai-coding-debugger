import path from 'node:path';
import { BaseAdapter } from './BaseAdapter.js';

export class JavaAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'java',
      name: 'Java',
      extensions: ['.java'],
      isCompiled: true,
      isCore: true,
      binaryName: 'java',
      compilerBinary: 'javac',
      executionStrategy: 'native_subprocess',
      sampleCode: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, Java!");\n    }\n}'
    });
  }

  getSetupInstructions() {
    return 'Install OpenJDK 17 or 21 (such as Eclipse Temurin from adoptium.net or Oracle JDK) and ensure both "javac" and "java" are available in your system PATH.';
  }

  /**
   * Extracts the class name from Java code or defaults to 'Main'.
   */
  getClassName(code) {
    const match = (code || '').match(/\b(?:public\s+)?class\s+([A-Za-z0-9_]+)/);
    return match ? match[1] : 'Main';
  }

  getSourceFileName(code = '') {
    const className = this.getClassName(code);
    return `${className}.java`;
  }

  staticAnalyze(code) {
    const errors = [];
    const warnings = [];
    const lines = (code || '').split('\n');

    let hasClass = false;
    let hasMain = false;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

      if (/\bclass\s+[A-Za-z0-9_]+/.test(trimmed)) {
        hasClass = true;
      }

      if (/public\s+static\s+void\s+main\s*\(\s*String\b/.test(trimmed)) {
        hasMain = true;
      }

      // Check missing semicolon on executable statements
      if (/^(?:int|double|float|String|boolean|char|long|return|System\.out|this\.)\b/.test(trimmed)) {
        if (!trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}')) {
          errors.push({
            line: lineNum,
            message: `Missing semicolon (';') at end of statement: '${trimmed}'`,
            rule: 'JAVA_MISSING_SEMICOLON'
          });
        }
      }

      // Python syntax in Java
      if (/\bdef\s+[a-z_]/.test(trimmed)) {
        errors.push({
          line: lineNum,
          message: `Python 'def' keyword used in Java. Java requires explicit return types for methods.`,
          rule: 'JAVA_PYTHON_SYNTAX'
        });
      }
    }

    if (!hasClass) {
      errors.push({
        line: 1,
        message: 'No class declaration found. Java requires code to be enclosed in a class definition.',
        rule: 'JAVA_MISSING_CLASS'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  getCompilationCommand(filePath, tempDir) {
    return {
      command: 'javac',
      args: ['-d', tempDir, filePath]
    };
  }

  getExecutionCommand(targetPath, tempDir, code = '') {
    const className = this.getClassName(code);
    return {
      command: 'java',
      args: ['-cp', tempDir, className]
    };
  }

  generateTestWrapper({ code, customTestCases = '', expectedOutput = '' }) {
    const tests = this._normalizeTestCode(customTestCases);
    if (!tests) {
      return code;
    }
    if (tests.includes('class ') || tests.includes('void main')) {
      return tests;
    }

    const mainIndex = code.search(/public\s+static\s+void\s+main\s*\([^)]*\)\s*\{/);
    if (mainIndex !== -1) {
      let braceCount = 0;
      let insertIndex = -1;
      for (let i = mainIndex; i < code.length; i++) {
        if (code[i] === '{') braceCount++;
        else if (code[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            insertIndex = i;
            break;
          }
        }
      }
      if (insertIndex !== -1) {
        return code.slice(0, insertIndex) + '\n    // --- AUTOMATED TESTS ---\n    ' + tests + '\n' + code.slice(insertIndex);
      }
    }

    const lastBrace = code.lastIndexOf('}');
    if (lastBrace !== -1) {
      return code.slice(0, lastBrace) + '\n  public static void main(String[] args) {\n    ' + tests + '\n  }\n' + code.slice(lastBrace);
    }

    return `${code}\n\n// --- AUTOMATED TESTS ---\n${tests}`;
  }
}
