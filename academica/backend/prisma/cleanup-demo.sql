-- =====================================================================
-- LIMPEZA DOS DADOS DEMO — Mustangs Atlética Anhanguera
-- Remova eventos, atividades, palestrantes, participantes, inscrições,
-- presenças, certificados, notificações e logs fictícios.
-- MANTERÁ SOMENTE: a Institution e o usuário ADMIN.
-- (O usuário ORGANIZER também é removido — nenhum usuário fictício fica.)
--
-- Ordem de exclusão respeita as chaves estrangeiras (filhos antes dos pais).
-- NÃO recria o banco, NÃO usa DROP TABLE / TRUNCATE. Idempotente.
--
-- COMO EXECUTAR NO RENDER (a partir da raiz do projeto):
--   psql "$DATABASE_URL" -f backend/prisma/cleanup-demo.sql
-- Substitua $DATABASE_URL pela conexão do seu PostgreSQL de produção no Render.
-- =====================================================================

BEGIN;

-- 1. Filhos / dependências (nenhuma referência pendente)
DELETE FROM "Certificate";
DELETE FROM "Attendance";
DELETE FROM "ActivityRegistration";
DELETE FROM "Notification";
DELETE FROM "AuditLog";

-- 2. Registrations (dependente de User e Event)
DELETE FROM "Registration";

-- 3. Activities / Speakers / Events
DELETE FROM "Activity";
DELETE FROM "Speaker";
DELETE FROM "Event";

-- 4. Todos os usuários que NÃO sejam ADMIN (remove PARTICIPANT e ORGANIZER)
DELETE FROM "User"
WHERE role <> 'ADMIN';

-- 5. Nada é feito em "Institution" (mantém a atlética cadastrada)

COMMIT;

-- =====================================================================
-- Verificação (fora da transação) — deve restar:
--   Institution = 1, User(ADMIN) = 1,
--   User(PARTICIPANT/ORGANIZER) = 0, Event = 0, Activity = 0,
--   Registration = 0, ActivityRegistration = 0, Attendance = 0,
--   Certificate = 0, Notification = 0, Speaker = 0.
-- =====================================================================
SELECT 'Institution' t, count(*) FROM "Institution"
UNION ALL SELECT 'User ADMIN', count(*) FROM "User" WHERE role='ADMIN'
UNION ALL SELECT 'User ORGANIZER', count(*) FROM "User" WHERE role='ORGANIZER'
UNION ALL SELECT 'User PARTICIPANT', count(*) FROM "User" WHERE role='PARTICIPANT'
UNION ALL SELECT 'Event', count(*) FROM "Event"
UNION ALL SELECT 'Activity', count(*) FROM "Activity"
UNION ALL SELECT 'Speaker', count(*) FROM "Speaker"
UNION ALL SELECT 'Registration', count(*) FROM "Registration"
UNION ALL SELECT 'ActivityRegistration', count(*) FROM "ActivityRegistration"
UNION ALL SELECT 'Attendance', count(*) FROM "Attendance"
UNION ALL SELECT 'Certificate', count(*) FROM "Certificate"
UNION ALL SELECT 'Notification', count(*) FROM "Notification";
