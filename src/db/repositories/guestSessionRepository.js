import { getDatabase } from '../database.js';

export class GuestSessionRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDatabase();
  }

  getOrCreate(sessionId) {
    const findStmt = this.db.prepare('SELECT * FROM guest_sessions WHERE session_id = ?');
    let session = findStmt.get(sessionId);
    if (!session) {
      const now = new Date().toISOString();
      const insertStmt = this.db.prepare(`
        INSERT INTO guest_sessions (session_id, usage_count, created_at, updated_at)
        VALUES (?, 0, ?, ?)
      `);
      insertStmt.run(sessionId, now, now);
      session = findStmt.get(sessionId);
    }
    return session;
  }

  getUsageCount(sessionId) {
    const session = this.getOrCreate(sessionId);
    return session.usage_count;
  }

  /**
   * Atomically reserve a guest attempt if usage_count < maxUses.
   * Returns true if attempt was reserved, false if limit reached.
   * Concurrency-safe against race conditions.
   */
  reserveAttempt(sessionId, maxUses = 2) {
    this.getOrCreate(sessionId);
    const now = new Date().toISOString();
    const updateStmt = this.db.prepare(`
      UPDATE guest_sessions 
      SET usage_count = usage_count + 1, updated_at = ?
      WHERE session_id = ? AND usage_count < ?
    `);
    const result = updateStmt.run(now, sessionId, maxUses);
    return result.changes > 0;
  }

  /**
   * Refund an attempt if an infrastructure error occurred before execution could take place.
   */
  refundAttempt(sessionId) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE guest_sessions 
      SET usage_count = MAX(0, usage_count - 1), updated_at = ?
      WHERE session_id = ?
    `);
    stmt.run(now, sessionId);
  }

  resetUsage(sessionId) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE guest_sessions 
      SET usage_count = 0, updated_at = ?
      WHERE session_id = ?
    `);
    stmt.run(now, sessionId);
  }
}
