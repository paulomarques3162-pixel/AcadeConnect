import { ApiError } from '../utils/apiError.js';

/**
 * Validate request data against a Joi schema.
 * Usage: validate({ body: schema }) or validate({ query: schema, params: schema }).
 */
export function validate(schemas) {
  return (req, _res, next) => {
    const checks = {
      body: req.body,
      query: req.query,
      params: req.params,
    };

    for (const [where, schema] of Object.entries(schemas || {})) {
      if (!schema) continue;
      const target = checks[where] ?? {};
      const { error, value } = schema.validate(target, {
        abortEarly: false,
        convert: true,
        stripUnknown: true,
      });
      if (error) {
        const details = error.details.map((d) => ({
          field: d.path.join('.'),
          message: d.message,
        }));
        const msg = details.map((d) => d.message).join('. ');
        throw new ApiError(422, msg, details);
      }
      // assign sanitized values back to the request
      if (where === 'body') req.body = value;
      else if (where === 'query') req.query = value;
      else if (where === 'params') req.params = value;
    }
    next();
  };
}
