import express from 'express';
import { DebugSessionRepository } from '../db/repositories/debugSessionRepository.js';

/**
 * Resolves the caller's identity strictly from authenticated user token or HTTP-only guest session cookie.
 * Never trusts client-supplied query parameters or request body properties for identity.
 */
function resolveIdentity(req) {
  if (req.user && req.user.id) {
    return { isUser: true, userId: req.user.id, guestSessionId: null };
  }
  const guestSessionId = req.guestSessionId || (req.cookies && req.cookies.guest_session_id) || null;
  if (guestSessionId) {
    return { isUser: false, userId: null, guestSessionId };
  }
  return { isUser: false, userId: null, guestSessionId: null };
}

export function createHistoryRouter(sessionRepo = null) {
  const router = express.Router();
  const repo = sessionRepo || new DebugSessionRepository();

  // GET /api/v1/history - list caller's sessions with pagination and filters
  router.get('/', (req, res) => {
    try {
      const identity = resolveIdentity(req);
      if (!identity.userId && !identity.guestSessionId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'You must have a valid session or account to view history.'
        });
      }

      // Safe limit and offset parsing
      const rawLimit = parseInt(req.query.limit, 10);
      const limit = Math.max(1, Math.min(50, !isNaN(rawLimit) ? rawLimit : 10));

      const rawPage = parseInt(req.query.page, 10);
      const page = Math.max(1, !isNaN(rawPage) ? rawPage : 1);

      let offset;
      if (req.query.offset !== undefined) {
        const rawOffset = parseInt(req.query.offset, 10);
        offset = Math.max(0, !isNaN(rawOffset) ? rawOffset : 0);
      } else {
        offset = (page - 1) * limit;
      }

      const language = req.query.language && typeof req.query.language === 'string'
        ? req.query.language.trim()
        : null;

      const status = req.query.status && typeof req.query.status === 'string'
        ? req.query.status.trim()
        : null;

      const search = req.query.search && typeof req.query.search === 'string'
        ? req.query.search.trim()
        : null;

      const filterArgs = {
        userId: identity.userId,
        guestSessionId: identity.guestSessionId,
        limit,
        offset,
        language,
        status,
        search
      };

      const sessions = repo.findPaginated(filterArgs);
      const totalCount = repo.count({
        userId: identity.userId,
        guestSessionId: identity.guestSessionId,
        language,
        status,
        search
      });

      const totalPages = Math.ceil(totalCount / limit) || 0;
      const currentPage = Math.floor(offset / limit) + 1;

      res.json({
        success: true,
        sessions: sessions.map(s => ({
          id: s.id,
          language: s.language,
          errorDescription: s.errorDescription,
          sourceCodePreview: s.sourceCodePreview,
          verified: s.verified,
          verificationStatus: s.verificationStatus,
          confidence: s.confidence,
          durationMs: s.durationMs,
          createdAt: s.createdAt
        })),
        pagination: {
          totalCount,
          page: currentPage,
          pageSize: limit,
          totalPages,
          limit,
          offset
        },
        totalCount,
        page: currentPage,
        pageSize: limit,
        totalPages
      });
    } catch (err) {
      res.status(500).json({ error: 'DATABASE_ERROR', message: err.message });
    }
  });

  // GET /api/v1/history/:id - get specific session (strict ownership enforced)
  router.get('/:id', (req, res) => {
    try {
      const identity = resolveIdentity(req);
      if (!identity.userId && !identity.guestSessionId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'You must have a valid session or account to view history.'
        });
      }

      const session = repo.findById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
      }

      // Strict ownership check: prevent cross-user and cross-guest data access
      const isOwner = identity.isUser
        ? session.userId === identity.userId
        : session.guestSessionId === identity.guestSessionId && session.userId === null;

      if (!isOwner) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You do not have permission to view this session'
        });
      }

      res.json({ success: true, session });
    } catch (err) {
      res.status(500).json({ error: 'DATABASE_ERROR', message: err.message });
    }
  });

  // DELETE /api/v1/history/:id - delete session (strict ownership enforced)
  router.delete('/:id', (req, res) => {
    try {
      const identity = resolveIdentity(req);
      if (!identity.userId && !identity.guestSessionId) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'You must have a valid session or account to delete history.'
        });
      }

      const session = repo.findById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
      }

      const isOwner = identity.isUser
        ? session.userId === identity.userId
        : session.guestSessionId === identity.guestSessionId && session.userId === null;

      if (!isOwner) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'You do not have permission to delete this session'
        });
      }

      const deleted = repo.deleteSession({
        id: req.params.id,
        userId: identity.userId,
        guestSessionId: identity.guestSessionId
      });

      res.json({ success: deleted, message: 'Session deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: 'DATABASE_ERROR', message: err.message });
    }
  });

  return router;
}

