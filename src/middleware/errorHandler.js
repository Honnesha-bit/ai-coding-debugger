export function errorHandler(err, req, res, next) {
  // If response has already started, delegate to default express handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle payload too large from express.json parser (e.g. limit: '512kb')
  if (err.status === 413 || err.statusCode === 413 || err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload exceeds maximum permitted size (512kb).'
    });
  }

  const statusCode = err.statusCode || (err.status >= 400 && err.status < 600 ? err.status : 500);
  
  // Safe error response without leaking stack traces or internals
  const response = {
    error: err.code || 'INTERNAL_ERROR',
    message: err.message || 'An unexpected error occurred'
  };

  if (err.field) {
    response.field = err.field;
  }

  if (err.details) {
    response.details = err.details;
  }

  res.status(statusCode).json(response);
}
