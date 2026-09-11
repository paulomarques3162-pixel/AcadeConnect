import Joi from 'joi';

const password = Joi.string().min(8).max(72).required().messages({
  'string.min': 'A senha deve ter pelo menos 8 caracteres.',
  'any.required': 'Informe a senha.',
});

/** Treat an empty string as "not provided" so optional HTML fields can send '' safely. */
const orEmpty = (schema) => schema.empty('').allow(null);


export const authSchemas = {
  register: {
    body: Joi.object({
      name: Joi.string().trim().min(3).max(120).required().messages({ 'any.required': 'Informe seu nome.' }),
      email: Joi.string().email().lowercase().required().messages({ 'string.email': 'E-mail inválido.' }),
      password,
      phone: Joi.string().trim().max(30).allow('', null),
      course: Joi.string().trim().max(120).allow('', null),
      city: Joi.string().trim().max(80).allow('', null),
      state: Joi.string().trim().max(2).allow('', null),
      role: Joi.string().valid('PARTICIPANT', 'ORGANIZER').default('PARTICIPANT'),
    }),
  },
  login: {
    body: Joi.object({
      email: Joi.string().email().lowercase().required(),
      password: Joi.string().required(),
    }),
  },
  forgot: {
    body: Joi.object({ email: Joi.string().email().lowercase().required() }),
  },
  reset: {
    body: Joi.object({ token: Joi.string().required(), password }),
  },
  changePassword: {
    body: Joi.object({ currentPassword: Joi.string().required(), newPassword: password }),
  },
};

export const profileSchemas = {
  update: {
    body: Joi.object({
      name: Joi.string().trim().min(3).max(120).allow('', null),
      phone: Joi.string().trim().max(30).allow('', null),
      course: Joi.string().trim().max(120).allow('', null),
      city: Joi.string().trim().max(80).allow('', null),
      state: Joi.string().trim().max(2).allow('', null),
    }),
  },
};

export const eventSchemas = {
  create: {
    body: Joi.object({
      name: Joi.string().trim().min(3).max(200).required(),
      slug: Joi.string().trim().max(220).allow('', null),
      shortDescription: Joi.string().trim().max(300).allow('', null),
      description: Joi.string().trim().allow('', null),
      startDate: Joi.date().required(),
      endDate: Joi.date().required(),
      startTime: Joi.string().trim().max(10).allow('', null),
      location: Joi.string().trim().max(200).allow('', null),
      address: Joi.string().trim().max(300).allow('', null),
      modality: Joi.string().valid('PRESENCIAL', 'ONLINE', 'HIBRIDO').default('PRESENCIAL'),
      category: Joi.string().trim().max(120).allow('', null),
      capacity: orEmpty(Joi.number().integer().min(0)),
      registrationStart: orEmpty(Joi.date()),
      registrationEnd: orEmpty(Joi.date()),
      status: Joi.string().valid('DRAFT', 'PUBLISHED', 'OPEN', 'ONGOING', 'CLOSED', 'CANCELLED').default('DRAFT'),
      allowRegistration: Joi.boolean().default(true),
      allowCancellation: Joi.boolean().default(true),
      requireActivityRegistration: Joi.boolean().default(false),
      requireAttendance: Joi.boolean().default(true),
      automaticCertificate: Joi.boolean().default(false),
      minimumAttendancePercentage: orEmpty(Joi.number().min(0).max(100)).default(75),
      certificateHours: orEmpty(Joi.number().min(0)).default(8),
      institutionId: Joi.string().allow('', null),
      organizerId: Joi.string().allow('', null),
    }),
  },
  update: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({}).unknown(true),
  },
  idParam: {
    params: Joi.object({ id: Joi.string().required() }),
  },
};

export const activitySchemas = {
  create: {
    body: Joi.object({
      eventId: Joi.string().required(),
      name: Joi.string().trim().min(3).max(200).required(),
      description: Joi.string().trim().allow('', null),
      type: Joi.string().valid('PALESTRA', 'MINICURSO', 'WORKSHOP', 'MESA_REDONDA', 'CURSO', 'OFICINA', 'NETWORKING', 'PRATICA', 'OUTRO').default('OUTRO'),
      date: Joi.date().required(),
      startTime: Joi.string().trim().required(),
      endTime: Joi.string().trim().required(),
      location: Joi.string().trim().max(200).allow('', null),
      capacity: orEmpty(Joi.number().integer().min(0)),
      speakerId: Joi.string().allow('', null),
      status: Joi.string().valid('SCHEDULED', 'OPEN', 'FULL', 'ONGOING', 'FINISHED', 'CANCELLED').default('SCHEDULED'),
      allowsRegistration: Joi.boolean().default(true),
      requiresAttendance: Joi.boolean().default(true),
      generatesCertificate: Joi.boolean().default(true),
    }),
  },
};

export const registrationSchemas = {
  create: {
    params: Joi.object({ eventId: Joi.string().required() }),
    body: Joi.object({ activityIds: Joi.array().items(Joi.string()).default([]) }),
  },
  activity: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({ activityId: Joi.string().required() }),
  },
  idParam: { params: Joi.object({ id: Joi.string().required() }) },
};

export const attendanceSchemas = {
  scan: {
    body: Joi.object({
      qrToken: Joi.string().required().messages({ 'any.required': 'QR Code não fornecido.' }),
      activityId: Joi.string().required(),
    }),
  },
  validate: {
    body: Joi.object({ qrToken: Joi.string().required() }),
  },
  manual: {
    body: Joi.object({
      registrationId: Joi.string().required(),
      activityId: Joi.string().required(),
      present: Joi.boolean().default(true),
    }),
  },
  activityParam: { params: Joi.object({ activityId: Joi.string().required() }) },
};

export const certificateSchemas = {
  issue: {
    body: Joi.object({
      registrationId: Joi.string().required(),
      activityId: Joi.string().allow(null),
      force: Joi.boolean().default(false),
    }),
  },
  codeParam: { params: Joi.object({ code: Joi.string().required() }) },
  idParam: { params: Joi.object({ id: Joi.string().required() }) },
};

export const adminUserSchemas = {
  create: {
    body: Joi.object({
      name: Joi.string().trim().min(3).max(120).required(),
      email: Joi.string().email().lowercase().required(),
      password,
      role: Joi.string().valid('PARTICIPANT', 'ORGANIZER', 'ADMIN').default('PARTICIPANT'),
    }),
  },
  update: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({
      name: Joi.string().trim().min(3).max(120),
      email: Joi.string().email().lowercase(),
      role: Joi.string().valid('PARTICIPANT', 'ORGANIZER', 'ADMIN'),
      course: Joi.string().trim().max(120).allow('', null),
      phone: Joi.string().trim().max(30).allow('', null),
      password: Joi.string().min(8).max(72).allow('', null),
    }),
  },
  idParam: { params: Joi.object({ id: Joi.string().required() }) },
};

export const institutionSchemas = {
  create: {
    body: Joi.object({
      name: Joi.string().trim().min(2).max(200).required(),
      cnpj: Joi.string().trim().max(20).allow('', null),
      description: Joi.string().trim().max(500).allow('', null),
    }),
  },
  idParam: { params: Joi.object({ id: Joi.string().required() }) },
};

export const exportSchemas = {
  body: Joi.object({
    format: Joi.string().valid('csv', 'xlsx').default('csv'),
    eventId: Joi.string().allow(null),
    activityId: Joi.string().allow(null),
    status: Joi.string().allow(null),
    search: Joi.string().trim().allow(null),
    from: Joi.date().allow(null),
    to: Joi.date().allow(null),
  }),
};
