import Joi from 'joi';

export const productSchemas = {
  create: {
    body: Joi.object({
      name: Joi.string().trim().min(2).max(150).required(),
      description: Joi.string().trim().max(1000).allow('', null),
      priceCents: Joi.number().integer().min(0).required(),
      status: Joi.string().valid('ACTIVE', 'INACTIVE').default('ACTIVE'),
      featured: Joi.boolean().default(false),
      stock: Joi.number().integer().min(0).allow(null, ''),
    }),
  },
  update: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({
      name: Joi.string().trim().min(2).max(150),
      description: Joi.string().trim().max(1000).allow('', null),
      priceCents: Joi.number().integer().min(0),
      status: Joi.string().valid('ACTIVE', 'INACTIVE'),
      featured: Joi.boolean(),
      stock: Joi.number().integer().min(0).allow(null, ''),
    }),
  },
  idParam: { params: Joi.object({ id: Joi.string().required() }) },
};
