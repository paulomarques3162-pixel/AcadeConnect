/**
 * Seed mínimo da Mustangs Atlética Anhanguera.
 *
 * Cria apenas a instituição e o usuário administrador inicial.
 * NÃO cria eventos, atividades, participantes, inscrições, presenças ou
 * certificados fictícios — o banco deve começar limpo, com dados reais.
 *
 * Idempotente: usa upsert, não apaga dados existentes.
 *
 * Variáveis de ambiente (opcionais):
 *   ADMIN_EMAIL / ADMIN_PASSWORD — credenciais do admin inicial.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const INSTITUTION_NAME = process.env.INSTITUTION_NAME || 'Mustangs Atlética Anhanguera';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@mustangsatletica.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@12345';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador';

async function main() {
  // 1. Instituição
  let institution = await prisma.institution.findFirst({ where: { name: INSTITUTION_NAME } });
  if (!institution) {
    institution = await prisma.institution.create({ data: { name: INSTITUTION_NAME } });
  }

  // 2. Usuário administrador
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: 'ADMIN', deletedAt: null },
    create: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      role: 'ADMIN',
      institutionId: institution.id,
      emailVerified: true,
    },
  });

  console.log('Seed concluído ✅');
  console.log(`  Instituição: ${institution.name}`);
  console.log(`  Administrador: ${admin.email}`);
  console.log('  (Nenhum dado demo — o banco começa limpo.)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
