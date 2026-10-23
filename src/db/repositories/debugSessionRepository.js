import { getDatabase } from '../database.js';

export class DebugSessionRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDatabase();
  }

  create(session) {
    const testCasesVal = typeof session.testCases === 'string'
      ? session.testCases
      : (session.testCases ? JSON.stringify(session.testCases) : '');

    const errorDescVal = session.errorDescription || '';
    const expectedOutputVal = session.expectedOutput || '';
    const diagnosisVal = session.diagnosis || '';
    const rootCauseVal = session.rootCause || '';
    const correctedCodeVal = session.correctedCode || '';
    const diffVal = session.diff || '';
    const confidenceVal = session.confidence || 'medium';

    try {
      const stmt = this.db.prepare(`
        INSERT INTO debug_sessions (
          id, user_id, guest_session_id, language, source_code, error_description,
          expected_output, test_cases, diagnosis, root_cause, corrected_code,
          diff, confidence, original_run, corrected_run, verified, created_at,
          verification_status, attempts, retry_count, line_diagnoses,
          detailed_status, test_results, regression_report
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        session.id,
        session.userId || null,
        session.guestSessionId || null,
        session.language,
        session.sourceCode,
        errorDescVal,
        expectedOutputVal,
        testCasesVal,
        diagnosisVal,
        rootCauseVal,
        correctedCodeVal,
        diffVal,
        confidenceVal,
        JSON.stringify(session.originalRun || {}),
        JSON.stringify(session.correctedRun || {}),
        session.verified ? 1 : 0,
        session.createdAt || new Date().toISOString(),
        session.verificationStatus || 'FIX NOT VERIFIED',
        JSON.stringify(session.attempts || []),
        session.retryCount || 0,
        JSON.stringify(session.lineDiagnoses || []),
        session.detailedStatus || 'EXECUTION_PASSED',
        JSON.stringify(session.testResults || []),
        JSON.stringify(session.regressionReport || {})
      );
    } catch {
      try {
        const stmt = this.db.prepare(`
          INSERT INTO debug_sessions (
            id, user_id, guest_session_id, language, source_code, error_description,
            expected_output, test_cases, diagnosis, root_cause, corrected_code,
            diff, confidence, original_run, corrected_run, verified, created_at,
            verification_status, attempts, retry_count, line_diagnoses
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          session.id,
          session.userId || null,
          session.guestSessionId || null,
          session.language,
          session.sourceCode,
          errorDescVal,
          expectedOutputVal,
          testCasesVal,
          diagnosisVal,
          rootCauseVal,
          correctedCodeVal,
          diffVal,
          confidenceVal,
          JSON.stringify(session.originalRun || {}),
          JSON.stringify(session.correctedRun || {}),
          session.verified ? 1 : 0,
          session.createdAt || new Date().toISOString(),
          session.verificationStatus || 'FIX NOT VERIFIED',
          JSON.stringify(session.attempts || []),
          session.retryCount || 0,
          JSON.stringify(session.lineDiagnoses || [])
        );
      } catch {
        const stmt = this.db.prepare(`
          INSERT INTO debug_sessions (
            id, user_id, guest_session_id, language, source_code, error_description,
            expected_output, test_cases, diagnosis, root_cause, corrected_code,
            diff, confidence, original_run, corrected_run, verified, created_at,
            verification_status, attempts, retry_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          session.id,
          session.userId || null,
          session.guestSessionId || null,
          session.language,
          session.sourceCode,
          errorDescVal,
          expectedOutputVal,
          testCasesVal,
          diagnosisVal,
          rootCauseVal,
          correctedCodeVal,
          diffVal,
          confidenceVal,
          JSON.stringify(session.originalRun || {}),
          JSON.stringify(session.correctedRun || {}),
          session.verified ? 1 : 0,
          session.createdAt || new Date().toISOString(),
          session.verificationStatus || 'FIX NOT VERIFIED',
          JSON.stringify(session.attempts || []),
          session.retryCount || 0
        );
      }
    }

    return this.findById(session.id);
  }

  findById(id) {
    const stmt = this.db.prepare('SELECT * FROM debug_sessions WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return this._formatRow(row);
  }

  findByUserId(userId) {
    const stmt = this.db.prepare('SELECT * FROM debug_sessions WHERE user_id = ? ORDER BY created_at DESC, id DESC');
    const rows = stmt.all(userId);
    return rows.map(r => this._formatRow(r));
  }

  findByGuestSessionId(guestSessionId) {
    const stmt = this.db.prepare('SELECT * FROM debug_sessions WHERE guest_session_id = ? AND user_id IS NULL ORDER BY created_at DESC, id DESC');
    const rows = stmt.all(guestSessionId);
    return rows.map(r => this._formatRow(r));
  }

  _buildFilterQuery({ userId = null, guestSessionId = null, language = null, status = null, search = null }) {
    const conditions = [];
    const params = [];

    // Ownership filter: authenticated user vs guest session
    if (userId) {
      conditions.push('user_id = ?');
      params.push(userId);
    } else if (guestSessionId) {
      conditions.push('guest_session_id = ? AND user_id IS NULL');
      params.push(guestSessionId);
    } else {
      // Safe fallback if neither identity is provided: return no records
      conditions.push('1 = 0');
    }

    // Language filter (case-insensitive)
    if (language && language !== 'all') {
      conditions.push('LOWER(language) = LOWER(?)');
      params.push(language);
    }

    // Verification status filter
    if (status && status !== 'all') {
      if (status === 'verified') {
        conditions.push('verified = 1');
      } else if (status === 'unverified') {
        conditions.push('verified = 0');
      } else {
        conditions.push('verification_status = ?');
        params.push(status);
      }
    }

    // Keyword search over error description or session ID
    if (search && typeof search === 'string' && search.trim()) {
      conditions.push('(error_description LIKE ? OR id LIKE ?)');
      const pattern = `%${search.trim()}%`;
      params.push(pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  findPaginated({
    userId = null,
    guestSessionId = null,
    limit = 10,
    offset = 0,
    language = null,
    status = null,
    search = null
  } = {}) {
    const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    const { whereClause, params } = this._buildFilterQuery({
      userId,
      guestSessionId,
      language,
      status,
      search
    });

    const query = `
      SELECT * FROM debug_sessions
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `;

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params, safeLimit, safeOffset);
    return rows.map(r => this._formatRow(r));
  }

  count({
    userId = null,
    guestSessionId = null,
    language = null,
    status = null,
    search = null
  } = {}) {
    const { whereClause, params } = this._buildFilterQuery({
      userId,
      guestSessionId,
      language,
      status,
      search
    });

    const query = `SELECT COUNT(*) AS total FROM debug_sessions ${whereClause}`;
    const stmt = this.db.prepare(query);
    const row = stmt.get(...params);
    return row ? Number(row.total) : 0;
  }

  deleteById(id, userId) {
    const stmt = this.db.prepare('DELETE FROM debug_sessions WHERE id = ? AND user_id = ?');
    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  deleteSession({ id, userId = null, guestSessionId = null }) {
    if (userId) {
      const stmt = this.db.prepare('DELETE FROM debug_sessions WHERE id = ? AND user_id = ?');
      const result = stmt.run(id, userId);
      return result.changes > 0;
    }
    if (guestSessionId) {
      const stmt = this.db.prepare('DELETE FROM debug_sessions WHERE id = ? AND guest_session_id = ? AND user_id IS NULL');
      const result = stmt.run(id, guestSessionId);
      return result.changes > 0;
    }
    return false;
  }

  _formatRow(row) {
    const originalRun = row.original_run ? JSON.parse(row.original_run) : null;
    const correctedRun = row.corrected_run ? JSON.parse(row.corrected_run) : null;
    const durationMs = (correctedRun && typeof correctedRun.durationMs === 'number')
      ? correctedRun.durationMs
      : (originalRun && typeof originalRun.durationMs === 'number')
        ? originalRun.durationMs
        : null;

    const sourceCodePreview = row.source_code
      ? row.source_code.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
      : '';

    let lineDiagnoses = [];
    if (row.line_diagnoses) {
      try {
        const parsed = JSON.parse(row.line_diagnoses);
        if (Array.isArray(parsed)) {
          lineDiagnoses = parsed;
        }
      } catch {
        lineDiagnoses = [];
      }
    }

    if (lineDiagnoses.length === 0 && (row.diagnosis || row.root_cause)) {
      lineDiagnoses = [{
        lineNumber: null,
        lineRange: null,
        snippet: '',
        explanation: row.diagnosis || 'Diagnosis available from session history.',
        suggestedCorrection: row.corrected_code ? 'Refer to corrected code in diff viewer.' : '',
        whyItWorks: row.root_cause || 'Resolves identified issue.',
        isUncertain: true,
        confidence: row.confidence || 'medium'
      }];
    }

    let testResults = [];
    if (row.test_results) {
      try {
        const parsed = JSON.parse(row.test_results);
        if (Array.isArray(parsed)) testResults = parsed;
      } catch {}
    }

    let regressionReport = null;
    if (row.regression_report) {
      try {
        const parsed = JSON.parse(row.regression_report);
        if (parsed && typeof parsed === 'object') regressionReport = parsed;
      } catch {}
    }

    let formattedTestCases = row.test_cases;
    if (typeof row.test_cases === 'string' && (row.test_cases.startsWith('[') || row.test_cases.startsWith('{'))) {
      try {
        formattedTestCases = JSON.parse(row.test_cases);
      } catch {
        formattedTestCases = row.test_cases;
      }
    }

    const detailedStatus = row.detailed_status || (row.verified ? 'TESTS_PASSED' : 'EXECUTION_PASSED');

    return {
      id: row.id,
      userId: row.user_id,
      guestSessionId: row.guest_session_id,
      language: row.language,
      sourceCode: row.source_code,
      sourceCodePreview,
      errorDescription: row.error_description,
      expectedOutput: row.expected_output,
      testCases: formattedTestCases,
      diagnosis: row.diagnosis,
      rootCause: row.root_cause,
      correctedCode: row.corrected_code,
      diff: row.diff,
      confidence: row.confidence || null,
      lineDiagnoses,
      detailedStatus,
      testResults,
      regressionReport,
      durationMs,
      originalRun,
      correctedRun,
      verified: Boolean(row.verified),
      verificationStatus: row.verification_status || (row.verified ? 'FIX VERIFIED' : 'FIX NOT VERIFIED'),
      attempts: row.attempts ? JSON.parse(row.attempts) : [],
      retryCount: row.retry_count || 0,
      createdAt: row.created_at
    };
  }
}

