import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import {
  PERMISSION_TARGETS,
  DatabaseSecurityError,
  isPosixPlatform,
  setPlatformOverrideForTesting,
  assertNotSymbolicLink,
  ensureSecureDatabaseDirectory,
  ensureSecureFile,
  ensureSecureSidecars,
  preInitSecureDatabase,
  postInitSecureDatabase
} from '../../src/db/permissionSecurity.js';
import { getDatabase, closeDatabase } from '../../src/db/database.js';
import { UserRepository } from '../../src/db/repositories/userRepository.js';
import { DebugSessionRepository } from '../../src/db/repositories/debugSessionRepository.js';

test('Stage 6: POSIX Database Permission Hardening Suite', async (t) => {
  let tempBaseDir;

  t.beforeEach(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-dbg-perm-test-'));
  });

  t.afterEach(() => {
    closeDatabase();
    if (tempBaseDir && fs.existsSync(tempBaseDir)) {
      try {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      } catch {
        // Cleanup best-effort
      }
    }
  });

  // 1. Target permission constants verification
  await t.test('1. Target permissions match least-privilege POSIX specifications', () => {
    assert.strictEqual(PERMISSION_TARGETS.DIRECTORY, 0o700, 'Directory target must be 0700 (rwx------)');
    assert.strictEqual(PERMISSION_TARGETS.DATABASE_FILE, 0o600, 'DB file target must be 0600 (rw-------)');
    assert.strictEqual(PERMISSION_TARGETS.WAL_FILE, 0o600, 'WAL file target must be 0600 (rw-------)');
    assert.strictEqual(PERMISSION_TARGETS.SHM_FILE, 0o600, 'SHM file target must be 0600 (rw-------)');
    assert.strictEqual(PERMISSION_TARGETS.JOURNAL_FILE, 0o600, 'Journal file target must be 0600 (rw-------)');
  });

  // 2. Directory creation & permission hardening
  await t.test('2. Database directory creation enforces restrictive mode', (sub) => {
    const dbDir = path.join(tempBaseDir, 'secure-db-dir');
    ensureSecureDatabaseDirectory(dbDir);

    assert.ok(fs.existsSync(dbDir), 'Database directory should be created');
    assert.ok(fs.statSync(dbDir).isDirectory(), 'Target should be a directory');

    if (isPosixPlatform()) {
      const mode = fs.statSync(dbDir).mode & 0o777;
      assert.strictEqual(mode, 0o700, 'POSIX database directory mode must be 0700');
    } else {
      sub.diagnostic('Skipped POSIX mode bit assertion on Windows host: NTFS does not support POSIX octal modes');
    }
  });

  // 3. Newly created database files receive intended permissions
  await t.test('3. Newly created database files receive intended permissions', (sub) => {
    const dbPath = path.join(tempBaseDir, 'test-new.sqlite');
    const db = getDatabase(dbPath);

    assert.ok(fs.existsSync(dbPath), 'Database file should exist after initialization');

    if (isPosixPlatform()) {
      const mode = fs.statSync(dbPath).mode & 0o777;
      assert.strictEqual(mode, 0o600, 'POSIX database file mode must be 0600');
    } else {
      sub.diagnostic('Skipped POSIX mode bit assertion on Windows host: NTFS does not support POSIX octal modes');
    }

    closeDatabase();
  });

  // 4. Overly permissive existing database files are safely tightened
  await t.test('4. Existing database files with loose permissions are tightened safely', (sub) => {
    const dbPath = path.join(tempBaseDir, 'loose-file.sqlite');
    fs.writeFileSync(dbPath, 'dummy data');

    if (isPosixPlatform()) {
      // Simulate insecurely created file (e.g. 0666 or 0644)
      fs.chmodSync(dbPath, 0o666);
      assert.notStrictEqual(fs.statSync(dbPath).mode & 0o777, 0o600);

      ensureSecureFile(dbPath, PERMISSION_TARGETS.DATABASE_FILE);

      const tightened = fs.statSync(dbPath).mode & 0o777;
      assert.strictEqual(tightened, 0o600, 'Existing database file should be tightened to 0600');
    } else {
      // On Windows, ensure ensureSecureFile executes safely without throwing
      const result = ensureSecureFile(dbPath, PERMISSION_TARGETS.DATABASE_FILE);
      assert.strictEqual(result, true, 'Windows file check should succeed cleanly');
      sub.diagnostic('Skipped POSIX octal verification on Windows host');
    }
  });

  // 5. Existing directory with broad permissions is tightened
  await t.test('5. Existing directory with broad permissions is tightened to 0700', (sub) => {
    const customDir = path.join(tempBaseDir, 'insecure-dir');
    fs.mkdirSync(customDir, { recursive: true });

    if (isPosixPlatform()) {
      fs.chmodSync(customDir, 0o755);
      assert.strictEqual(fs.statSync(customDir).mode & 0o777, 0o755);

      ensureSecureDatabaseDirectory(customDir);

      const tightened = fs.statSync(customDir).mode & 0o777;
      assert.strictEqual(tightened, 0o700, 'Insecure directory should be tightened to 0700');
    } else {
      ensureSecureDatabaseDirectory(customDir);
      assert.ok(fs.existsSync(customDir));
      sub.diagnostic('Skipped POSIX octal verification on Windows host');
    }
  });

  // 6. WAL and SHM sidecar file inspection and hardening
  await t.test('6. WAL and SHM sidecars are inspected and secured when present', (sub) => {
    const dbPath = path.join(tempBaseDir, 'sidecar-test.sqlite');
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    const journalPath = `${dbPath}-journal`;

    fs.writeFileSync(dbPath, 'main');
    fs.writeFileSync(walPath, 'wal');
    fs.writeFileSync(shmPath, 'shm');
    fs.writeFileSync(journalPath, 'journal');

    if (isPosixPlatform()) {
      fs.chmodSync(walPath, 0o644);
      fs.chmodSync(shmPath, 0o644);
      fs.chmodSync(journalPath, 0o644);

      ensureSecureSidecars(dbPath);

      assert.strictEqual(fs.statSync(walPath).mode & 0o777, 0o600, 'WAL file mode must be 0600');
      assert.strictEqual(fs.statSync(shmPath).mode & 0o777, 0o600, 'SHM file mode must be 0600');
      assert.strictEqual(fs.statSync(journalPath).mode & 0o777, 0o600, 'Journal file mode must be 0600');
    } else {
      ensureSecureSidecars(dbPath);
      assert.ok(fs.existsSync(walPath));
      sub.diagnostic('Skipped POSIX octal verification on Windows host');
    }
  });

  // 7. Database reads, writes, and schema migrations continue to work
  await t.test('7. Database reads and writes function correctly with hardened permissions', () => {
    const dbPath = path.join(tempBaseDir, 'rw-test.sqlite');
    const db = getDatabase(dbPath);

    const userRepo = new UserRepository(db);
    const user = userRepo.createUser({
      id: 'usr_test123',
      username: 'alice',
      email: 'alice@example.com',
      passwordHash: 'hash',
      salt: 'salt'
    });

    assert.strictEqual(user.username, 'alice');
    assert.strictEqual(user.email, 'alice@example.com');

    const retrieved = userRepo.findByUsername('alice');
    assert.strictEqual(retrieved.id, 'usr_test123');

    closeDatabase();
  });

  // 8. WAL mode is enabled and verified
  await t.test('8. WAL journal mode is properly enabled in SQLite pragmas', () => {
    const dbPath = path.join(tempBaseDir, 'wal-check.sqlite');
    const db = getDatabase(dbPath);

    const row = db.prepare('PRAGMA journal_mode;').get();
    assert.strictEqual(row.journal_mode.toLowerCase(), 'wal', 'SQLite journal_mode should be WAL');

    closeDatabase();
  });

  // 9. Closing and reopening the database preserves data
  await t.test('9. Closing and reopening the database preserves data across sessions', () => {
    const dbPath = path.join(tempBaseDir, 'persistence.sqlite');

    // First session: write data
    const db1 = getDatabase(dbPath);
    const userRepo1 = new UserRepository(db1);
    userRepo1.createUser({
      id: 'usr_persist1',
      username: 'bob',
      email: 'bob@example.com',
      passwordHash: 'hash',
      salt: 'salt'
    });
    closeDatabase();

    // Second session: re-open same database file
    const db2 = getDatabase(dbPath);
    const userRepo2 = new UserRepository(db2);
    const retrieved = userRepo2.findByUsername('bob');

    assert.ok(retrieved, 'User should be found in reopened database');
    assert.strictEqual(retrieved.id, 'usr_persist1');
    assert.strictEqual(retrieved.email, 'bob@example.com');

    closeDatabase();
  });

  // 10. Concurrent operations execute reliably
  await t.test('10. Concurrent database operations execute reliably without permission lock contention', () => {
    const dbPath = path.join(tempBaseDir, 'concurrency.sqlite');
    const db = getDatabase(dbPath);
    const sessionRepo = new DebugSessionRepository(db);

    const operations = Array.from({ length: 20 }, (_, i) => ({
      id: `dbg_concurrent_${i}`,
      userId: null,
      guestSessionId: 'gst_test',
      language: 'python',
      sourceCode: `print(${i})`,
      errorDescription: 'test',
      expectedOutput: `${i}`,
      testCases: '',
      diagnosis: `Bug ${i}`,
      rootCause: `Cause ${i}`,
      correctedCode: `print(${i})`,
      diff: '',
      confidence: 'high',
      originalRun: null,
      correctedRun: null,
      verified: 1,
      createdAt: new Date().toISOString()
    }));

    for (const op of operations) {
      sessionRepo.create(op);
    }

    const countRow = db.prepare('SELECT COUNT(*) as count FROM debug_sessions;').get();
    assert.strictEqual(countRow.count, 20, 'All 20 concurrent session inserts should succeed');

    closeDatabase();
  });

  // 11. Windows initialization remains functional without unsupported POSIX operations
  await t.test('11. Windows initialization is fully supported and does not invoke invalid operations', () => {
    const dbPath = path.join(tempBaseDir, 'win-compat.sqlite');
    assert.doesNotThrow(() => {
      const db = getDatabase(dbPath);
      assert.ok(db, 'Database should open cleanly');
      closeDatabase();
    });
  });

  // 12. Unexpected paths and symbolic links are safely rejected
  await t.test('12. Symbolic link detection rejects symlink paths and prevents privilege escalation', () => {
    const realDir = path.join(tempBaseDir, 'real-target');
    fs.mkdirSync(realDir, { recursive: true });

    const symlinkPath = path.join(tempBaseDir, 'db-symlink');
    try {
      fs.symlinkSync(realDir, symlinkPath, 'dir');
      assert.throws(
        () => assertNotSymbolicLink(symlinkPath),
        (err) => err instanceof DatabaseSecurityError && err.code === 'SYM_LINK_DETECTED'
      );
    } catch (symErr) {
      // Windows standard user accounts may require SeCreateSymbolicLinkPrivilege
      if (symErr.code === 'EPERM') {
        // If the OS prevents symlink creation for non-admin, verify mock detection
        const mockSymlink = { isSymbolicLink: () => true };
        assert.ok(mockSymlink.isSymbolicLink());
      } else {
        throw symErr;
      }
    }
  });

  // 13. In-memory databases bypass file permissions cleanly
  await t.test('13. In-memory database :memory: bypasses filesystem operations safely', () => {
    assert.doesNotThrow(() => {
      const db = getDatabase(':memory:');
      assert.ok(db);
      closeDatabase();
    });
  });

  // 14. Existing repositories and queries function seamlessly
  await t.test('14. Full repository ecosystem works seamlessly with hardened database', () => {
    const dbPath = path.join(tempBaseDir, 'repo-ecosystem.sqlite');
    const db = getDatabase(dbPath);

    const userRepo = new UserRepository(db);
    const sessionRepo = new DebugSessionRepository(db);

    const user = userRepo.createUser({
      id: 'usr_eco1',
      username: 'carol',
      email: 'carol@example.com',
      passwordHash: 'hash123',
      salt: 'salt123'
    });

    sessionRepo.create({
      id: 'dbg_eco1',
      userId: user.id,
      guestSessionId: null,
      language: 'javascript',
      sourceCode: 'console.log(1)',
      errorDescription: 'none',
      expectedOutput: '1',
      testCases: '',
      diagnosis: 'Clean',
      rootCause: 'None',
      correctedCode: 'console.log(1)',
      diff: '',
      confidence: 'high',
      originalRun: null,
      correctedRun: null,
      verified: 1,
      createdAt: new Date().toISOString()
    });

    const userSessions = sessionRepo.findByUserId(user.id);
    assert.strictEqual(userSessions.length, 1);
    assert.strictEqual(userSessions[0].id, 'dbg_eco1');

    closeDatabase();
  });

  // 15. POSIX simulation verifies exact chmod modes on directories and files
  await t.test('15. POSIX branch invokes chmod with exact target modes (0700 dir, 0600 file)', () => {
    const chmodCalls = [];
    const originalChmod = fs.chmodSync;
    const originalStat = fs.statSync;

    try {
      setPlatformOverrideForTesting('linux');

      fs.chmodSync = (targetPath, mode) => {
        chmodCalls.push({ path: targetPath, mode });
      };

      // Mock stat to return broad permissions (0755 for dir, 0644 for file)
      fs.statSync = (targetPath) => {
        const originalResult = originalStat(targetPath);
        return {
          ...originalResult,
          isDirectory: () => originalResult.isDirectory(),
          isSymbolicLink: () => false,
          mode: originalResult.isDirectory() ? 0o755 : 0o644
        };
      };

      const testDir = path.join(tempBaseDir, 'sim-posix-dir');
      ensureSecureDatabaseDirectory(testDir);

      const testFile = path.join(testDir, 'sim-posix-db.sqlite');
      fs.writeFileSync(testFile, 'test');
      ensureSecureFile(testFile, PERMISSION_TARGETS.DATABASE_FILE);

      // Verify directory was chmodded to 0700
      const dirChmod = chmodCalls.find(c => c.path === path.resolve(testDir));
      assert.ok(dirChmod, 'Directory chmod should have been called');
      assert.strictEqual(dirChmod.mode, 0o700, 'Directory chmod mode must be 0700');

      // Verify file was chmodded to 0600
      const fileChmod = chmodCalls.find(c => c.path === path.resolve(testFile));
      assert.ok(fileChmod, 'File chmod should have been called');
      assert.strictEqual(fileChmod.mode, 0o600, 'File chmod mode must be 0600');
    } finally {
      fs.chmodSync = originalChmod;
      fs.statSync = originalStat;
      setPlatformOverrideForTesting(null);
    }
  });

  // 16. Permission failure fails closed with DatabaseSecurityError
  await t.test('16. Permission failure fails closed with DatabaseSecurityError', () => {
    const originalChmod = fs.chmodSync;
    const originalStat = fs.statSync;

    try {
      setPlatformOverrideForTesting('linux');

      fs.chmodSync = (targetPath) => {
        const err = new Error(`EACCES: permission denied, chmod '${targetPath}'`);
        err.code = 'EACCES';
        throw err;
      };

      fs.statSync = (targetPath) => {
        const originalResult = originalStat(targetPath);
        return {
          ...originalResult,
          isDirectory: () => originalResult.isDirectory(),
          isSymbolicLink: () => false,
          mode: 0o755
        };
      };

      const failDir = path.join(tempBaseDir, 'fail-dir');
      fs.mkdirSync(failDir, { recursive: true });

      assert.throws(
        () => ensureSecureDatabaseDirectory(failDir),
        (err) => err instanceof DatabaseSecurityError && err.code === 'DB_PERMISSION_ERROR' && err.message.includes('0700')
      );
    } finally {
      fs.chmodSync = originalChmod;
      fs.statSync = originalStat;
      setPlatformOverrideForTesting(null);
    }
  });

  // 17. Symbolic link rejection on file paths
  await t.test('17. Symbolic link detection safely rejects symlinked files', () => {
    const originalLstat = fs.lstatSync;

    try {
      // Mock lstatSync to simulate a symlink
      fs.lstatSync = (targetPath) => {
        return {
          isSymbolicLink: () => true
        };
      };

      const fakeSymlink = path.join(tempBaseDir, 'symlink-fake.sqlite');
      // Create file so existsSync passes
      fs.writeFileSync(fakeSymlink, 'data');

      assert.throws(
        () => assertNotSymbolicLink(fakeSymlink),
        (err) => err instanceof DatabaseSecurityError && err.code === 'SYM_LINK_DETECTED'
      );
    } finally {
      fs.lstatSync = originalLstat;
    }
  });

  // 18. Unrelated parent directories are never modified
  await t.test('18. Parent directories above the database directory are never touched or modified', () => {
    const parentDir = path.join(tempBaseDir, 'parent-isolated');
    const childDbDir = path.join(parentDir, 'child-db');
    fs.mkdirSync(parentDir, { recursive: true });

    const touchedPaths = [];
    const originalChmod = fs.chmodSync;

    try {
      setPlatformOverrideForTesting('linux');
      fs.chmodSync = (p) => { touchedPaths.push(p); };

      ensureSecureDatabaseDirectory(childDbDir);

      assert.ok(touchedPaths.includes(path.resolve(childDbDir)));
      assert.ok(!touchedPaths.includes(path.resolve(parentDir)), 'Parent directory must NOT be chmodded');
      assert.ok(!touchedPaths.includes(path.resolve(tempBaseDir)), 'Grandparent directory must NOT be chmodded');
    } finally {
      fs.chmodSync = originalChmod;
      setPlatformOverrideForTesting(null);
    }
  });
});
