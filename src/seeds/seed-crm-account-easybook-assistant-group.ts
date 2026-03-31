import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const account = await prisma.crmAccount.upsert({
      where: { code: 'easybook_assistant_group' },
      update: {
        name: 'ИзиБук ИИ',
        isActive: true,
      },
      create: {
        code: 'easybook_assistant_group',
        name: 'ИзиБук ИИ',
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    console.log('[seed-crm-account-easybook-assistant-group] CRM account saved:', account);
  } catch (error) {
    console.error(
      '[seed-crm-account-easybook-assistant-group] Ошибка при создании CRM-аккаунта:',
      error,
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
