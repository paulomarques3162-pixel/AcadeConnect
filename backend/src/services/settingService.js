import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { cacheWrap, invalidate } from '../utils/cache.js';
import { createAuditLog } from './auditLogService.js';
import { env } from '../config/env.js';

/**
 * Configurações da plataforma em estilo key/value (modelo Setting).
 * Atualmente usado pelas informações de contato — editáveis pelo
 * administrador sem alterar código.
 *
 * Leitura pública com cache curto + single-flight (evita consultar o banco a
 * cada carregamento de página); a escrita invalida o cache imediatamente.
 */
const CONTACT_KEY = 'contact';
const CACHE_KEY = 'settings:contact';

// Valores padrão (usados quando o administrador ainda não configurou nada).
export const DEFAULT_CONTACT = {
  email: 'contato@mustangsatletica.com',
  phone: '',
  whatsapp: '',
  address: '',
  instagram: '',
  facebook: '',
  youtube: '',
  hours: '',
};

const TEXT_FIELDS = Object.keys(DEFAULT_CONTACT);

/** Normaliza o payload: somente campos conhecidos, texto aparado e limitado. */
function normalizeContact(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  for (const field of TEXT_FIELDS) {
    if (source[field] === undefined) continue;
    const value = source[field];
    out[field] = value === null ? '' : String(value).trim().slice(0, 300);
  }
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) {
    throw new ApiError(422, 'E-mail de contato inválido.');
  }
  return out;
}

function mergeWithDefaults(value) {
  const base = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {};
  for (const field of TEXT_FIELDS) out[field] = base[field] != null ? String(base[field]) : DEFAULT_CONTACT[field];
  return out;
}

/** Leitura pública das informações de contato (cacheada). */
export async function getContactSettings() {
  return cacheWrap(CACHE_KEY, env.publicCacheTtlMs, async () => {
    const row = await prisma.setting.findUnique({ where: { key: CONTACT_KEY } });
    return mergeWithDefaults(row?.value);
  });
}

/** Atualização exclusivamente administrativa. */
export async function updateContactSettings(input, operatorId) {
  const clean = normalizeContact(input);
  const current = await prisma.setting.findUnique({ where: { key: CONTACT_KEY } });
  const value = { ...mergeWithDefaults(current?.value), ...clean };

  await prisma.setting.upsert({
    where: { key: CONTACT_KEY },
    create: { key: CONTACT_KEY, value, updatedById: operatorId },
    update: { value, updatedById: operatorId },
  });

  invalidate(CACHE_KEY);
  await createAuditLog({
    userId: operatorId,
    action: 'CONTACT_SETTINGS_UPDATED',
    resource: 'Setting',
    resourceId: CONTACT_KEY,
    details: { fields: Object.keys(clean) },
  });
  return value;
}
