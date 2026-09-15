import Joi from 'joi';

export const couponSchemas = {
  create: {
    body: Joi.object({
      code: Joi.string().trim().min(3).max(40).required(),
      type: Joi.string().valid('PERCENT', 'FIXED').required(),
      value: Joi.number().integer().min(1).required(),
      validFrom: Joi.date().allow(null, ''),
      validUntil: Joi.date().allow(null, ''),
      maxUses: Joi.number().integer().min(1).allow(null, ''),
      minOrderValueCents: Joi.number().integer().min(0).allow(null, ''),
      active: Joi.boolean().default(true),
    }),
  },
  update: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({
      code: Joi.string().trim().min(3).max(40),
      type: Joi.string().valid('PERCENT', 'FIXED'),
      value: Joi.number().integer().min(1),
      validFrom: Joi.date().allow(null, ''),
      validUntil: Joi.date().allow(null, ''),
      maxUses: Joi.number().integer().min(1).allow(null, ''),
      minOrderValueCents: Joi.number().integer().min(0).allow(null, ''),
      active: Joi.boolean(),
    }),
  },
  validate: {
    body: Joi.object({
      code: Joi.string().trim().min(1).max(40).required(),
      subtotalCents: Joi.number().integer().min(0).required(),
    }),
  },
  idParam: { params: Joi.object({ id: Joi.string().required() }) },
};
