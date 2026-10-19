import { spawn } from 'node:child_process';
import { SandboxRunner } from './sandboxRunner.js';

/**
 * Host Process Runner:
 * Executes code using child processes on the host operating system with
 * safe spawn flags, stripped environment, output caps, and timeout enforcement.
 */
export class HostSandboxRunner extends SandboxRunner {
  constructor() {
    super('host', 'Host Process Runner');
  }

  isAvailable() {
    return true; // Node child_process is always available on host
  }

  getCapabilities() {
    return {
      isolated: false,
      isolationType: 'host_process',
      containerized: false,
      networkRestricted: false,
      filesystemRestricted: 'partial_ephemeral_cwd',
      memoryLimitEnforced: false,
      processLimitEnforced: false,
      timeoutEnforced: true,
      bufferCapped: true,
      description: 'Executes via host OS child processes with shell: false and environment scrubbing. Not hypervisor-isolated.'
    };
  }

  async run({ cmd, args, cwd, stdinInput = '', timeoutMs = 5000, maxOutputBytes = 65536, env = {} }) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let isTimedOut = false;

      // Strictly scrubbed environment variables
      const restrictedEnv = {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        COMSPEC: process.env.COMSPEC,
        TEMP: cwd,
        TMP: cwd,
        PYTHONUNBUFFERED: '1',
        NODE_ENV: 'sandbox',
        ...env
      };

      // Strip any accidental sensitive secrets
      delete restrictedEnv.OPENAI_API_KEY;
      delete restrictedEnv.GEMINI_API_KEY;
      delete restrictedEnv.SESSION_SECRET;

      let proc;
      try {
        proc = spawn(cmd, args, {
          cwd,
          env: restrictedEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          windowsHide: true
        });
      } catch (err) {
        return resolve({
          spawnError: err,
          exitCode: -1,
          stdout: '',
          stderr: err.message,
          timedOut: false
        });
      }

      const timer = setTimeout(() => {
        isTimedOut = true;
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
