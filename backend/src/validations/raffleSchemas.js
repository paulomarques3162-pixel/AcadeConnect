import Joi from 'joi';

export const raffleSchemas = {
  create: {
    body: Joi.object({
      eventId: Joi.string().required(),
      prize: Joi.string().trim().min(2).max(120).required(),
      allowRepeat: Joi.boolean().default(false),
    }),
  },
  status: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({ status: Joi.string().valid('OPEN', 'CLOSED', 'CANCELLED').required() }),
  },
  idParam: { params: Joi.object({ id: Joi.string().required() }) },
};
