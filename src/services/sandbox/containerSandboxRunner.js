import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SandboxRunner } from './sandboxRunner.js';

/**
 * Container Sandbox Runner:
 * Executes untrusted code inside an isolated container (Docker or Podman)
 * with disabled networking, read-only root, memory/CPU/PID limits, non-root user,
 * and ephemeral storage.
 */
export class ContainerSandboxRunner extends SandboxRunner {
  constructor(options = {}) {
    super('container', 'Container Sandbox Runner');
    this.image = options.image || 'ai-coding-debugger-sandbox:latest';
    this.memoryLimit = options.memoryLimit || '256m';
    this.pidsLimit = options.pidsLimit || 64;
    this.cpus = options.cpus || '1.0';
    this.tmpfsSize = options.tmpfsSize || '64m';
    this._cliBinary = null;
    this._cachedAvailability = null;
  }

  /**
   * Detects whether Docker or Podman is installed and functional.
   */
  isAvailable() {
    if (this._cachedAvailability !== null) {
      return this._cachedAvailability;
    }

    for (const bin of ['docker', 'podman']) {
      try {
        const check = process.platform === 'win32'
          ? `where ${bin}`
          : `which ${bin}`;
        execSync(check, { stdio: 'ignore', timeout: 1500 });
        this._cliBinary = bin;
        this._cachedAvailability = true;
        return true;
      } catch {
        // Not found
      }
    }

    this._cachedAvailability = false;
    return false;
  }

  /**
   * Gets detected binary name (docker or podman).
   */
  getBinaryName() {
    this.isAvailable();
    return this._cliBinary;
  }

  getCapabilities() {
    const available = this.isAvailable();
    return {
      isolated: available,
      isolationType: available ? 'docker_container' : 'container_unavailable',
      containerized: true,
      runtime: this._cliBinary || 'none',
      networkRestricted: true,
      networkMode: 'none',
      filesystemRestricted: 'read_only_root_with_ram_tmpfs',
      memoryLimit: this.memoryLimit,
      processLimit: this.pidsLimit,
      cpuLimit: this.cpus,
      user: '10001:10001 (non-root)',
      timeoutEnforced: true,
      bufferCapped: true,
      description: available
        ? `Isolated via ${this._cliBinary} with network:none, read-only root, memory cap, and PID limit.`
        : 'Container runtime (Docker/Podman) is not installed on this host.'
    };
  }

  /**
   * Translates host command and arguments into isolated in-container paths:
   * - Ephemeral hostDir is mounted read-only at /app/code:ro
   * - Working directory is a writable tmpfs at /workspace
   * - Source files and code scripts map to /app/code/<sanitized-filename>
   * - Compiler output flags (-o) and directories (-d, -cp) map to /workspace
   * - Helper runner scripts (e.g. sqlRunner.js) outside hostDir are mounted read-only at /app/runners/<filename>
   */
  translateExecutionPaths({ hostDir, cmd, args = [] }) {
    const resolvedHostDir = path.resolve(hostDir);
    const normalizedHostDir = resolvedHostDir.replace(/\\/g, '/');
    const extraMounts = [];

    // Helper: Checks if target string represents a path inside hostDir
    const isInsideHostDir = (target) => {
      if (!target || typeof target !== 'string') return false;
      const resolved = path.resolve(target);
      return resolved.startsWith(resolvedHostDir) || resolved.replace(/\\/g, '/').startsWith(normalizedHostDir);
    };

    // Helper: Validates and sanitizes filename to prevent directory traversal
    const sanitizeName = (name) => path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');

    // 1. Translate command if it points to a compiled binary inside hostDir
    let translatedCmd = cmd;
    if (isInsideHostDir(cmd) || (typeof cmd === 'string' && (cmd.endsWith('.out') || cmd.endsWith('.exe')) && !cmd.startsWith('/'))) {
      translatedCmd = `/workspace/${sanitizeName(cmd)}`;
    }

    // 2. Translate arguments
    const translatedArgs = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (typeof arg !== 'string') {
        translatedArgs.push(arg);
        continue;
      }

      // If already an in-container absolute path, preserve
      if (arg.startsWith('/workspace') || arg.startsWith('/app/') || arg.startsWith('/tmp')) {
        translatedArgs.push(arg);
        continue;
      }

      const prevArg = i > 0 ? args[i - 1] : null;

      // Case A: Compiler output binary flag (-o <binary>)
      if (prevArg === '-o') {
        translatedArgs.push(`/workspace/${sanitizeName(arg)}`);
        continue;
      }

      // Case B: Java compiler class destination directory flag (-d <dir>)
      if (prevArg === '-d') {
        translatedArgs.push('/workspace');
        continue;
      }

      // Case C: Java classpath flag (-cp or -classpath <dir>)
      if (prevArg === '-cp' || prevArg === '-classpath') {
        translatedArgs.push('/workspace');
        continue;
      }

      // Case D: Compiler / runtime options and flags (e.g. -Wall, -O2, --experimental-strip-types, -o, -d, -cp)
      if (arg.startsWith('-')) {
        translatedArgs.push(arg);
        continue;
      }

      // Case E: Helper runner script located outside hostDir (e.g. sqlRunner.js)
      if ((arg.endsWith('.js') || arg.endsWith('.mjs')) && !isInsideHostDir(arg)) {
        const resolvedRunner = path.resolve(arg);
        if (fs.existsSync(resolvedRunner) || arg.includes('sqlRunner')) {
          const runnerBase = sanitizeName(resolvedRunner);
          const normalizedRunner = resolvedRunner.replace(/\\/g, '/');
          const mountFlag = `${normalizedRunner}:/app/runners/${runnerBase}:ro`;
          if (!extraMounts.includes(mountFlag)) {
            extraMounts.push('-v', mountFlag);
          }
          translatedArgs.push(`/app/runners/${runnerBase}`);
          continue;
        }
      }

      // Case F: Prevent directory traversal or path escape
      if (arg.includes('..') || (!isInsideHostDir(arg) && (arg.includes('/') || arg.includes('\\')))) {
        const safeBase = sanitizeName(arg);
        translatedArgs.push(`/app/code/${safeBase}`);
        continue;
      }

      // Case G: Source files or scripts inside hostDir or relative code filenames
      const codeExtensions = ['.py', '.js', '.ts', '.c', '.cpp', '.h', '.hpp', '.java', '.sql', '.txt'];
      const hasCodeExt = codeExtensions.some(ext => arg.toLowerCase().endsWith(ext) || arg.toLowerCase().includes(ext));

      if (isInsideHostDir(arg) || hasCodeExt) {
        translatedArgs.push(`/app/code/${sanitizeName(arg)}`);
        continue;
      }

      // Default: preserve argument (e.g. Java class name 'Main', literal tokens)
      translatedArgs.push(arg);
    }

    return {
      cmd: translatedCmd,
      args: translatedArgs,
      extraMounts
    };
  }

  /**
   * Generates Docker execution arguments for a given code file.
   */
  buildDockerArgs({ containerId, hostDir, cmd, args, tmpfsSize = '64m' }) {
    // Convert Windows host path to forward slashes for Docker volume mount
    const normalizedHostDir = path.resolve(hostDir).replace(/\\/g, '/');
    const { cmd: containerCmd, args: containerArgs, extraMounts } = this.translateExecutionPaths({
      hostDir,
      cmd,
      args: args || []
    });

    return [
      'run',
      '--rm',
      '--name', containerId,
      '--network', 'none',
      '--read-only',
      '--tmpfs', `/tmp:rw,noexec,nosuid,size=${tmpfsSize}`,
      '--tmpfs', `/workspace:rw,size=${tmpfsSize}`,
      '--memory', this.memoryLimit,
      '--memory-swap', this.memoryLimit,
      '--pids-limit', String(this.pidsLimit),
      '--cpus', String(this.cpus),
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges:true',
      '--user', '10001:10001',
      '-v', `${normalizedHostDir}:/app/code:ro`,
      ...extraMounts,
      '-w', '/workspace',
      this.image,
      containerCmd,
      ...containerArgs
    ];
  }

  async run({ cmd, args, cwd, stdinInput = '', timeoutMs = 5000, maxOutputBytes = 65536 }) {
    if (!this.isAvailable()) {
      return {
        exitCode: -1,
        stdout: '',
        stderr: `Container execution failed: Docker or Podman is not available on this host.`,
        timedOut: false,
        unavailable: true
      };
    }

    const containerId = `ai-sandbox-${crypto.randomBytes(6).toString('hex')}`;
    const dockerArgs = this.buildDockerArgs({
      containerId,
      hostDir: cwd,
      cmd,
      args,
      tmpfsSize: this.tmpfsSize
    });

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let isTimedOut = false;

      let proc;
      try {
        proc = spawn(this._cliBinary, dockerArgs, {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          windowsHide: true
        });
      } catch (err) {
        return resolve({
          spawnError: err,
          exitCode: -1,
          stdout: '',
          stderr: `Failed to spawn ${this._cliBinary}: ${err.message}`,
          timedOut: false
        });
      }

      // Hard timeout timer
      const timer = setTimeout(() => {
        isTimedOut = true;
        // Kill the container via docker kill to ensure all child processes are terminated
        try {
          execSync(`${this._cliBinary} kill ${containerId}`, { stdio: 'ignore', timeout: 2000 });
        } catch {
          // Process may have already exited
        }
        try {
          proc.kill('SIGKILL');
        } catch {}
      }, timeoutMs);

      if (proc.stdin) {
        if (stdinInput) {
          proc.stdin.write(stdinInput);
        }
        proc.stdin.end();
      }

      const appendChunk = (current, data) => {
        if (current.includes('[OUTPUT TRUNCATED: Exceeded size limit]')) {
          return current;
        }
        const remaining = maxOutputBytes - current.length;
        if (remaining <= 0) {
          return current + '\n[OUTPUT TRUNCATED: Exceeded size limit]';
        }
        const str = data.toString('utf8');
        if (str.length >= remaining) {
          return current + str.slice(0, remaining) + '\n[OUTPUT TRUNCATED: Exceeded size limit]';
        }
        return current + str;
      };

      proc.stdout.on('data', (data) => {
        stdout = appendChunk(stdout, data);
      });

      proc.stderr.on('data', (data) => {
        stderr = appendChunk(stderr, data);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          spawnError: err,
          exitCode: -1,
          stdout,
          stderr: stderr || err.message,
          timedOut: isTimedOut
        });
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: isTimedOut ? -1 : (code ?? 0),
          stdout,
          stderr,
          timedOut: isTimedOut
        });
      });
    });
  }
}
