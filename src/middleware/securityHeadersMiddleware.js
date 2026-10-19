import { config } from '../config.js';

/**
 * Security Headers Middleware:
 * Applies HTTP response security headers recommended by OWASP
 * to prevent clickjacking, MIME sniffing, XSS, and information disclosure.
 */
export function securityHeaders(req, res, next) {
  // Remove Express identification
  res.removeHeader('X-Powered-By');

  // MIME type sniffing prevention
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Clickjacking defense (frame restriction)
  res.setHeader('X-Frame-Options', 'DENY');

  // Cross-site scripting legacy filter disable (modern CSP preferred)
  res.setHeader('X-XSS-Protection', '0');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy (permits self assets, inline styles for editor syntax themes)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'"
  );

  // Strict-Transport-Security in production environments
  if (config.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}
