/**
 * Diagnóstico (somente leitura) para os erros 403 em /api/admin/*.
 *
 * Uso:  node scripts/check-user-role.js email@dominio.com
 *
 * Mostra o papel REAL gravado no banco. As rotas /api/admin/* exigem
 * ADMIN ou ORGANIZER; se aqui aparecer PARTICIPANT, o 403 está correto e a
 * conta precisa ser promovida por um administrador (nenhuma proteção deve
 * ser removida do backend).
 */
import { prisma } from '../src/config/prisma.js';

const email = (process.argv[2] || '').toLowerCase().trim();
if (!email) {
  console.error('Informe o e-mail: node scripts/check-user-role.js email@dominio.com');
  process.exit(1);
}

const user = await prisma.user.findUnique({
  where: { email },
  select: { id: true, name: true, email: true, role: true, deletedAt: true, lastLoginAt: true },
});

if (!user) console.log(`Nenhum usuário com o e-mail ${email}.`);
else console.table([user]);

await prisma.$disconnect();
