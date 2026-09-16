import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUrl } from '../config/multer.js';
import { createAuditLog } from '../services/auditLogService.js';
import { createNotification } from '../services/notificationService.js';
import { invalidateUserCache } from '../middlewares/auth.js';

const select = {
  id: true, name: true, email: true, role: true, phone: true, course: true,
  city: true, state: true, avatarUrl: true, institutionId: true, emailVerified: true,
};

export const getProfile = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select });
  if (user?.avatarUrl) user.avatarUrl = publicUrl(user.avatarUrl);
  return apiResponse(res, { message: 'Perfil.', data: { user } });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, course, city, state } = req.body;
  const avatarFile = req.file?.filename || null;

  const data = {};
  if (name !== undefined) data.name = name;
  if (phone !== undefined) data.phone = phone;
  if (course !== undefined) data.course = course;
  if (city !== undefined) data.city = city;
  if (state !== undefined) data.state = state;
  if (avatarFile) data.avatarUrl = avatarFile;

  const user = await prisma.user.update({ where: { id: req.user.id }, data, select });
  // /auth/me now serves the cached authenticated user, so a profile change must
  // drop that cache entry to be visible on the next request.
  invalidateUserCache(req.user.id);
  if (user.avatarUrl) user.avatarUrl = publicUrl(user.avatarUrl);

  await createAuditLog({ userId: req.user.id, action: 'PROFILE_UPDATED', resource: 'User', resourceId: req.user.id });
  return apiResponse(res, { message: 'Perfil atualizado com sucesso.', data: { user } });
});

/**
 * LGPD: request full account deletion (soft-delete by default, hard-delete anonymization).
 * We soft-delete (mark deletedAt) so relational history remains intact for the institution;
 * sensitive personal fields are anonymized.
 */
export const requestAccountDeletion = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const anonymizedEmail = `deleted-${userId.slice(-8)}@removido.local`;
  await prisma.user.update({
    where: { id: userId },
    data: {
      email: anonymizedEmail,
      name: 'Usuário removido',
      phone: null,
      course: null,
      city: null,
      state: null,
      avatarUrl: null,
      deletedAt: new Date(),
    },
  });
  invalidateUserCache(userId);

  await createAuditLog({ userId, action: 'ACCOUNT_DELETED', resource: 'User', resourceId: userId });
  return apiResponse(res, { message: 'Sua conta foi excluída. Obrigado por participar.' });
});
