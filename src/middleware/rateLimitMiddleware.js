/**
 * In-memory sliding-window rate limiting middleware with dual guest rate limiting.
 * Zero-dependency, thread-safe within Node event loop, with bounded automated cleanup.
 *
 * For authenticated users:
 *   Keyed strictly by user ID (`user_<userId>`).
 *
 * For unauthenticated guests:
 *   Dual buckets enforced simultaneously:
 *   1. Session bucket: `guest_<guestSessionId>` (if session cookie is present)
 *   2. IP bucket: `ip_<clientIp>` (derived safely from req.ip / remoteAddress)
 *
 * If either bucket reaches its configured limit, the request is rejected with HTTP 429.
 * Rotating or clearing guest session cookies cannot bypass the IP bucket.
 */

function getClientIp(req) {
  const rawIp = req.ip || req.socket?.remoteAddress || 'unknown';
  if (typeof rawIp !== 'string') return 'unknown';
  // Strip IPv6 prefix for IPv4-mapped addresses (::ffff:127.0.0.1 -> 127.0.0.1)
  return rawIp.replace(/^::ffff:/, '').trim() || 'unknown';
}

function getRateLimitKeys(req, customKeyGenerator) {
  if (customKeyGenerator) {
    const custom = customKeyGenerator(req);
    return Array.isArray(custom) ? custom.filter(Boolean) : [custom].filter(Boolean);
  }

  // 1. Authenticated user: keyed strictly by user ID
  if (req.user?.id) {
    return [`user_${req.user.id}`];
  }

  // 2. Unauthenticated guest: dual buckets (session bucket + IP bucket)
  const clientIp = getClientIp(req);
  const ipKey = `ip_${clientIp}`;

  if (req.guestSessionId) {
    return [`guest_${req.guestSessionId}`, ipKey];
  }

  return [ipKey];
}

export function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60 * 1000; // 1 minute default
  const max = options.max || 60; // Max requests per window
  const message = options.message || 'Too many requests. Please try again later.';
  const maxEntries = options.maxEntries || 20000; // Bounded in-memory map size guard

  const hits = new Map();

  // Periodic cleanup of stale entries every windowMs
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits.entries()) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, valid);
      }
    }
  }, windowMs);

  // Unref timer so it doesn't prevent Node process termination
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  // Bounded cleanup to prevent unbounded memory growth during high-cardinality floods
  const pruneIfOversized = (now) => {
    if (hits.size <= maxEntries) return;
    for (const [key, timestamps] of hits.entries()) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        hits.delete(key);
      }
    }
    if (hits.size > maxEntries) {
      const excess = hits.size - maxEntries;
      let deleted = 0;
      for (const k of hits.keys()) {
        hits.delete(k);
        deleted++;
        if (deleted >= excess) break;
      }
    }
  };

  const limiter = (req, res, next) => {
    // Allow bypassing in unit tests if explicitly requested
    if (options.skip && options.skip(req)) {
      return next();
    }

    const rawKeys = getRateLimitKeys(req, options.keyGenerator);
    // Deduplicate keys to avoid accidentally consuming multiple units from the same bucket
    const keys = [...new Set(rawKeys)];
    const now = Date.now();

    pruneIfOversized(now);

    let isLimited = false;
    let maxRetryAfterSec = 1;
    let minRemaining = max;

    // 1. Evaluate all applicable buckets
    for (const key of keys) {
      const existingTimestamps = hits.get(key) || [];
      const validTimestamps = existingTimestamps.filter((t) => now - t < windowMs);

      if (validTimestamps.length !== existingTimestamps.length) {
        if (validTimestamps.length === 0) {
          hits.delete(key);
        } else {
          hits.set(key, validTimestamps);
        }
      }

      const remaining = Math.max(0, max - validTimestamps.length);
      if (remaining < minRemaining) {
        minRemaining = remaining;
      }

      if (validTimestamps.length >= max) {
        isLimited = true;
        const oldest = validTimestamps[0];
        const resetInMs = Math.max(1000, windowMs - (now - oldest));
        const retrySec = Math.ceil(resetInMs / 1000);
        if (retrySec > maxRetryAfterSec) {
          maxRetryAfterSec = retrySec;
        }
      }
    }

    // 2. Reject if any bucket reached limit
    if (isLimited) {
      res.setHeader('Retry-After', String(maxRetryAfterSec));
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(Math.ceil((now + (maxRetryAfterSec * 1000)) / 1000)));

      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message,
        retryAfterSeconds: maxRetryAfterSec
      });
    }

    // 3. Not limited: record exactly 1 timestamp in each applicable bucket
    for (const key of keys) {
      const timestamps = hits.get(key) || [];
      timestamps.push(now);
      hits.set(key, timestamps);
    }

    const effectiveRemaining = Math.max(0, minRemaining - 1);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(effectiveRemaining));

    next();
  };

  limiter.reset = () => {
    hits.clear();
  };

  limiter.getHitCount = (key) => {
    const timestamps = hits.get(key) || [];
    const now = Date.now();
    return timestamps.filter((t) => now - t < windowMs).length;
  };

  return limiter;
}
