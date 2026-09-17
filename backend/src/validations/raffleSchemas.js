import Joi from 'joi';

export const raffleSchemas = {
  create: {
    body: Joi.object({
      eventId: Joi.string().required(),
      prize: Joi.string().trim().min(2).max(120).required(),
      allowRepeat: Joi.boolean().default(false),
    }),
  },
  update: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({
      prize: Joi.string().trim().min(2).max(120),
      allowRepeat: Joi.boolean(),
    }).min(1),
  },
  weights: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({
      // Mapa { userId: peso }. A validação fina (inteiro, faixa) é feita no
      // service, que também confirma que o participante pertence ao evento.
      weights: Joi.object().pattern(Joi.string(), Joi.number()).required(),
    }),
  },
  status: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({ status: Joi.string().valid('OPEN', 'CLOSED', 'CANCELLED').required() }),
  },
  idParam: { params: Joi.object({ id: Joi.string().required() }) },
};
