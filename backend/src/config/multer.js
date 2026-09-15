import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { env } from './env.js';

// Local disk storage for uploaded images (banners, avatars, speaker photos).
// Swap with S3/Cloudinary storage in production.
const uploadsRoot = path.resolve(env.uploadDir);
fs.mkdirSync(uploadsRoot, { recursive: true });

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadsRoot);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não permitido. Envie uma imagem (jpg, png, webp, gif).'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
});

export function publicUrl(filename) {
  if (!filename) return null;
  // Idempotent: values already stored as absolute URLs are returned untouched.
  // This matters for cached payloads, where enrich() runs again on values that
  // were already enriched (otherwise the origin would be duplicated).
  if (/^https?:\/\//i.test(filename)) return filename;
  // apiUrl ends with "/api", but files are served statically at "/uploads".
  // Derive the origin from API_URL (or UPLOADS_BASE_URL) and append /uploads.
  let origin = env.uploadsBaseUrl;
  if (!origin) {
    origin = env.apiUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
  }
  return `${origin}/uploads/${filename}`;
}
