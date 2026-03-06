// Запуск: cd crm/nest && npx ts-node src/seeds/seed-sync-dops-group-id-by-user.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  try {
    console.log('[seed-sync-dops-group-id-by-user] Start');

    const updatedDopsCount = await prisma.$executeRaw`
      UPDATE "Dop" AS d
      SET "groupId" = u."groupId"
      FROM "User" AS u
      WHERE d."userId" = u."id"
        AND d."userId" IS NOT NULL
        AND d."groupId" IS DISTINCT FROM u."groupId"
    `;

    const updatedPaymentsCount = await prisma.$executeRaw`
      UPDATE "Payment" AS p
      SET "groupId" = u."groupId"
      FROM "User" AS u
      WHERE p."userId" = u."id"
        AND p."userId" IS NOT NULL
        AND p."groupId" IS DISTINCT FROM u."groupId"
    `;

    console.log(
      `[seed-sync-dops-group-id-by-user] Updated dops: ${updatedDopsCount}`,
    );
    console.log(
      `[seed-sync-dops-group-id-by-user] Updated payments: ${updatedPaymentsCount}`,
    );
  } catch (error) {
    console.error('[seed-sync-dops-group-id-by-user] Failed', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
