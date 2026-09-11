/**
 * Promove/rebaixa uma conta. Operação administrativa explícita, executada
 * manualmente pelo responsável (ex.: no shell do Render).
 *
 * Uso:  node scripts/set-user-role.js email@dominio.com ADMIN
 * Papéis válidos: PARTICIPANT | ORGANIZER | ADMIN
 */
import { prisma } from '../src/config/prisma.js';

const email = (process.argv[2] || '').toLowerCase().trim();
const role = (process.argv[3] || '').toUpperCase().trim();
const VALID = ['PARTICIPANT', 'ORGANIZER', 'ADMIN'];

if (!email || !VALID.includes(role)) {
  console.error('Uso: node scripts/set-user-role.js email@dominio.com ADMIN');
  process.exit(1);
}

const user = await prisma.user.update({
  where: { email },
  data: { role },
  select: { id: true, name: true, email: true, role: true },
});
console.table([user]);
console.log('Faça logout e login novamente para atualizar a sessão no navegador.');

await prisma.$disconnect();
