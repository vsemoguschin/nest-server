import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function readRequiredIntEnv(name: string): number {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Не задана обязательная env-переменная ${name}`);
  }

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
    const groupId = readRequiredIntEnv('VK_GROUP_EASYBOOK_ASSISTANT_ID');

    const integration = await prisma.crmVkIntegration.findUnique({
      where: {
        groupId,
      },
      select: {
        id: true,
        accountId: true,
        groupId: true,
        groupName: true,
        callbackSecret: true,
        confirmationCode: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!integration) {
      throw new Error(
        `CrmVkIntegration не найден для groupId=${groupId} (env VK_GROUP_EASYBOOK_ASSISTANT_ID)`,
      );
    }

    console.log('[seed-vk-callback-test] CrmVkIntegration found:', {
      ...integration,
      callbackSecret: integration.callbackSecret ? '[present]' : '[empty]',
      confirmationCode: integration.confirmationCode ? '[present]' : '[empty]',
    });

    const callbackEvents = await prisma.vkCallbackEvent.findMany({
      where: {
        vkIntegrationId: integration.id,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: {
        id: true,
        accountId: true,
        vkIntegrationId: true,
        eventId: true,
        eventType: true,
        groupId: true,
        vkUserId: true,
        apiVersion: true,
        status: true,
        errorMessage: true,
        processedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log(
      '[seed-vk-callback-test] Last 10 VkCallbackEvent for integration:',
      callbackEvents,
    );

    const crmVkRows = await prisma.crmVk.findMany({
      where: {
        accountId: integration.accountId,
      },
      orderBy: [{ id: 'desc' }],
      take: 10,
      select: {
        id: true,
        accountId: true,
        externalId: true,
        name: true,
        messagesGroupId: true,
      },
    });

    console.log(
      '[seed-vk-callback-test] Last 10 CrmVk for integration accountId:',
      crmVkRows,
    );
  } catch (error) {
    console.error('[seed-vk-callback-test] Ошибка проверки VK callback pipeline:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
