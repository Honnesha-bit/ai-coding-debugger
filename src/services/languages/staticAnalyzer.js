import { LanguageRegistry } from './languageRegistry.js';

/**
 * Multi-language static syntax and structure analyzer.
 * Combines universal delimiter balancing with modular language adapter checks.
 */
export class StaticAnalyzer {
  /**
   * Analyzes source code for syntax and structural defects.
   *
   * @param {string} language - Language ID or alias
   * @param {string} code - Source code to analyze
   * @returns {{ isValid: boolean, errors: Array<{line: number, message: string, rule: string}>, warnings: Array<{line: number, message: string}> }}
   */
  static analyze(language, code) {
    const lang = (language || '').toLowerCase().trim();
    const errors = [];
    const warnings = [];

    if (!code || typeof code !== 'string' || !code.trim()) {
      return {
        isValid: false,
        errors: [{ line: 1, message: 'Source code is empty.', rule: 'EMPTY_INPUT' }],
        warnings: []
      };
    }

    // 1. Universal Balanced Delimiter Check (brackets, braces, parentheses)
    // (Skip for Python / SQL comments and quotes where appropriate)
    this._checkBalancedDelimiters(code, errors, lang);

    // 2. Delegate to Language Adapter
    const adapter = LanguageRegistry.getAdapter(lang);
    if (adapter && typeof adapter.staticAnalyze === 'function') {
      const adapterResult = adapter.staticAnalyze(code);
      if (adapterResult.errors && adapterResult.errors.length) {
        errors.push(...adapterResult.errors);
      }
      if (adapterResult.warnings && adapterResult.warnings.length) {
        warnings.push(...adapterResult.warnings);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  static _checkBalancedDelimiters(code, errors, lang) {
    const stack = [];
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;

    let line = 1;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const next = code[i + 1];

      if (char === '\n') {
        line++;
        inLineComment = false;
        continue;
      }

      // Handle comments
      if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
        if (!inLineComment && !inBlockComment) {
          if (char === '/' && next === '/') {
            inLineComment = true;
            i++;
            continue;
          }
          if (char === '/' && next === '*') {
            inBlockComment = true;
            i++;
            continue;
          }
          if (char === '#' && (lang === 'python' || lang === 'py' || lang === 'ruby' || lang === 'rb')) {
            inLineComment = true;
            continue;
          }
          if (char === '-' && next === '-' && lang === 'sql') {
            inLineComment = true;
            i++;
            continue;
          }
        } else if (inBlockComment) {
          if (char === '*' && next === '/') {
            inBlockComment = false;
            i++;
            continue;
          }
        }
      }

      if (inLineComment || inBlockComment) continue;

      // Handle quotes (except inside HTML)
      if (lang !== 'html') {
        if (char === "'" && !inDoubleQuote && !inBacktick) {
          // Check for escape
          if (i === 0 || code[i - 1] !== '\\') {
            inSingleQuote = !inSingleQuote;
          }
          continue;
        }
        if (char === '"' && !inSingleQuote && !inBacktick) {
          if (i === 0 || code[i - 1] !== '\\') {
            inDoubleQuote = !inDoubleQuote;
          }
          continue;
        }
        if (char === '`' && !inSingleQuote && !inDoubleQuote) {
          if (i === 0 || code[i - 1] !== '\\') {
            inBacktick = !inBacktick;
          }
          continue;
        }
      }

      if (inSingleQuote || inDoubleQuote || inBacktick) continue;

      // Push open delimiters
      if (char === '(' || char === '{' || char === '[') {
        stack.push({ char, line });
      } else if (char === ')' || char === '}' || char === ']') {
        if (stack.length === 0) {
          errors.push({
            line,
            message: `Unexpected closing delimiter '${char}' with no preceding opening delimiter.`,
            rule: 'UNBALANCED_DELIMITER'
          });
          return;
        }

        const top = stack.pop();
        const matches =
          (top.char === '(' && char === ')') ||
          (top.char === '{' && char === '}') ||
          (top.char === '[' && char === ']');

        if (!matches) {
          errors.push({
            line,
            message: `Mismatched delimiter: expected closing for '${top.char}' (opened line ${top.line}), found '${char}'.`,
            rule: 'MISMATCHED_DELIMITER'
          });
          return;
        }
      }
    }

    if (inSingleQuote) {
      errors.push({ line, message: 'Unterminated single quote string literal.', rule: 'UNTERMINATED_STRING' });
    } else if (inDoubleQuote) {
      errors.push({ line, message: 'Unterminated double quote string literal.', rule: 'UNTERMINATED_STRING' });
    } else if (inBacktick) {
      errors.push({ line, message: 'Unterminated template literal / backtick.', rule: 'UNTERMINATED_STRING' });
    }

    while (stack.length > 0) {
      const unclosed = stack.pop();
      errors.push({
        line: unclosed.line,
        message: `Unclosed delimiter '${unclosed.char}' opened on line ${unclosed.line}.`,
        rule: 'UNCLOSED_DELIMITER'
      });
    }
  }
}
