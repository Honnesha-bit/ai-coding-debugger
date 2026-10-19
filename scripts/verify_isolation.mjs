import { SandboxService } from '../src/services/sandboxService.js';
import fs from 'node:fs';

async function testHarmlessIsolation() {
  const sandbox = new SandboxService(2000, 1024);
  const res = await sandbox.execute({
    language: 'python',
    code: 'import os\nprint("CWD:" + os.getcwd())'
  });
  console.log('Sandbox Execution Status:', res.status);
  const match = res.stdout.match(/CWD:(.*)/);
  if (match) {
    const executedDir = match[1].trim();
    console.log('Ephemeral Directory used:', executedDir);
    const stillExists = fs.existsSync(executedDir);
    console.log('Ephemeral Directory cleaned up immediately after run:', !stillExists);
  }

  // Harmless timeout test
  const timeoutStart = Date.now();
  const timeoutRes = await sandbox.execute({
    language: 'python',
    code: 'import time\ntime.sleep(10)'
  });
  const timeoutDuration = Date.now() - timeoutStart;
  console.log('Timeout test status:', timeoutRes.status, 'Terminated in (ms):', timeoutDuration);

  // Harmless output truncation test
  const truncRes = await sandbox.execute({
    language: 'python',
    code: 'print("A" * 100000)'
  });
  console.log('Truncation test output length:', truncRes.stdout.length, 'Contains truncation notice:', truncRes.stdout.includes('[OUTPUT TRUNCATED: Exceeded size limit]'));
}

testHarmlessIsolation();
