import { BaseAdapter } from './BaseAdapter.js';

export class SqlAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'sql',
      name: 'SQL (SQLite)',
      extensions: ['.sql'],
      isCompiled: false,
      isCore: false,
      binaryName: 'node',
      executionStrategy: 'in_memory_sqlite',
      sampleCode: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO users (name) VALUES (\'Alice\');\nSELECT * FROM users;'
    });
  }

  getSetupInstructions() {
    return 'SQL execution runs via in-memory SQLite child process using Node.js native node:sqlite DatabaseSync.';
  }

  getSourceFileName() {
    return 'query.sql';
  }

  staticAnalyze(code) {
    const errors = [];
    const warnings = [];
    const trimmed = (code || '').trim();

    if (!trimmed) {
      errors.push({ line: 1, message: 'SQL query is empty.', rule: 'SQL_EMPTY' });
      return { isValid: false, errors, warnings };
    }

    if (!/\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|WITH)\b/i.test(trimmed)) {
      errors.push({
        line: 1,
        message: 'No valid SQL statement keyword found (SELECT, INSERT, UPDATE, DELETE, CREATE, DROP).',
        rule: 'SQL_SYNTAX_ERROR'
      });
    }

    if (/\bSELECT\b/i.test(trimmed) && /\bWHERE\b/i.test(trimmed) && !/\bFROM\b/i.test(trimmed)) {
      errors.push({
        line: 1,
        message: 'SELECT query contains WHERE clause but is missing FROM table reference.',
        rule: 'SQL_MISSING_FROM'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  generateTestWrapper({ code, customTestCases = '', expectedOutput = '' }) {
    const testCode = this._normalizeTestCode(customTestCases);
    if (testCode) {
      return `${code}\n\n-- AUTOMATED TESTS --\n${testCode}`;
    }
    return code;
  }
}
