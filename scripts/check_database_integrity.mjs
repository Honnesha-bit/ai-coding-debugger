import { getDatabase, closeDatabase } from '../src/db/database.js';

async function main() {
  const db = getDatabase();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;").all();
  console.log('Database tables:', tables.map(t => t.name));

  const pragmaPragmas = ['journal_mode', 'foreign_keys', 'busy_timeout'];
  for (const p of pragmaPragmas) {
    const res = db.prepare(`PRAGMA ${p};`).get();
    console.log(`Pragma ${p}:`, res);
  }

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users;').get();
  console.log('Total users in database:', userCount.count);

  const sessionCount = db.prepare('SELECT COUNT(*) as count FROM debug_sessions;').get();
  console.log('Total debug sessions in database:', sessionCount.count);

  const evalRunsCount = db.prepare('SELECT COUNT(*) as count FROM evaluation_runs;').get();
  console.log('Total evaluation runs in database:', evalRunsCount.count);

  const guestCount = db.prepare('SELECT COUNT(*) as count FROM guest_sessions;').get();
  console.log('Total guest sessions in database:', guestCount.count);

  closeDatabase();
}

main().catch(console.error);
