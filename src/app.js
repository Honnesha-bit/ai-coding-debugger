import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { trackGuestSession } from './middleware/guestMiddleware.js';
import { authenticate } from './middleware/authMiddleware.js';
import { errorHandler } from './middleware/errorHandler.js';
import { securityHeaders } from './middleware/securityHeadersMiddleware.js';
import { createRateLimiter } from './middleware/rateLimitMiddleware.js';

import { createAuthRouter } from './routes/authRoutes.js';
import { createDebugRouter } from './routes/debugRoutes.js';
import { createHistoryRouter } from './routes/historyRoutes.js';
import { createEvaluationRouter } from './routes/evaluationRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(customDb = null, options = {}) {
  const app = express();

  // 1. Trust proxy when deployed behind reverse proxy/load balancer
  if (config.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  // 2. OWASP Security Headers (CSP, FrameGuard, NoSniff, Referrer-Policy, HSTS)
  app.use(securityHeaders);

  // 3. CORS configuration
  const corsOrigin = config.NODE_ENV === 'production' && config.CORS_ORIGIN !== '*'
    ? config.CORS_ORIGIN
    : (config.NODE_ENV === 'production' ? false : true);
  app.use(cors({ origin: corsOrigin, credentials: true }));

  // 4. Request body size clamping (512kb to prevent payload exhaustion attacks)
  app.use(express.json({ limit: '512kb' }));
  app.use(express.urlencoded({ extended: true, limit: '512kb' }));
  app.use(cookieParser());

  // 5. Session & Auth tracking (Must run before rate limiters so keyGenerator can isolate user/guest identity)
  app.use(trackGuestSession);
  app.use(authenticate);

  // 6. In-Memory Sliding-Window Rate Limiters
  const enableRateLimit = options.enableRateLimit !== undefined ? options.enableRateLimit : true;
  if (enableRateLimit) {
    const apiLimiter = createRateLimiter({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX_REQUESTS,
      message: 'Too many requests to the API. Please wait a moment.'
    });

    const authLimiter = createRateLimiter({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: 20,
      message: 'Too many authentication attempts. Please wait 1 minute before retrying.'
    });

    const debugLimiter = createRateLimiter({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_DEBUG_MAX,
      message: 'Too many code analysis/execution requests. Please wait before submitting more code.'
    });

    app.use('/api', apiLimiter);
    app.use('/api/v1/auth', authLimiter);
    app.use('/api/v1/debug', debugLimiter);
    app.use('/api/v1/execute', debugLimiter);
  }

  // Serve static public assets
  const publicDir = path.join(config.ROOT_DIR, 'public');
  app.use(express.static(publicDir));

  // Mount API endpoints (both /api/v1 and /api for seamless frontend compatibility)
  const authRouter = createAuthRouter();
  const debugRouter = createDebugRouter(options);
  const historyRouter = createHistoryRouter();
  const evalRouter = createEvaluationRouter();

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1', debugRouter);
  app.use('/api/v1/history', historyRouter);
  app.use('/api/v1/evaluation', evalRouter);

  app.use('/api/auth', authRouter);
  app.use('/api/history', historyRouter);
  app.use('/api/evaluation', evalRouter);
  app.use('/api', debugRouter);

  // Health check endpoint
  const healthHandler = (req, res) => {
    res.json({
      status: 'healthy',
      version: '1.0.0',
      sandbox_available: true,
      message: 'Backend is healthy',
      components: {
        sandbox: { status: 'healthy' }
      },
      timestamp: new Date().toISOString()
    });
  };
  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);
  app.get('/api/v1/health', healthHandler);

  // SPA fallback for frontend client-side routing
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Central error handler
  app.use(errorHandler);

  return app;
}
