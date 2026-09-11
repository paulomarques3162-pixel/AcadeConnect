import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { env } from './config/env.js';
import { apiLimiter } from './middlewares/rateLimiter.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  // Security headers
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // CORS
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Rate limiting on the whole API
  app.use('/api', apiLimiter);

  // Serve uploaded files (avatars, banners, PDFs).
  // Primary route is /uploads; /api/uploads is kept as an alias for
  // compatibility with any previously generated URLs.
  const uploadsDir = path.resolve(env.uploadDir);
  app.use('/uploads', express.static(uploadsDir));
  app.use('/api/uploads', express.static(uploadsDir));

  // API routes
  app.use('/api', routes);

  // 404 + error handler
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
