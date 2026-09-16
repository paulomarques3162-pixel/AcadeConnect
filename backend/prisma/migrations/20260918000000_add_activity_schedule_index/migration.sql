-- ============================================================================
-- AcadeConnect V9.5 - Activity schedule index (ADDITIVE, safe migration)
--
-- Justification (real query, see activityController.listActivities):
--   GET /api/activities (no event filter, e.g. the admin listing before an
--   event is chosen) orders by ("date" ASC, "startTime" ASC). Without an index
--   Postgres must sort the whole table; the composite index serves the ORDER BY
--   directly.
--
-- Safety: INDEX ONLY.
--   * No DROP, no TRUNCATE, no DELETE, no column/table change.
--   * CREATE INDEX IF NOT EXISTS -> idempotent, safe on a populated database.
-- ============================================================================

CREATE INDEX IF NOT EXISTS "Activity_date_startTime_idx" ON "Activity"("date", "startTime");
