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
      // Evento pago (valores em centavos)
      isPaid: Joi.boolean().default(false),
      priceCents: orEmpty(Joi.number().integer().min(0)),
      minPriceCents: orEmpty(Joi.number().integer().min(0)),
      maxPriceCents: orEmpty(Joi.number().integer().min(0)),
      institutionId: Joi.string().allow('', null),
      organizerId: Joi.string().allow('', null),
    }),
  },
  // Query contract for the public listing. `stripUnknown` drops junk params and
  // the caps stop an unbounded `limit`. The server still clamps defensively.
  listQuery: {
    query: Joi.object({
      page: Joi.number().integer().min(1).max(1000000).default(1),
      limit: Joi.number().integer().min(1).max(200).default(12),
      search: Joi.string().trim().max(120).allow('').default(''),
      category: Joi.string().trim().max(120).allow(''),
      modality: Joi.string().valid('PRESENCIAL', 'ONLINE', 'HIBRIDO').allow(''),
      status: Joi.string()
        .valid('DRAFT', 'PUBLISHED', 'OPEN', 'ONGOING', 'CLOSED', 'CANCELLED')
        .allow(''),
      location: Joi.string().trim().max(120).allow(''),
      date: Joi.string().valid('upcoming', 'past').allow(''),
      sort: Joi.string().valid('recent', 'closest', 'popular').default('recent'),
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

const ACTIVITY_TYPES = ['PALESTRA', 'MINICURSO', 'WORKSHOP', 'MESA_REDONDA', 'CURSO', 'OFICINA', 'NETWORKING', 'PRATICA', 'OUTRO'];
const ACTIVITY_STATUSES = ['SCHEDULED', 'OPEN', 'FULL', 'ONGOING', 'FINISHED', 'CANCELLED'];

export const activitySchemas = {
  create: {
    body: Joi.object({
      eventId: Joi.string().required(),
      name: Joi.string().trim().min(3).max(200).required(),
      description: Joi.string().trim().allow('', null),
      type: Joi.string().valid(...ACTIVITY_TYPES).default('OUTRO'),
      date: Joi.date().required(),
      startTime: Joi.string().trim().required(),
      endTime: Joi.string().trim().required(),
      location: Joi.string().trim().max(200).allow('', null),
      capacity: orEmpty(Joi.number().integer().min(0)),
      speakerId: Joi.string().allow('', null),
      status: Joi.string().valid(...ACTIVITY_STATUSES).default('SCHEDULED'),
      allowsRegistration: Joi.boolean().default(true),
      requiresAttendance: Joi.boolean().default(true),
      generatesCertificate: Joi.boolean().default(true),
    }),
  },
  // O frontend reenvia o objeto completo do GET (inclusive relações como
  // `event`/`speaker`/`_count`). Validamos só os campos escalares e deixamos os
  // demais passarem — o controller faz o whitelist final para o Prisma.
  update: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({
      name: Joi.string().trim().min(3).max(200),
      slug: Joi.string().trim().max(220).allow('', null),
      description: Joi.string().trim().allow('', null),
      type: Joi.string().valid(...ACTIVITY_TYPES),
      date: Joi.date(),
      startTime: Joi.string().trim(),
      endTime: Joi.string().trim(),
      location: Joi.string().trim().max(200).allow('', null),
      capacity: orEmpty(Joi.number().integer().min(0)),
      speakerId: Joi.string().allow('', null),
      status: Joi.string().valid(...ACTIVITY_STATUSES),
      allowsRegistration: Joi.boolean(),
      requiresAttendance: Joi.boolean(),
      generatesCertificate: Joi.boolean(),
    }).unknown(true),
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
  qr: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({ action: Joi.string().valid('regenerate', 'invalidate', 'reactivate').required() }),
  },
  adminUpdate: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({
      status: Joi.string().valid('CONFIRMED', 'CANCELLED', 'PENDING'),
      activityIds: Joi.array().items(Joi.string()),
    }),
  },
};

export const attendanceSchemas = {
  scan: {
    // Accepts either the opaque QR token (camera) or the human registration
    // code (manual entry: EVT-2026-000123). Backend normalization is final.
    body: Joi.object({
      qrToken: Joi.string().trim().max(200).allow('', null),
      code: Joi.string().trim().max(120).allow('', null),
      activityId: Joi.string().required().messages({
        'any.required': 'Atividade não informada.',
        'string.empty': 'Atividade não informada.',
      }),
    })
      .or('qrToken', 'code')
      .messages({ 'object.missing': 'QR Code não recebido.' }),
  },
  validate: {
    body: Joi.object({
      qrToken: Joi.string().trim().max(200).allow('', null),
      code: Joi.string().trim().max(120).allow('', null),
    })
      .or('qrToken', 'code')
      .messages({ 'object.missing': 'QR Code não recebido.' }),
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
  correct: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({
      participantName: Joi.string().trim().min(2).max(150).allow('', null),
      eventName: Joi.string().trim().min(2).max(200).allow('', null),
      hours: Joi.number().min(0).allow(null, ''),
      reason: Joi.string().trim().max(300).allow('', null),
    }),
  },
  cancel: {
    params: Joi.object({ id: Joi.string().required() }),
    body: Joi.object({ reason: Joi.string().trim().max(300).allow('', null) }),
  },
  bulkCancelPresent: {
    params: Joi.object({ eventId: Joi.string().required() }),
    body: Joi.object({ reason: Joi.string().trim().max(300).allow('', null) }),
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

const contactText = Joi.string().trim().max(300).allow('', null);

export const contactSchemas = {
  update: {
    body: Joi.object({
      email: Joi.string().trim().email().max(200).allow('', null),
      phone: contactText,
      whatsapp: contactText,
      address: contactText,
      instagram: contactText,
      facebook: contactText,
      youtube: contactText,
      hours: contactText,
    }).min(1),
  },
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

/**
 * Administrative communication sent to every active user. `requestId` is an
 * optional client-generated idempotency key: replaying the same request within
 * a minute will not create a second notification for each user.
 */
export const broadcastSchemas = {
  body: Joi.object({
    title: Joi.string().trim().min(3).max(120).required(),
    message: Joi.string().trim().min(3).max(1000).required(),
    link: Joi.string().trim().max(300).allow('', null),
    requestId: Joi.string().trim().max(100).allow('', null),
  }),
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
