-- ============================================================================
-- AcadeConnect - Performance indexes (ADDITIVE, safe migration)
--
-- Purpose: high-concurrency performance. These indexes back the filters and
-- ordering used by the hot queries (dashboard, event listings, registrations,
-- attendance/reports, notifications, payments/orders, store, conversations).
--
-- Safety: INDEX ONLY. No DROP, no TRUNCATE, no column/table change, no data
-- loss. Every statement is CREATE INDEX IF NOT EXISTS, so it is idempotent and
-- safe to run against a populated production database.
-- ============================================================================

-- User: admin user listing ordered by creation date
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");

-- Event: public listing (deletedAt + status), admin ordering, upcoming filter
CREATE INDEX IF NOT EXISTS "Event_deletedAt_status_idx" ON "Event"("deletedAt", "status");
CREATE INDEX IF NOT EXISTS "Event_deletedAt_createdAt_idx" ON "Event"("deletedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Event_startDate_idx" ON "Event"("startDate");

-- Activity: schedule ordering per event
CREATE INDEX IF NOT EXISTS "Activity_eventId_date_idx" ON "Activity"("eventId", "date");

-- Registration: capacity counts by event+status, per-day charts, ordering
CREATE INDEX IF NOT EXISTS "Registration_eventId_status_idx" ON "Registration"("eventId", "status");
CREATE INDEX IF NOT EXISTS "Registration_createdAt_idx" ON "Registration"("createdAt");
CREATE INDEX IF NOT EXISTS "Registration_eventId_createdAt_idx" ON "Registration"("eventId", "createdAt");

-- ActivityRegistration: activity roster (confirmed enrollments)
CREATE INDEX IF NOT EXISTS "ActivityRegistration_activityId_status_idx" ON "ActivityRegistration"("activityId", "status");

-- Attendance: event-scoped reports and recent-presence ordering
CREATE INDEX IF NOT EXISTS "Attendance_eventId_idx" ON "Attendance"("eventId");
CREATE INDEX IF NOT EXISTS "Attendance_eventId_recordedAt_idx" ON "Attendance"("eventId", "recordedAt");

-- Certificate: event-scoped listing and per-user history
CREATE INDEX IF NOT EXISTS "Certificate_eventId_idx" ON "Certificate"("eventId");
CREATE INDEX IF NOT EXISTS "Certificate_userId_issueDate_idx" ON "Certificate"("userId", "issueDate");

-- Notification: unread counters and the bell dropdown
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AuditLog: activity feed per user
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");

-- Payment: expiry sweep (PENDING + expiresAt), admin ordering
CREATE INDEX IF NOT EXISTS "Payment_status_expiresAt_idx" ON "Payment"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "Payment_createdAt_idx" ON "Payment"("createdAt");
CREATE INDEX IF NOT EXISTS "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

-- Product: public store listing (active, not deleted) and featured highlight
CREATE INDEX IF NOT EXISTS "Product_status_deletedAt_idx" ON "Product"("status", "deletedAt");
CREATE INDEX IF NOT EXISTS "Product_status_featured_idx" ON "Product"("status", "featured");

-- Coupon: active coupon lookup
CREATE INDEX IF NOT EXISTS "Coupon_active_deletedAt_idx" ON "Coupon"("active", "deletedAt");

-- Order: admin/user listing ordered by creation date
CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- Conversation: inbox ordering
CREATE INDEX IF NOT EXISTS "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");
CREATE INDEX IF NOT EXISTS "Conversation_userId_lastMessageAt_idx" ON "Conversation"("userId", "lastMessageAt");

-- Message: incremental fetch (createdAt) and unread marking (readAt)
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_conversationId_readAt_idx" ON "Message"("conversationId", "readAt");

-- Raffle: public results ordering
CREATE INDEX IF NOT EXISTS "Raffle_createdAt_idx" ON "Raffle"("createdAt");
