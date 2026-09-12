/**
 * Standardized success response envelope.
 * { success, message, data, meta }
 */
export function apiResponse(res, { status = 200, message = 'OK', data = null, meta = null } = {}) {
  return res.status(status).json({
    success: true,
    message,
    data,
    ...(meta ? { meta } : {}),
  });
}
