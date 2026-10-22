const { spawnSync, spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const [lang, sourceFile] = process.argv.slice(2);

if (!lang || !sourceFile) {
  console.error('Usage: node compiledRunner.js <c|cpp> <sourceFile>');
  process.exit(1);
}

const compiler = lang === 'cpp' ? 'g++' : 'gcc';
const outputFile = '/workspace/solution.out';

// 1. Compile step
const compileRes = spawnSync(compiler, ['-O2', '-Wall', sourceFile, '-o', outputFile], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024
});

if (compileRes.status !== 0) {
  if (compileRes.stderr) process.stderr.write(compileRes.stderr);
  if (compileRes.stdout) process.stdout.write(compileRes.stdout);
  process.exit(compileRes.status || 1);
}

// 2. Execution step
if (!fs.existsSync(outputFile)) {
  console.error(`Compiled binary ${outputFile} was not produced.`);
  process.exit(1);
}

const child = spawn(outputFile, [], {
  stdio: ['inherit', 'inherit', 'inherit']
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(128 + 9);
  }
  process.exit(code || 0);
});
