const { ZodError } = require('zod');
const config = require('../config');

function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError || err?.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.issues ? err.issues.map((i) => ({ path: i.path, message: i.message })) : undefined,
    });
  }

  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400)) {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }

  const status = Number.isInteger(err?.statusCode)
    ? err.statusCode
    : Number.isInteger(err?.status)
      ? err.status
      : 500;

  if (!config.isProduction && status >= 500) {
    console.error(err);
  }

  return res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message || 'Request failed',
  });
}

module.exports = { notFound, errorHandler };
