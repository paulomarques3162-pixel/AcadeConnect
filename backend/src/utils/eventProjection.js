/**
 * V9.4 — Projection of the event listing per caller profile.
 *
 * WHY THIS EXISTS
 * ---------------
 * `GET /api/events` used to return the *whole* Event row (~1.25 KB/event)
 * including fields the listing UI never reads (description, address, flags,
 * payment min/max, deletedAt, timestamps, full institution/organizer). That
 * payload is paid on every request: JSON.stringify + gzip + ETag + network.
 *
 * The listing is a *different use case* from the detail page, so it gets its
 * own `select`. Compatibility is preserved by keeping every field the frontend
 * actually reads (verified in `frontend/src/components/Cards.jsx`,
 * `frontend/src/pages/Events.jsx`, `frontend/src/pages/Home.jsx` and the admin
 * screens — see RELATORIO_FINAL_AUDITORIA.md §2).
 *
 * The public projection is the minimum contract. Staff (ADMIN/ORGANIZER)
 * screens legitimately need `startTime` (AdminDashboard week grid) and
 * `_count.registrations` (AdminEventos "Inscritos" column), so they get a
 * superset. This keeps the contract correct instead of trimming something an
 * admin screen depends on.
 */

/** Fields rendered by EventCard / Events / Home (public listing). */
export const PUBLIC_EVENT_LIST_SELECT = Object.freeze({
  id: true,
  name: true,
  slug: true,
  shortDescription: true,
  bannerUrl: true,
  startDate: true,
  endDate: true,
  registrationEnd: true,
  status: true,
  location: true,
  category: true,
  _count: { select: { activities: true } },
});

/** Public contract + the two extra fields used by admin list screens. */
export const STAFF_EVENT_LIST_SELECT = Object.freeze({
  ...PUBLIC_EVENT_LIST_SELECT,
  startTime: true,
  _count: { select: { activities: true, registrations: true } },
});

export function eventListSelectFor({ staff = false } = {}) {
  return staff ? STAFF_EVENT_LIST_SELECT : PUBLIC_EVENT_LIST_SELECT;
}
