import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { preInitSecureDatabase, postInitSecureDatabase } from './permissionSecurity.js';

let dbInstance = null;

export function getDatabase(customPath = null) {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const dbPath = customPath || config.DB_PATH;
  if (dbPath !== ':memory:') {
    preInitSecureDatabase(dbPath);
  }

  const db = new DatabaseSync(dbPath);
  
  // Pragmas for reliability and performance
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    postInitSecureDatabase(dbPath);
  }
  db.exec('PRAGMA foreign_keys = ON;');

  // Schema migrations
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guest_sessions (
      session_id TEXT PRIMARY KEY,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS debug_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      guest_session_id TEXT,
      language TEXT NOT NULL,
      source_code TEXT NOT NULL,
      error_description TEXT NOT NULL,
      expected_output TEXT,
      test_cases TEXT,
      diagnosis TEXT NOT NULL,
      root_cause TEXT NOT NULL,
      corrected_code TEXT NOT NULL,
      diff TEXT NOT NULL,
      confidence TEXT NOT NULL,
      original_run TEXT,
      corrected_run TEXT,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS evaluation_runs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      total_cases INTEGER NOT NULL,
      fix_success_rate REAL NOT NULL,
      compilation_success_rate REAL NOT NULL,
      regression_rate REAL NOT NULL,
      explanation_accuracy REAL NOT NULL,
      sandbox_failure_rate REAL NOT NULL,
      median_latency_ms REAL NOT NULL,
      latency_observations INTEGER NOT NULL,
      failure_counts TEXT NOT NULL,
      raw_results TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_debug_sessions_user_id ON debug_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_debug_sessions_guest_session_id ON debug_sessions(guest_session_id);
    CREATE INDEX IF NOT EXISTS idx_debug_sessions_user_created ON debug_sessions(user_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_debug_sessions_guest_created ON debug_sessions(guest_session_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_guest_sessions_usage ON guest_sessions(usage_count);
  `);

  // Non-destructive column additions
  try { db.exec("ALTER TABLE debug_sessions ADD COLUMN verification_status TEXT DEFAULT 'FIX NOT VERIFIED';"); } catch {}
  try { db.exec("ALTER TABLE debug_sessions ADD COLUMN attempts TEXT DEFAULT '[]';"); } catch {}
  try { db.exec("ALTER TABLE debug_sessions ADD COLUMN retry_count INTEGER DEFAULT 0;"); } catch {}
  try { db.exec("ALTER TABLE debug_sessions ADD COLUMN line_diagnoses TEXT DEFAULT '[]';"); } catch {}
  try { db.exec("ALTER TABLE debug_sessions ADD COLUMN detailed_status TEXT DEFAULT 'EXECUTION_PASSED';"); } catch {}
  try { db.exec("ALTER TABLE debug_sessions ADD COLUMN test_results TEXT DEFAULT '[]';"); } catch {}
  try { db.exec("ALTER TABLE debug_sessions ADD COLUMN regression_report TEXT DEFAULT '{}';"); } catch {}

  dbInstance = db;
  return db;
}

export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
