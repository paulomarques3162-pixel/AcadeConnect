-- AlterTable
ALTER TABLE "PixConfig" ADD COLUMN     "expiresMinutes" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false;
