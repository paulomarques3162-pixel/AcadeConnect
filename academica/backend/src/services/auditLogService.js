import { prisma } from '../config/prisma.js';

/**
 * Persist an audit log entry for important administrative actions.
 */
export async function createAuditLog({ userId = null, action, resource = null, resourceId = null, ip = null, details = null }) {
  try {
    return await prisma.auditLog.create({
      data: { userId, action, resource, resourceId, ip, details },
    });
  } catch (err) {
    // Audit logging must never break the main flow.
    // eslint-disable-next-line no-console
    console.error('Audit log write failed', err.message);
    return null;
  }
}
