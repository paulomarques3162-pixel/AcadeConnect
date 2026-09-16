/**
 * V9.4 — Shared pagination guardrails.
 *
 * Before this helper, several list endpoints did `take: Number(req.query.limit)`
 * with no ceiling. A single authenticated caller could request `limit=999999`
 * and force the instance to serialize (and gzip) an unbounded payload — the
 * cheapest available denial-of-service. Every list endpoint now clamps `page`
 * and `limit` to sane, per-endpoint bounds.
 *
 * `skip`/`take` are ready for Prisma; `paginationMeta` builds the response meta.
 */

/** Parse a positive integer, falling back on garbage and clamping to `max`. */
export function toPositiveInt(value, fallback, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/**
 * @param {object} query           req.query (strings)
 * @param {object} [opts]
 * @param {number} [opts.defaultLimit=20]
 * @param {number} [opts.maxLimit=200]
 * @param {number} [opts.maxPage=1_000_000]
 */
export function parsePagination(query = {}, { defaultLimit = 20, maxLimit = 200, maxPage = 1_000_000 } = {}) {
  const page = toPositiveInt(query.page, 1, maxPage);
  const limit = toPositiveInt(query.limit, defaultLimit, maxLimit);
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function paginationMeta({ page, limit, total }) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}
