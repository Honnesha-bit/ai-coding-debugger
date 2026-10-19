import { AuthService } from '../services/authService.js';

const authService = new AuthService();

export function authenticate(req, res, next) {
  let token = null;

  // 1. Check cookies
  if (req.cookies && req.cookies.session_token) {
    token = req.cookies.session_token;
  }
  // 2. Check Authorization header
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7).trim();
  }

  if (token) {
    const user = authService.getUserFromToken(token);
    if (user) {
      req.user = user;
    } else {
      req.user = null;
    }
  } else {
    req.user = null;
  }

  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'You must be logged in to perform this action.',
      code: 'UNAUTHORIZED'
    });
  }
  next();
}
