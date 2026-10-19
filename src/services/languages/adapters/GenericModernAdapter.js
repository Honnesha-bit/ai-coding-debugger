import { BaseAdapter } from './BaseAdapter.js';

export class GenericModernAdapter extends BaseAdapter {
  constructor(config) {
    super({
      isCompiled: config.isCompiled ?? true,
      isCore: false,
      executionStrategy: 'native_subprocess',
      ...config
    });
  }

  getSetupInstructions() {
    return `To execute ${this.name} code, install the official ${this.binaryName || this.compilerBinary || this.name} compiler/runtime and add it to your system PATH.`;
  }

  getSourceFileName() {
    const ext = this.extensions[0] || '.txt';
    return `solution${ext}`;
  }

  staticAnalyze(code) {
    const errors = [];
    const warnings = [];
    const lines = (code || '').split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

      // Check missing semicolons for languages that enforce them
      if (['php', 'csharp'].includes(this.id)) {
        if (/^(?:int|string|var|\$[a-zA-Z0-9_]+|return|echo)\b/.test(trimmed)) {
          if (!trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}')) {
            errors.push({
              line: lineNum,
              message: `Missing semicolon (';') at end of statement: '${trimmed}'`,
              rule: `${this.id.toUpperCase()}_MISSING_SEMICOLON`
            });
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
