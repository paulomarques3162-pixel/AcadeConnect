import Joi from 'joi';

export const orderSchemas = {
  create: {
    body: Joi.object({
      items: Joi.array()
        .items(Joi.object({ productId: Joi.string().required(), quantity: Joi.number().integer().min(1).max(999).required() }))
        .min(1)
        .required(),
      couponCode: Joi.string().trim().max(40).allow('', null),
    }),
  },
  status: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({ status: Joi.string().valid('PENDING', 'PAID', 'CANCELLED', 'EXPIRED').required() }),
  },
  idParam: { params: Joi.object({ id: Joi.string().required() }) },
};
