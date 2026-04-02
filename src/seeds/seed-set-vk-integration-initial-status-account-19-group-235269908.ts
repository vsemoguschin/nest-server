import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ACCOUNT_ID = 19;
const GROUP_ID = 235269908;
const STATUS_ID = 366763;

async function main() {
  try {
    const integration = await prisma.crmVkIntegration.findFirst({
      where: {
        groupId: GROUP_ID,
        accountId: ACCOUNT_ID,
      },
      select: {
        id: true,
        accountId: true,
        groupId: true,
        initialCrmStatusId: true,
      },
    });

    if (!integration) {
      console.error(
        `[seed-set-vk-integration-initial-status] Интеграция не найдена для accountId=${ACCOUNT_ID}, groupId=${GROUP_ID}`,
      );
      process.exitCode = 1;
      return;
    }

    const status = await prisma.crmStatus.findUnique({
      where: {
        id: STATUS_ID,
      },
      select: {
        id: true,
        accountId: true,
        name: true,
      },
    });

    if (!status) {
      console.error(
        `[seed-set-vk-integration-initial-status] Статус не найден: statusId=${STATUS_ID}, ожидаемый accountId=${ACCOUNT_ID}`,
      );
      process.exitCode = 1;
      return;
    }

    if (status.accountId !== ACCOUNT_ID) {
      console.error(
        `[seed-set-vk-integration-initial-status] Статус принадлежит другому аккаунту: statusId=${STATUS_ID}, status.accountId=${status.accountId}, expectedAccountId=${ACCOUNT_ID}`,
      );
      process.exitCode = 1;
      return;
    }

    if (integration.initialCrmStatusId === STATUS_ID) {
      console.log(
        `[seed-set-vk-integration-initial-status] Already up to date: integrationId=${integration.id}, initialCrmStatusId=${integration.initialCrmStatusId}`,
      );
      return;
    }

    const updatedIntegration = await prisma.crmVkIntegration.update({
      where: {
        id: integration.id,
      },
      data: {
        initialCrmStatusId: STATUS_ID,
      },
      select: {
        id: true,
        accountId: true,
        groupId: true,
        initialCrmStatusId: true,
      },
    });

    console.log(
      '[seed-set-vk-integration-initial-status] Интеграция обновлена:',
      updatedIntegration,
    );
  } catch (error) {
    console.error(
      '[seed-set-vk-integration-initial-status] Ошибка при обновлении initialCrmStatusId:',
      error,
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
