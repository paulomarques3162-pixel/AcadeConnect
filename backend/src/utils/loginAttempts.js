import crypto from 'node:crypto';

/**
 * V9.5 — Failed-login guard (brute-force protection that never locks out a
 * correct password).
 *
 * WHY THIS REPLACES `authLimiter` ON /auth/login
 * ----------------------------------------------
 * `express-rate-limit` counts a request when it ENTERS the route. Once the
 * (IP + email) counter reaches `max`, the limiter answers 429 *before* the
 * handler runs — so even a subsequent CORRECT password is rejected until the
 * window expires. Production showed exactly that: `RateLimit-Limit: 10`,
 * `RateLimit-Remaining: 0`, `Retry-After: 444`. A user who fat-fingered the
 * password a few times was locked out of their own account.
 *
 * WHAT THIS DOES
 * --------------
 * The failure counter is applied AFTER the password is verified, so:
 *   - a VALID credential always authenticates (and clears the counter);
 *   - only FAILED attempts consume the budget;
 *   - after `max` failures the (IP + email) identity is locked and further
 *     FAILED attempts get 429 + `Retry-After`.
 *
 * The coarse per-IP `authPeakLimiter` (now counting only failures) remains the
 * flood ceiling, so brute force is still rate-limited even across many emails.
 *
 * Process-local, like the rest of the project's single-instance cache. Entries
 * are swept and the map is bounded so it cannot grow without limit.
 */

const WINDOW_MS = Math.max(60_000, Number(process.env.AUTH_FAILURE_WINDOW_MS || 15 * 60 * 1000));
const MAX_FAILURES = Math.max(1, Number(process.env.AUTH_RATE_LIMIT_MAX || 10));
const MAX_KEYS = Math.max(100, Number(process.env.AUTH_FAILURE_MAX_KEYS || 20_000));

/** key -> { count, firstAt, blockedUntil } */
const attempts = new Map();

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (entry.blockedUntil <= now && now - entry.firstAt >= WINDOW_MS) attempts.delete(key);
  }
}, 60_000);
if (sweep.unref) sweep.unref();

const sha16 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);

/** Stable identity for the failure budget: client IP + a hash of the email. */
export function loginIdentityKey(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return `${req.ip}|${email ? sha16(email) : 'anon'}`;
}

/** Remaining lock time in seconds, or 0 when the identity is not locked. */
export function loginLockRemaining(key) {
  const entry = attempts.get(key);
  if (!entry) return 0;
  const now = Date.now();
  if (entry.blockedUntil > now) return Math.ceil((entry.blockedUntil - now) / 1000);
  if (now - entry.firstAt >= WINDOW_MS) attempts.delete(key);
  return 0;
}

/**
 * Record a FAILED attempt. Returns `{ blocked, retryAfter }` where `retryAfter`
 * is the seconds until the lock lifts (0 while still under the threshold).
 */
export function noteLoginFailure(key) {
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || (entry.blockedUntil <= now && now - entry.firstAt >= WINDOW_MS)) {
    // Enforce the memory bound by dropping the oldest inserted key.
    if (!entry && attempts.size >= MAX_KEYS) {
      const oldest = attempts.keys().next().value;
      if (oldest !== undefined) attempts.delete(oldest);
    }
    entry = { count: 0, firstAt: now, blockedUntil: 0 };
    attempts.set(key, entry);
  }

  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.blockedUntil = now + WINDOW_MS;
    return { blocked: true, retryAfter: Math.ceil(WINDOW_MS / 1000), failures: entry.count };
  }
  return { blocked: false, retryAfter: 0, failures: entry.count };
}

/** A successful login wipes the identity's failure history. */
export function clearLoginFailures(key) {
  attempts.delete(key);
}

/** Snapshot for the protected /metrics endpoint. */
export function loginAttemptStats() {
  const now = Date.now();
  let locked = 0;
  for (const entry of attempts.values()) if (entry.blockedUntil > now) locked += 1;
  return {
    tracked: attempts.size,
    locked,
    maxFailures: MAX_FAILURES,
    windowMs: WINDOW_MS,
  };
}
