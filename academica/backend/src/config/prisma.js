import { PrismaClient } from '@prisma/client';

// Single Prisma instance reused across the app.
export const prisma = new PrismaClient();
