import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { hashPassword, verifyPassword } from '../utils/bcryptPool.js';
import { ApiError } from '../utils/apiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signToken } from '../utils/jwt.js';
import { createAuditLog } from '../services/auditLogService.js';
import { createNotification } from '../services/notificationService.js';
import { sendEmail, emailTemplates } from '../services/emailService.js';
import { publicUrl } from '../config/multer.js';

const publicUserSelect = {
  id: true, name: true, email: true, role: true, phone: true,
  course: true, city: true, state: true, avatarUrl: true,
  institutionId: true, emailVerified: true, createdAt: true,
};

function setAuthCookie(res, token) {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, course, city, state, role } = req.body;

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new ApiError(409, 'Já existe uma conta com este e-mail.');

  const passwordHash = await hashPassword(password);
  // Segurança: o auto-cadastro NUNCA define papel privilegiado. Antes, enviar
  // { role: 'ORGANIZER' } no corpo da requisição criava uma conta com acesso ao
  // painel administrativo (escalação de privilégio). ADMIN/ORGANIZER só podem
  // ser atribuídos por um ADMIN em /api/admin/users.
  void role;
  const finalRole = 'PARTICIPANT';

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      role: finalRole,
      phone: phone || null,
      course: course || null,
      city: city || null,
      state: state || null,
    },
    select: publicUserSelect,
  });

  await createNotification({
    userId: user.id,
    type: 'SYSTEM',
    title: 'Bem-vindo à Mustangs Atlética',
    message: 'Sua conta foi criada com sucesso. Explore os eventos disponíveis!',
    link: '/eventos',
  });
  if (env.emailEnabled) {
    const tpl = emailTemplates.welcome(user.name, `${env.appUrl}/login`);
    await sendEmail({ to: user.email, ...tpl });
  }

  const token = signToken({ sub: user.id });
  setAuthCookie(res, token);
  await createAuditLog({ userId: user.id, action: 'USER_REGISTERED', resource: 'User', resourceId: user.id });

  // O avatar é gravado como nome de arquivo; devolvemos a URL pública completa
  // para o frontend não montar um caminho relativo quebrado.
  user.avatarUrl = publicUrl(user.avatarUrl);
  return apiResponse(res, { status: 201, message: 'Conta criada com sucesso.', data: { token, user } });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email).toLowerCase().trim();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  // Always run a comparison even when the user does not exist, so response time
  // does not reveal whether an email is registered (user enumeration timing).
  const storedHash = user?.passwordHash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const valid = await verifyPassword(password, storedHash);
  if (!user || user.deletedAt || !valid) throw new ApiError(401, 'Credenciais inválidas.');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = signToken({ sub: user.id });
  setAuthCookie(res, token);
  await createAuditLog({ userId: user.id, action: 'USER_LOGIN', resource: 'User', resourceId: user.id, ip: req.ip });

  return apiResponse(res, {
    status: 200,
    message: 'Login realizado com sucesso.',
    data: {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: publicUrl(user.avatarUrl) },
    },
  });
});

export const logout = asyncHandler(async (req, res) => {
  res.clearCookie(env.cookieName);
  if (req.user) {
    await createAuditLog({ userId: req.user.id, action: 'USER_LOGOUT', resource: 'User', resourceId: req.user.id });
  }
  return apiResponse(res, { message: 'Logout realizado com sucesso.' });
});

export const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: publicUserSelect });
  if (user?.avatarUrl) user.avatarUrl = publicUrl(user.avatarUrl);
  return apiResponse(res, { message: 'Dados do usuário.', data: { user } });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  if (!user) {
    // Do not reveal whether the email exists.
    return apiResponse(res, { message: 'Se o e-mail existir, enviaremos um link de recuperação.' });
  }
  const token = signToken({ sub: user.id, purpose: 'reset', type: 'password_reset' });
  // A rota do formulário de nova senha é /recuperar-senha/token (App.jsx).
  // O link antigo (/recuperar-senha?token=...) abria a tela de "esqueci a senha".
  const resetUrl = `${env.appUrl}/recuperar-senha/token?token=${token}`;
  if (env.emailEnabled) {
    const tpl = emailTemplates.resetPassword(user.name, resetUrl);
    await sendEmail({ to: user.email, ...tpl });
  }
  // In dev, also return the token so the flow can be tested without SMTP.
  const data = env.emailEnabled ? { } : { resetUrl, devToken: token };
  return apiResponse(res, { message: 'Se o e-mail existir, enviaremos um link de recuperação.', data });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  let payload;
  try {
    const { verifyToken } = await import('../utils/jwt.js');
    payload = verifyToken(token);
  } catch {
    throw new ApiError(400, 'Link de recuperação inválido ou expirado.');
  }
  if (payload.type !== 'password_reset') throw new ApiError(400, 'Link de recuperação inválido.');

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: payload.sub }, data: { passwordHash } });
  await createAuditLog({ userId: payload.sub, action: 'PASSWORD_RESET', resource: 'User', resourceId: payload.sub });
  return apiResponse(res, { message: 'Senha redefinida com sucesso. Faça login.' });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new ApiError(400, 'Senha atual incorreta.');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  return apiResponse(res, { message: 'Senha alterada com sucesso.' });
});
