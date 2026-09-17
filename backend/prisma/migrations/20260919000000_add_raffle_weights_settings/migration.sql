-- V9.6 — Migração aditiva e segura.
-- 1) Pesos administrativos + soft delete no sorteio.
-- 2) Tabela de configurações da plataforma (ex.: informações de contato).
-- Nenhum DROP / DELETE / TRUNCATE. Reexecutável (IF NOT EXISTS).

-- ---------- Raffle ----------
ALTER TABLE "Raffle" ADD COLUMN IF NOT EXISTS "weights" JSONB;
ALTER TABLE "Raffle" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Raffle_eventId_deletedAt_idx" ON "Raffle"("eventId", "deletedAt");

-- ---------- Setting ----------
CREATE TABLE IF NOT EXISTS "Setting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Setting_key_key" ON "Setting"("key");
CREATE INDEX IF NOT EXISTS "Setting_key_idx" ON "Setting"("key");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Setting_updatedById_fkey'
  ) THEN
    ALTER TABLE "Setting"
      ADD CONSTRAINT "Setting_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
