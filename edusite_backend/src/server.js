require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('./config');
const db = require('./db');
const healthRoute = require('./routes/health');
const authRoute = require('./routes/auth');
const meRoute = require('./routes/me');
const { notFound, errorHandler } = require('./middleware/error-handler');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));

  app.use((req, res, next) => {
    if (!config.requireHttps || !config.isProduction) return next();
    const proto = req.header('x-forwarded-proto');
    if (proto === 'https') return next();
    return res.status(403).json({ error: 'HTTPS required' });
  });

  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      const corsErr = new Error('Origin not allowed by CORS');
      corsErr.statusCode = 403;
      return callback(corsErr);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 86400,
  }));

  app.use(express.json({ limit: '10kb', strict: true }));

  app.use((req, _res, next) => {
    const parseResult = z.string().safeParse(req.header('content-type') || '');
    if (!parseResult.success) {
      const err = new Error('Invalid content-type');
      err.statusCode = 400;
      return next(err);
    }
    return next();
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/health', healthRoute);
  app.use('/api', apiLimiter);
  app.use('/api/v1/auth', authLimiter, authRoute);
  app.use('/api/v1/me', meRoute);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

if (require.main === module) {
  const app = createApp();
  const httpServer = app.listen(config.port, () => {
    console.log(`Secure backend running on port ${config.port}`);
  });

  const shutdown = async (signal) => {
    console.log(`Received ${signal}, shutting down edusite_backend...`);
    httpServer.close(async () => {
      try {
        await db.closePool();
      } catch {}
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref?.();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { createApp };
