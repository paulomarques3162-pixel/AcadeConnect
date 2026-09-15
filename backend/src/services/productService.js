import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { publicUrl } from '../config/multer.js';
import { createAuditLog } from './auditLogService.js';

function enrich(p) {
  if (p?.imageUrl) p.imageUrl = publicUrl(p.imageUrl);
  return p;
}

/** Lista pública (loja) — apenas ativos. */
export async function listPublicProducts({ search } = {}) {
  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    },
    orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
  });
  return products.map(enrich);
}

/** Lista administrativa — inclui inativos, exclui removidos. */
export async function listAdminProducts({ search, status } = {}) {
  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  return products.map(enrich);
}

export async function getProduct(id) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || product.deletedAt) throw new ApiError(404, 'Produto não encontrado.');
  return enrich(product);
}

export async function createProduct(data, operatorId) {
  const product = await prisma.product.create({
    data: {
      name: String(data.name).trim(),
      description: data.description ? String(data.description).trim() : null,
      priceCents: Number(data.priceCents),
      imageUrl: data.imageUrl || null,
      status: data.status || 'ACTIVE',
      featured: data.featured === true || data.featured === 'true',
      stock: data.stock === undefined || data.stock === null || data.stock === '' ? null : Number(data.stock),
    },
  });
  await createAuditLog({ userId: operatorId, action: 'PRODUCT_CREATED', resource: 'Product', resourceId: product.id, details: { priceCents: product.priceCents } });
  return enrich(product);
}

export async function updateProduct(id, data, operatorId, file) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new ApiError(404, 'Produto não encontrado.');
  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: String(data.name).trim() } : {}),
      ...(data.description !== undefined ? { description: data.description ? String(data.description).trim() : null } : {}),
      ...(data.priceCents !== undefined ? { priceCents: Number(data.priceCents) } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.featured !== undefined ? { featured: !!(data.featured === true || data.featured === 'true') } : {}),
      ...(data.stock !== undefined ? { stock: data.stock === null || data.stock === '' ? null : Number(data.stock) } : {}),
      ...(file ? { imageUrl: file.filename } : {}),
    },
  });
  await createAuditLog({ userId: operatorId, action: 'PRODUCT_UPDATED', resource: 'Product', resourceId: id, details: { priceCents: product.priceCents } });
  return enrich(product);
}

/** Remoção lógica (preserva histórico de pedidos). */
export async function deleteProduct(id, operatorId) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new ApiError(404, 'Produto não encontrado.');
  await prisma.product.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
  await createAuditLog({ userId: operatorId, action: 'PRODUCT_REMOVED', resource: 'Product', resourceId: id });
  return { removed: true };
}
