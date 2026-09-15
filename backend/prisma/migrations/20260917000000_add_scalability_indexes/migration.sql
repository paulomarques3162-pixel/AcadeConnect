-- ============================================================================
-- AcadeConnect V9.2 - Scalability indexes (ADDITIVE, safe migration)
--
-- Purpose: back the composite filters/orderings used by the hot queries under
-- concurrent load (500 users): admin listings filtered by status and ordered by
-- date, attendance/roster lookups, certificate listing, inbox ordering, store
-- orders and payments.
--
-- Safety: INDEX ONLY.
--   * No DROP, no TRUNCATE, no DELETE, no column/table change.
--   * Every statement uses CREATE INDEX IF NOT EXISTS -> idempotent.
--   * Safe to run with `prisma migrate deploy` against a populated database.
--
-- Existing single-column indexes are intentionally NOT removed: this migration
-- only ever adds. (A composite index also serves its leftmost column, so a few
-- single-column indexes become redundant; removing them is a separate, optional
-- cleanup and is documented in the V9.2 report.)
-- ============================================================================

-- User: admin listing filtered by role, excluding soft-deleted accounts
CREATE INDEX IF NOT EXISTS "User_role_deletedAt_idx" ON "User"("role", "deletedAt");

-- Event: "upcoming/current" listings (status filter + date ordering)
CREATE INDEX IF NOT EXISTS "Event_status_startDate_idx" ON "Event"("status", "startDate");

-- Activity: schedule per event filtered by status
CREATE INDEX IF NOT EXISTS "Activity_eventId_status_idx" ON "Activity"("eventId", "status");

-- Registration: "my active registrations" and admin listing by status+date
CREATE INDEX IF NOT EXISTS "Registration_userId_status_idx" ON "Registration"("userId", "status");
CREATE INDEX IF NOT EXISTS "Registration_status_createdAt_idx" ON "Registration"("status", "createdAt");

-- Attendance: roster/status filters and per-event presence counts
CREATE INDEX IF NOT EXISTS "Attendance_activityId_status_idx" ON "Attendance"("activityId", "status");
CREATE INDEX IF NOT EXISTS "Attendance_eventId_status_idx" ON "Attendance"("eventId", "status");

-- Certificate: admin listing by event+status and dashboard group-by status
CREATE INDEX IF NOT EXISTS "Certificate_eventId_status_idx" ON "Certificate"("eventId", "status");
CREATE INDEX IF NOT EXISTS "Certificate_status_idx" ON "Certificate"("status");

-- Conversation: staff inbox ordered by last message within a status
CREATE INDEX IF NOT EXISTS "Conversation_status_lastMessageAt_idx" ON "Conversation"("status", "lastMessageAt");

-- Order / Payment: admin listings filtered by status and ordered by date
CREATE INDEX IF NOT EXISTS "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
