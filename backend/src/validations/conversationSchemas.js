import Joi from 'joi';

export const conversationSchemas = {
  start: {
    body: Joi.object({
      subject: Joi.string().trim().max(150).allow('', null),
      message: Joi.string().trim().min(1).max(2000).required(),
      assignedToId: Joi.string().allow('', null),
    }),
  },
  adminStart: {
    body: Joi.object({
      userId: Joi.string().required(),
      subject: Joi.string().trim().max(150).allow('', null),
      message: Joi.string().trim().min(1).max(2000).required(),
      assignedToId: Joi.string().allow('', null),
    }),
  },
  message: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({ body: Joi.string().trim().min(1).max(2000).required() }),
  },
  status: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({ status: Joi.string().valid('OPEN', 'RESOLVED').required() }),
  },
  idParam: { params: Joi.object({ id: Joi.string().required() }) },
};
