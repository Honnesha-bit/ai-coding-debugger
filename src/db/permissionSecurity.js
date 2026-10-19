import fs from 'node:fs';
import path from 'node:path';

/**
 * Standard POSIX permission targets for database storage:
 * - Directory: 0700 (rwx------) Owner only can list, read, and write
 * - Main Database File: 0600 (rw-------) Owner only can read and write
 * - WAL & Sidecar Files: 0600 (rw-------) Owner only can read and write
 */
export const PERMISSION_TARGETS = {
  DIRECTORY: 0o700,
  DATABASE_FILE: 0o600,
  WAL_FILE: 0o600,
  SHM_FILE: 0o600,
  JOURNAL_FILE: 0o600
};

export class DatabaseSecurityError extends Error {
  constructor(message, path = null, code = 'DB_PERMISSION_ERROR') {
    super(message);
    this.name = 'DatabaseSecurityError';
    this.path = path;
    this.code = code;
  }
}

let platformOverride = null;

export function setPlatformOverrideForTesting(platform) {
  platformOverride = platform;
}

/**
 * Detects whether the current platform supports POSIX permission modes.
 */
export function isPosixPlatform() {
  if (platformOverride !== null) {
    return platformOverride !== 'win32';
  }
  return process.platform !== 'win32';
}

/**
 * Inspects a path to ensure it is not an unexpected symbolic link.
 * Throws DatabaseSecurityError if a symbolic link is detected.
 */
export function assertNotSymbolicLink(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  try {
    const lstat = fs.lstatSync(targetPath);
    if (lstat.isSymbolicLink()) {
      throw new DatabaseSecurityError(
        `Security violation: Refusing to operate on symbolic link at '${targetPath}'.`,
        targetPath,
        'SYM_LINK_DETECTED'
      );
    }
  } catch (err) {
    if (err instanceof DatabaseSecurityError) throw err;
    throw new DatabaseSecurityError(
      `Failed to inspect path '${targetPath}': ${err.message}`,
      targetPath
    );
  }
}

/**
 * Ensures the database parent directory exists and has restrictive POSIX permissions (0700).
 * On Windows, ensures directory exists without attempting unsupported POSIX chmod.
 */
export function ensureSecureDatabaseDirectory(dirPath) {
  if (!dirPath || dirPath === '.' || dirPath === ':memory:') {
    return;
  }

  const resolvedDir = path.resolve(dirPath);

  // 1. Guard against symbolic links
  assertNotSymbolicLink(resolvedDir);

  // 2. Create directory if it does not exist
  if (!fs.existsSync(resolvedDir)) {
    try {
      fs.mkdirSync(resolvedDir, {
        recursive: true,
        mode: isPosixPlatform() ? PERMISSION_TARGETS.DIRECTORY : undefined
      });
    } catch (err) {
      throw new DatabaseSecurityError(
        `Failed to create database directory '${resolvedDir}': ${err.message}`,
        resolvedDir
      );
    }
  }

  // 3. On POSIX, tighten directory permissions to 0700 if overly permissive
  if (isPosixPlatform()) {
    try {
      assertNotSymbolicLink(resolvedDir);
      const stat = fs.statSync(resolvedDir);
      const currentMode = stat.mode & 0o777;
      if (currentMode !== PERMISSION_TARGETS.DIRECTORY) {
        fs.chmodSync(resolvedDir, PERMISSION_TARGETS.DIRECTORY);
      }
    } catch (err) {
      if (err instanceof DatabaseSecurityError) throw err;
      throw new DatabaseSecurityError(
        `Failed to enforce secure permissions (0700) on database directory '${resolvedDir}': ${err.message}`,
        resolvedDir
      );
    }
  }
}

/**
 * Ensures a database file or sidecar has restrictive permissions (0600) on POSIX platforms.
 */
export function ensureSecureFile(filePath, targetMode = PERMISSION_TARGETS.DATABASE_FILE) {
  if (!filePath || filePath === ':memory:') {
    return false;
  }

  const resolvedFile = path.resolve(filePath);

  if (!fs.existsSync(resolvedFile)) {
    return false;
  }

  // Guard against symlink manipulation
  assertNotSymbolicLink(resolvedFile);

  if (isPosixPlatform()) {
    try {
      const stat = fs.statSync(resolvedFile);
      const currentMode = stat.mode & 0o777;
      if (currentMode !== targetMode) {
        fs.chmodSync(resolvedFile, targetMode);
      }
    } catch (err) {
      if (err instanceof DatabaseSecurityError) throw err;
      throw new DatabaseSecurityError(
        `Failed to enforce secure permissions (${targetMode.toString(8)}) on file '${resolvedFile}': ${err.message}`,
        resolvedFile
      );
    }
  }

  return true;
}

/**
 * Inspects and secures any existing SQLite sidecar files (-wal, -shm, -journal).
 */
export function ensureSecureSidecars(dbPath) {
  if (!dbPath || dbPath === ':memory:') {
    return;
  }

  const sidecars = [
    { ext: '-wal', mode: PERMISSION_TARGETS.WAL_FILE },
    { ext: '-shm', mode: PERMISSION_TARGETS.SHM_FILE },
    { ext: '-journal', mode: PERMISSION_TARGETS.JOURNAL_FILE }
  ];

  for (const { ext, mode } of sidecars) {
    const sidecarPath = `${dbPath}${ext}`;
    if (fs.existsSync(sidecarPath)) {
      ensureSecureFile(sidecarPath, mode);
    }
  }
}

/**
 * Pre-initialization security setup:
 * 1. Secures the parent directory.
 * 2. Tightens existing database file and sidecars if they exist.
 * 3. Sets process umask to 0077 on POSIX so newly created files are owner-only.
 */
export function preInitSecureDatabase(dbPath) {
  if (!dbPath || dbPath === ':memory:') {
    return;
  }

  const dir = path.dirname(dbPath);
  ensureSecureDatabaseDirectory(dir);

  // If database already exists before init, ensure it is secure
  if (fs.existsSync(dbPath)) {
    ensureSecureFile(dbPath, PERMISSION_TARGETS.DATABASE_FILE);
    ensureSecureSidecars(dbPath);
  }

  // Set umask on POSIX so SQLite creates files with restrictive mode
  if (isPosixPlatform() && typeof process.umask === 'function') {
    try {
      process.umask(0o077);
    } catch {
      // Ignore if umask cannot be set
    }
  }
}

/**
 * Post-initialization security check:
 * Ensures the newly opened/created database file and any generated sidecar files
 * have their permissions verified and tightened.
 */
export function postInitSecureDatabase(dbPath) {
  if (!dbPath || dbPath === ':memory:') {
    return;
  }

  ensureSecureFile(dbPath, PERMISSION_TARGETS.DATABASE_FILE);
  ensureSecureSidecars(dbPath);
}
