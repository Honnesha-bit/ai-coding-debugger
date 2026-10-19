import { getDatabase } from '../database.js';

export class UserRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDatabase();
  }

  createUser({ id, username, email, passwordHash, salt }) {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, username, email, password_hash, salt, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const createdAt = new Date().toISOString();
    stmt.run(id, username, email, passwordHash, salt, createdAt);
    return this.findById(id);
  }

  findByUsername(username) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username) || null;
  }

  findByEmail(email) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email) || null;
  }

  findById(id) {
    const stmt = this.db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?');
    return stmt.get(id) || null;
  }
}
