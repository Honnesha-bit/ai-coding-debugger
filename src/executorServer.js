import { createSandboxExecutorApp } from './services/sandbox/sandboxExecutorServer.js';
import { ContainerSandboxRunner } from './services/sandbox/containerSandboxRunner.js';
import { config } from './config.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

console.log('====================================================');
console.log('  AI CODING DEBUGGER — SECURE SANDBOX EXECUTOR SERVICE');
console.log('====================================================');
console.log(`Port: ${PORT}`);
console.log(`Node Environment: ${config.NODE_ENV}`);
console.log(`Sandbox Image: ${config.SANDBOX_IMAGE}`);
console.log(`Authenticated: ${Boolean(config.SANDBOX_EXECUTOR_SECRET)}`);

// Startup cleanup of any stale or orphaned sandbox containers from previous runs
try {
  const runner = new ContainerSandboxRunner();
  const cleanupRes = runner.cleanupStaleContainers();
  if (cleanupRes.cleaned > 0) {
    console.log(`[Lifecycle] Pruned ${cleanupRes.cleaned} stale worker container(s) on startup.`);
  }
} catch (err) {
  console.warn(`[Lifecycle] Non-blocking startup container cleanup notice: ${err.message}`);
}

const app = createSandboxExecutorApp({
  secret: config.SANDBOX_EXECUTOR_SECRET
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Lifecycle] Sandbox Executor listening on http://0.0.0.0:${PORT}`);
});

// Graceful shutdown handling
let isShuttingDown = false;
function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nReceived ${signal}. Shutting down Sandbox Executor gracefully...`);

  const shutdownTimeout = setTimeout(() => {
    console.error('Graceful shutdown timeout exceeded. Forcing termination.');
    process.exit(1);
  }, 5000);

  if (shutdownTimeout.unref) shutdownTimeout.unref();

  server.close((err) => {
    if (err) {
      console.error('Error closing executor server:', err);
    } else {
      console.log('Sandbox Executor HTTP server closed successfully.');
    }
    clearTimeout(shutdownTimeout);
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { server };
