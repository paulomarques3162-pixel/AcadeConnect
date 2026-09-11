import dotenv from 'dotenv';

dotenv.config();

const parseBool = (v, def = false) => {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  apiUrl: process.env.API_URL || 'http://localhost:5000/api',

  // Origin used to build public URLs for uploaded files. Defaults to the
  // backend origin (API_URL without a trailing "/api"), since uploads are
  // served statically at "/uploads". Override for a dedicated CDN/storage host.
  uploadsBaseUrl: process.env.UPLOADS_BASE_URL || null,

  databaseUrl: process.env.DATABASE_URL || 'postgresql://app:apppass@localhost:5432/academica',

  jwtSecret: process.env.JWT_SECRET || 'acadeconnect-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  cookieName: process.env.COOKIE_NAME || 'acadeconnect_token',

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()),

  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 5),

  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 300),
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),

  email: {
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 587),
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM || 'AcadeConnect <no-reply@acadeconnect.local>',
  },
  emailEnabled: parseBool(process.env.EMAIL_ENABLED, false),

  // Fuso de referência dos EVENTOS/ATIVIDADES (horários de parede). O servidor
  // pode estar em UTC; o fim da atividade é calculado neste fuso.
  eventTimezone: process.env.EVENT_TIMEZONE || 'America/Sao_Paulo',

  demoAdminEmail: process.env.DEMO_ADMIN_EMAIL || 'admin@demo.com',
  demoAdminPassword: process.env.DEMO_ADMIN_PASSWORD || 'Admin@12345',
  demoParticipantEmail: process.env.DEMO_PARTICIPANT_EMAIL || 'participante@demo.com',
  demoParticipantPassword: process.env.DEMO_PARTICIPANT_PASSWORD || 'Participante@12345',
};
