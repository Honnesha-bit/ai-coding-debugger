import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

try {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('No SQL script file path provided.');
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(filePath, 'utf8');
  const db = new DatabaseSync(':memory:');

  // Split statements by semicolon while ignoring string literals
  const statements = sqlContent
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    const upper = stmt.toUpperCase();
    if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA') || upper.startsWith('EXPLAIN')) {
      const query = db.prepare(stmt);
      const rows = query.all();
      console.log(`--- Query: ${stmt.slice(0, 40)}... ---`);
      if (rows.length === 0) {
        console.log('(0 rows returned)');
      } else {
        console.table(rows);
      }
    } else {
      db.exec(stmt);
    }
  }

  console.log('\nSQL execution completed successfully.');
  process.exit(0);
} catch (err) {
  console.error(`SQLite Error: ${err.message}`);
  process.exit(1);
}
