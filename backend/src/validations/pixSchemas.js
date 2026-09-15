import Joi from 'joi';

const keyTypes = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP', 'RANDOM'];

export const pixSchemas = {
  create: {
    body: Joi.object({
      key: Joi.string().trim().min(1).max(120).required(),
      keyType: Joi.string().valid(...keyTypes).default('EVP'),
      receiverName: Joi.string().trim().min(2).max(40).required(),
      city: Joi.string().trim().min(2).max(30).required(),
      description: Joi.string().trim().max(120).allow('', null),
      expiresMinutes: Joi.number().integer().min(1).max(120).default(30),
      active: Joi.boolean().default(true),
    }),
  },
  update: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({
      key: Joi.string().trim().min(1).max(120),
      keyType: Joi.string().valid(...keyTypes),
      receiverName: Joi.string().trim().min(2).max(40),
      city: Joi.string().trim().min(2).max(30),
      description: Joi.string().trim().max(120).allow('', null),
      expiresMinutes: Joi.number().integer().min(1).max(120),
      active: Joi.boolean(),
    }),
  },
  idParam: { params: Joi.object({ id: Joi.string().required() }) },
};
