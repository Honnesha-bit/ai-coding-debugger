import { createApp } from './app.js';
import { config, validateProductionConfig } from './config.js';
import { getDatabase, closeDatabase } from './db/database.js';
import { ContainerSandboxRunner } from './services/sandbox/containerSandboxRunner.js';

// Enforce production security configuration validation
validateProductionConfig(config);

const app = createApp();

// Initialize database
getDatabase();

// Clean up any stale or orphaned sandbox worker containers from previous runs (in direct container mode)
if (config.SANDBOX_MODE === 'container' && !config.SANDBOX_EXECUTOR_URL) {
  try {
    const runner = new ContainerSandboxRunner();
    const cleanupRes = runner.cleanupStaleContainers();
    if (cleanupRes.cleaned > 0) {
      console.log(`[Lifecycle] Cleaned up ${cleanupRes.cleaned} stale sandbox worker container(s).`);
    }
  } catch (err) {
    console.warn(`[Lifecycle] Non-blocking startup container cleanup notice: ${err.message}`);
  }
}

const server = app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`AI Coding Debugger server running on http://0.0.0.0:${config.PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`AI Provider: ${config.AI_PROVIDER}`);
});

// Graceful shutdown handling
let isShuttingDown = false;
function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nReceived ${signal}. Initiating graceful shutdown...`);

  const shutdownTimeout = setTimeout(() => {
    console.error('Graceful shutdown timeout exceeded (10s). Forcing termination.');
    process.exit(1);
  }, 10000);

  if (shutdownTimeout.unref) shutdownTimeout.unref();

  server.close((err) => {
    if (err) {
      console.error('Error closing HTTP server:', err);
    } else {
      console.log('HTTP server closed successfully.');
    }

    try {
      closeDatabase();
      console.log('SQLite database connection closed successfully.');
    } catch (dbErr) {
      console.error('Error closing database:', dbErr);
    }

    clearTimeout(shutdownTimeout);
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { server, gracefulShutdown };
