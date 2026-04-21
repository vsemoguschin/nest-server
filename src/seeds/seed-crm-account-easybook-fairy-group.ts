import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ACCOUNT_CODE = 'easybook_fairy_group';
const ACCOUNT_NAME = 'Фотокниги-сказки про детей ИЗИБУК';

async function main() {
  try {
    const account = await prisma.crmAccount.upsert({
      where: { code: ACCOUNT_CODE },
      update: {
        name: ACCOUNT_NAME,
        isActive: true,
      },
      create: {
        code: ACCOUNT_CODE,
        name: ACCOUNT_NAME,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log(
      '[seed-crm-account-easybook-fairy-group] CRM account saved:',
      account,
    );
  } catch (error) {
    console.error(
      '[seed-crm-account-easybook-fairy-group] Ошибка при создании CRM-аккаунта:',
      error,
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
