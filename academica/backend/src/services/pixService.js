import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { createAuditLog } from './auditLogService.js';
import { buildPixPayload } from '../utils/pix.js';

const KEY_TYPES = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP', 'RANDOM'];

function assertKeyType(keyType) {
  if (keyType && !KEY_TYPES.includes(String(keyType).toUpperCase())) {
    throw new ApiError(422, 'Tipo de chave PIX inválido.');
  }
}

/** Chave PIX ativa (há no máximo uma — garantido no service). */
export async function getActivePixConfig() {
  return prisma.pixConfig.findFirst({ where: { active: true }, orderBy: { updatedAt: 'desc' } });
}

export async function listPixConfigs() {
  return prisma.pixConfig.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] });
}

export async function createPixConfig(data, operatorId) {
  assertKeyType(data.keyType);
  const config = await prisma.$transaction(async (tx) => {
    if (data.active !== false) {
      await tx.pixConfig.updateMany({ where: { active: true }, data: { active: false } });
    }
    return tx.pixConfig.create({
      data: {
        key: String(data.key).trim(),
        keyType: String(data.keyType || 'EVP').toUpperCase(),
        receiverName: String(data.receiverName).trim(),
        city: String(data.city).trim(),
        description: data.description ? String(data.description).trim() : null,
        active: data.active !== false,
      },
    });
  });
  await createAuditLog({ userId: operatorId, action: 'PIX_CONFIG_CREATED', resource: 'PixConfig', resourceId: config.id, details: { keyType: config.keyType } });
  return config;
}

export async function updatePixConfig(id, data, operatorId) {
  const existing = await prisma.pixConfig.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Configuração PIX não encontrada.');
  assertKeyType(data.keyType ?? existing.keyType);

  const config = await prisma.$transaction(async (tx) => {
    if (data.active === true) {
      await tx.pixConfig.updateMany({ where: { active: true, id: { not: id } }, data: { active: false } });
    }
    return tx.pixConfig.update({
      where: { id },
      data: {
        ...(data.key !== undefined ? { key: String(data.key).trim() } : {}),
        ...(data.keyType !== undefined ? { keyType: String(data.keyType).toUpperCase() } : {}),
        ...(data.receiverName !== undefined ? { receiverName: String(data.receiverName).trim() } : {}),
        ...(data.city !== undefined ? { city: String(data.city).trim() } : {}),
        ...(data.description !== undefined ? { description: data.description ? String(data.description).trim() : null } : {}),
        ...(data.active !== undefined ? { active: !!data.active } : {}),
      },
    });
  });
  await createAuditLog({ userId: operatorId, action: 'PIX_CONFIG_UPDATED', resource: 'PixConfig', resourceId: id });
  return config;
}

/**
 * Remove a configuração. Se já houver pagamentos vinculados, NÃO apaga o
 * histórico: apenas desativa.
 */
export async function deletePixConfig(id, operatorId) {
  const existing = await prisma.pixConfig.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Configuração PIX não encontrada.');
  const refs = await prisma.payment.count({ where: { pixConfigId: id } });
  if (refs > 0) {
    const config = await prisma.pixConfig.update({ where: { id }, data: { active: false } });
    await createAuditLog({ userId: operatorId, action: 'PIX_CONFIG_DEACTIVATED', resource: 'PixConfig', resourceId: id });
    return { deactivated: true, config };
  }
  await prisma.pixConfig.delete({ where: { id } });
  await createAuditLog({ userId: operatorId, action: 'PIX_CONFIG_DELETED', resource: 'PixConfig', resourceId: id });
  return { deleted: true };
}

/** Monta o payload PIX usando a configuração informada. */
export function buildPayloadWith(config, { amountCents, txid, description }) {
  return buildPixPayload({
    key: config.key,
    receiverName: config.receiverName,
    city: config.city,
    amountCents,
    txid,
    description: description || config.description || undefined,
  });
}
