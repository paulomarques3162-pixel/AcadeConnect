import Joi from 'joi';

export const paymentSchemas = {
  confirm: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({ notes: Joi.string().trim().max(300).allow('', null) }),
  },
  status: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({ status: Joi.string().valid('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED').required() }),
  },
  idParam: { params: Joi.object({ id: Joi.string().required() }) },
};
