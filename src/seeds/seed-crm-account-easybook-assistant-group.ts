import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ACCOUNT_CODE = 'easybook_assistant_group';
const ACCOUNT_NAME = 'ИзиБук ИИ';
const VK_GROUP_NAME = 'ИЗИБУК фотокниги';

const STATUSES = [
  { name: 'Вступил в группу', color: '#3B3B3B' },
  { name: 'Поинтересовался Бот', color: '#848B8C' },
  { name: 'Выявление цели', color: '#008000' },
  { name: 'Узнал цену', color: '#3B3B3B' },
  { name: 'Планирует купить', color: '#FF9900' },
  { name: 'Личный контакт', color: '#FF99CC' },
  { name: 'Подходят условия', color: '#0165B0' },
  { name: 'Ожидаем предоплату', color: '#FF99CC' },
  { name: 'Предоплата оплачена', color: '#0165B0' },
  { name: 'На брони', color: '#B60205' },
  { name: 'Ждем фото', color: '#FF003A' },
  { name: 'Завис на фото', color: '#848B8C' },
  { name: 'В дизайне', color: '#0165B0' },
  { name: 'Ждёт макет', color: '#FF99CC' },
  { name: '🆘СРОЧНЫЙ🆘', color: '#3B3B3B' },
  { name: 'Завис на дизайне', color: '#848B8C' },
  { name: 'Ждем вторую оплату', color: '#FF99CC' },
  { name: 'Вторая оплата', color: '#0165B0' },
  { name: 'На производстве', color: '#FF9900' },
  { name: 'Перешли в ТГ', color: '#B60205' },
  { name: 'Перешли в Вотсап', color: '#B60205' },
  { name: 'Перешли в MAX', color: '#B60205' },
  { name: 'Заказ отправлен', color: '#0165B0' },
  { name: 'Заказ доставлен', color: '#008000' },
  { name: 'Постоянник', color: '#B60205' },
  { name: 'Отказ на фото', color: '#FF003A' },
  { name: 'Отказ на дизайне', color: '#FF003A' },
  { name: 'Черный список', color: '#FF003A' },
  { name: 'Бывший клиент', color: '#FF003A' },
  { name: 'Работает бот', color: '#848B8C' },
  { name: 'Не учитывать в лидах', color: '#848B8C' },
  { name: 'Завис на теме', color: '#848B8C' },
  { name: 'Завис на кф', color: '#848B8C' },
  { name: 'Завис на цене', color: '#848B8C' },
] as const;

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Не задана обязательная env-переменная ${name}`);
  }

  return value;
}

function readRequiredIntEnv(name: string): number {
  const value = readRequiredEnv(name);
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Env-переменная ${name} должна быть положительным целым числом, получено "${value}"`,
    );
  }

  return parsed;
}

async function main() {
  try {
    const vkGroupId = readRequiredIntEnv('VK_GROUP_EASYBOOK_ASSISTANT_ID');
    const callbackSecret = readRequiredEnv('VK_CALLBACK_SECRET');
    const confirmationCode = readRequiredEnv('VK_CONFIRMATION_CODE');

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
      },
    });

    for (const status of STATUSES) {
      const existing = await prisma.crmStatus.findFirst({
        where: {
          accountId: account.id,
          name: status.name,
        },
        select: {
          id: true,
        },
      });

      if (existing) {
        await prisma.crmStatus.update({
          where: { id: existing.id },
          data: {
            color: status.color,
            type: 1,
          },
        });
        continue;
      }

      await prisma.crmStatus.create({
        data: {
          accountId: account.id,
          name: status.name,
          color: status.color,
          type: 1,
        },
      });
    }

    const vkIntegration = await prisma.crmVkIntegration.upsert({
      where: {
        groupId: vkGroupId,
      },
      update: {
        accountId: account.id,
        groupName: VK_GROUP_NAME,
        callbackSecret,
        confirmationCode,
        isActive: true,
      },
      create: {
        accountId: account.id,
        groupId: vkGroupId,
        groupName: VK_GROUP_NAME,
        callbackSecret,
        confirmationCode,
        isActive: true,
      },
      select: {
        id: true,
        accountId: true,
        groupId: true,
        groupName: true,
        isActive: true,
      },
    });

    const statuses = await prisma.crmStatus.findMany({
      where: {
        accountId: account.id,
      },
      select: {
        id: true,
        name: true,
        color: true,
        type: true,
      },
      orderBy: [{ id: 'asc' }],
    });

    console.log('[seed-crm-account-easybook-assistant-group] CRM account saved:', account);
    console.log(
      '[seed-crm-account-easybook-assistant-group] CRM VK integration saved:',
      vkIntegration,
    );
    console.log(
      '[seed-crm-account-easybook-assistant-group] CRM statuses saved:',
      statuses,
    );
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
