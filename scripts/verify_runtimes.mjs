import { SandboxService } from '../src/services/sandboxService.js';

async function testExecution() {
  const sandbox = new SandboxService();

  const py = await sandbox.execute({
    language: 'python',
    code: 'print(f"Hello from Python {3 * 7}")'
  });
  console.log('Python actual execution:', { status: py.status, output: py.stdout.trim(), durationMs: py.durationMs });

  const js = await sandbox.execute({
    language: 'javascript',
    code: 'console.log(`Hello from JS ${4 * 8}`);'
  });
  console.log('JavaScript actual execution:', { status: js.status, output: js.stdout.trim(), durationMs: js.durationMs });

  const ts = await sandbox.execute({
    language: 'typescript',
    code: 'const val: number = 5 * 9;\nconsole.log(`Hello from TS ${val}`);'
  });
  console.log('TypeScript actual execution:', { status: ts.status, output: ts.stdout.trim(), durationMs: ts.durationMs });

  // Test uninstalled toolchain: Java
  const java = await sandbox.execute({
    language: 'java',
    code: 'public class Main { public static void main(String[] args) { System.out.println("Hello Java"); } }'
  });
  console.log('Java uninstalled execution:', { status: java.status, error: java.error, toolchainAvailable: java.toolchainAvailable });

  // Test uninstalled toolchain: C
  const c = await sandbox.execute({
    language: 'c',
    code: '#include <stdio.h>\nint main() { printf("Hello C\\n"); return 0; }'
  });
  console.log('C uninstalled execution:', { status: c.status, error: c.error, toolchainAvailable: c.toolchainAvailable });

  // Test uninstalled toolchain: C++
  const cpp = await sandbox.execute({
    language: 'cpp',
    code: '#include <iostream>\nint main() { std::cout << "Hello C++" << std::endl; return 0; }'
  });
  console.log('C++ uninstalled execution:', { status: cpp.status, error: cpp.error, toolchainAvailable: cpp.toolchainAvailable });
}

testExecution();
