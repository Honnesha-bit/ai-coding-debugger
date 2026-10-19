import { GuestService } from '../services/guestService.js';
import { config } from '../config.js';

const guestService = new GuestService();

export function trackGuestSession(req, res, next) {
  let sessionId = req.cookies ? req.cookies.guest_session_id : null;

  if (!sessionId) {
    sessionId = guestService.generateSessionId();
    res.cookie('guest_session_id', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
  }

  req.guestSessionId = sessionId;
  next();
}

/**
 * Enforces the 2-use limit for unauthenticated guests.
 * Rejects with LOGIN_REQUIRED if quota is exhausted.
 */
export function enforceGuestLimit(req, res, next) {
  // If user is authenticated, they have unlimited or separate rate limits
  if (req.user) {
    return next();
  }

  const sessionId = req.guestSessionId;
  const reservation = guestService.reserveAttempt(sessionId);

  if (!reservation.allowed) {
    return res.status(403).json({
      error: 'LOGIN_REQUIRED',
      code: 'LOGIN_REQUIRED',
      message: "You've used your 2 free debugging attempts. Please log in or create a free account to continue debugging your code.",
      remainingUses: 0,
      maxUses: 2
    });
  }

  // Attach reservation to request so route handler can refund if pre-processing validation fails
  req.guestAttemptReserved = true;
  req.guestRemainingUses = reservation.remainingUses;
  next();
}
