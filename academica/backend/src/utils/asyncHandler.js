/**
 * Wraps an async route handler so thrown errors propagate to the error middleware.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
