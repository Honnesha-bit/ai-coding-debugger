import { BaseAdapter } from './BaseAdapter.js';

export class CssAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'css',
      name: 'CSS3',
      extensions: ['.css'],
      isCompiled: false,
      isCore: false,
      binaryName: null,
      executionStrategy: 'static_only',
      capabilities: {
        compilation: false,
        execution: false
      },
      sampleCode: 'body {\n    margin: 0;\n    padding: 0;\n    background-color: #f4f4f4;\n}'
    });
  }

  getSetupInstructions() {
    return 'CSS3 stylesheets are validated statically by the built-in syntax and property declaration parser.';
  }

  getSourceFileName() {
    return 'style.css';
  }

  staticAnalyze(code) {
    const errors = [];
    const warnings = [];
    const lines = (code || '').split('\n');

    let inBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('/*')) continue;

      if (trimmed.includes('{')) inBlock = true;
      if (trimmed.includes('}')) inBlock = false;

      // Inside a declaration block, declarations should end with semicolon
      if (inBlock && trimmed.includes(':') && !trimmed.endsWith('{') && !trimmed.endsWith('}')) {
        if (!trimmed.endsWith(';') && !trimmed.endsWith(',')) {
          errors.push({
            line: lineNum,
            message: `Missing semicolon (';') at end of CSS property declaration: '${trimmed}'`,
            rule: 'CSS_MISSING_SEMICOLON'
          });
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
