import { SandboxService } from '../src/services/sandboxService.js';

async function main() {
  const ss = new SandboxService();
  console.log('Sandbox Status:', ss.getStatus());

  // 1. Python Execution
  console.log('\n--- 1. Testing Python ---');
  const pyRes = await ss.execute({ language: 'python', code: 'print("Python 3 OK: " + str(21 * 2))' });
  console.log('Python Status:', pyRes.status, 'Exit:', pyRes.exitCode, 'Stdout:', (pyRes.stdout || '').trim());

  // 2. JavaScript Execution
  console.log('\n--- 2. Testing JavaScript ---');
  const jsRes = await ss.execute({ language: 'javascript', code: 'console.log("Node JS OK: " + [1,2,3].reduce((a,b)=>a+b, 0));' });
  console.log('JS Status:', jsRes.status, 'Exit:', jsRes.exitCode, 'Stdout:', (jsRes.stdout || '').trim());

  // 3. Java Execution
  console.log('\n--- 3. Testing Java ---');
  const javaRes = await ss.execute({
    language: 'java',
    code: 'public class Solution { public static void main(String[] args) { System.out.println("Java OK: 42"); } }'
  });
  console.log('Java Status:', javaRes.status, 'Exit:', javaRes.exitCode, 'Stdout:', (javaRes.stdout || '').trim());

  // 4. Timeout / Infinite Loop
  console.log('\n--- 4. Testing Timeout ---');
  const timeoutRes = await ss.execute({
    language: 'python',
    code: 'import time\nwhile True:\n    time.sleep(0.1)',
    timeoutMs: 1500
  });
  console.log('Timeout Status:', timeoutRes.status, 'TimedOut:', timeoutRes.timedOut);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
