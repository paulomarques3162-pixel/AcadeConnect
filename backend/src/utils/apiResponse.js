/**
 * Standardized success response envelope.
 * { success, message, data, meta }
 *
 * `cacheSeconds` (> 0) marks the response as publicly cacheable. This is ONLY
 * for data that is identical for every caller (public events, products, raffle
 * results). It lets the browser/CDN answer repeat requests without touching the
 * origin — the cheapest way to serve hundreds of simultaneous readers. Never
 * pass it on a per-user/private response.
 */
export function apiResponse(res, { status = 200, message = 'OK', data = null, meta = null, cacheSeconds = 0 } = {}) {
  if (Number(cacheSeconds) > 0) {
    const max = Math.floor(Number(cacheSeconds));
    res.setHeader('Cache-Control', `public, max-age=${max}, stale-while-revalidate=${max * 4}`);
  }
  return res.status(status).json({
    success: true,
    message,
    data,
    ...(meta ? { meta } : {}),
  });
}
