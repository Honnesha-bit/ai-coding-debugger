import { getDatabase } from '../database.js';

export class EvaluationRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDatabase();
  }

  saveRun(run) {
    const stmt = this.db.prepare(`
      INSERT INTO evaluation_runs (
        id, timestamp, total_cases, fix_success_rate, compilation_success_rate,
        regression_rate, explanation_accuracy, sandbox_failure_rate,
        median_latency_ms, latency_observations, failure_counts, raw_results
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      run.id,
      run.timestamp || new Date().toISOString(),
      run.totalCases,
      run.fixSuccessRate,
      run.compilationSuccessRate,
      run.regressionRate,
      run.explanationAccuracy,
      run.sandboxFailureRate,
      run.medianLatencyMs,
      run.latencyObservations,
      JSON.stringify(run.failureCounts || {}),
      JSON.stringify(run.rawResults || [])
    );

    return this.getRunById(run.id);
  }

  getLatestRun() {
    const stmt = this.db.prepare('SELECT * FROM evaluation_runs ORDER BY timestamp DESC LIMIT 1');
    const row = stmt.get();
    if (!row) return null;
    return this._formatRow(row);
  }

  getRunById(id) {
    const stmt = this.db.prepare('SELECT * FROM evaluation_runs WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return this._formatRow(row);
  }

  listRuns() {
    const stmt = this.db.prepare('SELECT * FROM evaluation_runs ORDER BY timestamp DESC');
    const rows = stmt.all();
    return rows.map(r => this._formatRow(r));
  }

  _formatRow(row) {
    return {
      id: row.id,
      timestamp: row.timestamp,
      totalCases: row.total_cases,
      fixSuccessRate: row.fix_success_rate,
      compilationSuccessRate: row.compilation_success_rate,
      regressionRate: row.regression_rate,
      explanationAccuracy: row.explanation_accuracy,
      sandboxFailureRate: row.sandbox_failure_rate,
      medianLatencyMs: row.median_latency_ms,
      latencyObservations: row.latency_observations,
      failureCounts: row.failure_counts ? JSON.parse(row.failure_counts) : {},
      rawResults: row.raw_results ? JSON.parse(row.raw_results) : []
    };
  }
}
