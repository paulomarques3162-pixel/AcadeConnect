import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
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
  // Weak ETags let browsers revalidate JSON responses cheaply (304 instead of
  // re-sending the whole payload).
  app.set('etag', 'weak');
  app.disable('x-powered-by');

  // Security headers
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // gzip/deflate JSON + text responses. This cuts transfer size (and therefore
  // perceived latency) for the list/dashboard endpoints that return the most
  // data, with negligible CPU. SSE must NOT be compressed (it would buffer).
  if (env.compressionEnabled) {
    app.use(
      compression({
        threshold: env.compressionThreshold,
        filter: (req, res) => {
          if (req.headers.accept === 'text/event-stream') return false;
          return compression.filter(req, res);
        },
      })
    );
  }

  // CORS
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
      // Let the browser cache the preflight for 10 minutes instead of issuing a
      // new OPTIONS request for every call (halves request count on cross-origin
      // frontend -> backend setups like Vercel -> Render).
      maxAge: 600,
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Rate limiting on the whole API (health + OPTIONS skipped inside the limiter).
  app.use('/api', apiLimiter);

  // Serve uploaded files (avatars, banners, PDFs).
  // Primary route is /uploads; /api/uploads is kept as an alias for
  // compatibility with any previously generated URLs.
  // Uploaded filenames are random hashes and never change, so they can be
  // cached aggressively by the browser/CDN.
  const uploadsDir = path.resolve(env.uploadDir);
  const staticOpts = { maxAge: '30d', immutable: true };
  app.use('/uploads', express.static(uploadsDir, staticOpts));
  app.use('/api/uploads', express.static(uploadsDir, staticOpts));

  // API routes
  app.use('/api', routes);

  // 404 + error handler
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
