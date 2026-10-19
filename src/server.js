import { createApp } from './app.js';
import { config, validateProductionConfig } from './config.js';
import { getDatabase, closeDatabase } from './db/database.js';

// Enforce production security configuration validation
validateProductionConfig(config);

const app = createApp();

// Initialize database
getDatabase();

const server = app.listen(config.PORT, () => {
  console.log(`AI Coding Debugger server running on http://localhost:${config.PORT}`);
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
