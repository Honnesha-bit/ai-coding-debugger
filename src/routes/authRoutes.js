import express from 'express';
import { AuthService } from '../services/authService.js';
import { GuestService } from '../services/guestService.js';
import { config } from '../config.js';

export function createAuthRouter(authService = null, guestService = null) {
  const router = express.Router();
  const auth = authService || new AuthService();
  const guest = guestService || new GuestService();

  // Registration endpoint
  router.post('/register', (req, res) => {
    try {
      const { username, email, password } = req.body || {};
      const { user, token } = auth.register({ username, email, password });

      res.cookie('session_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.NODE_ENV === 'production',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.status(201).json({
        success: true,
        user,
        message: 'Account created successfully'
      });
    } catch (err) {
      res.status(400).json({
        error: 'REGISTRATION_FAILED',
        message: err.message
      });
    }
  });

  // Login endpoint
  router.post('/login', (req, res) => {
    try {
      const { username, password } = req.body || {};
      const { user, token } = auth.login({ username, password });

      // Rotate session token to mitigate fixation
      res.cookie('session_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.NODE_ENV === 'production',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        user,
        message: 'Logged in successfully'
      });
    } catch (err) {
      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: err.message
      });
    }
  });

  // Logout endpoint
  router.post('/logout', (req, res) => {
    let token = null;
    if (req.cookies && req.cookies.session_token) {
      token = req.cookies.session_token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7).trim();
    }
    if (token) {
      auth.revokeToken(token);
    }

    res.clearCookie('session_token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      path: '/'
    });
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });

  // Authenticated profile endpoint (strictly scoped to caller)
  const profileHandler = (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'You must be logged in to view your profile.'
      });
    }

    res.json({
      success: true,
      user: req.user
    });
  };

  router.get('/profile', profileHandler);
  router.get('/me', profileHandler);

  // Auth & Guest status endpoint
  router.get('/status', (req, res) => {
    const guestStatus = guest.getUsageStatus(req.guestSessionId);

    if (req.user) {
      return res.json({
        authenticated: true,
        user: req.user,
        guestStatus: {
          ...guestStatus,
          isExhausted: false, // Authenticated users not blocked by guest limit
          remainingUses: Infinity
        }
      });
    }

    res.json({
      authenticated: false,
      user: null,
      guestStatus
    });
  });

  return router;
}
