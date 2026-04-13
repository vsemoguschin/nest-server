import 'dotenv/config';

import { PrismaService } from '../prisma/prisma.service';

const TARGET_ACCOUNT_ID = 1;
const TARGET_TOKEN_ENV_KEY = 'VK_ADS_BOOK_TOKEN';

function isCreateMode(): boolean {
  return process.env.VK_ADS_TEST_CREATE_INTEGRATION?.trim() === '1';
}

async function printIntegrations(prisma: PrismaService) {
  const integrations = await prisma.vkAdsAccountIntegration.findMany({
    select: {
      id: true,
      accountId: true,
      isActive: true,
      tokenEnvKey: true,
      createdAt: true,
    },
    orderBy: {
      id: 'asc',
    },
  });

  console.log(
    JSON.stringify(
      integrations.map((integration) => ({
        id: integration.id,
        accountId: integration.accountId,
        isActive: integration.isActive,
        tokenEnvKey: integration.tokenEnvKey,
        createdAt: integration.createdAt.toISOString(),
      })),
      null,
      2,
    ),
  );
}

async function createIntegrationIfMissing(prisma: PrismaService) {
  const existing = await prisma.vkAdsAccountIntegration.findFirst({
    where: {
      accountId: TARGET_ACCOUNT_ID,
      tokenEnvKey: TARGET_TOKEN_ENV_KEY,
    },
    select: {
      id: true,
    },
    orderBy: {
      id: 'asc',
    },
  });

  if (existing) {
    console.log(
      JSON.stringify(
        {
          status: 'already exists',
          id: existing.id,
          accountId: TARGET_ACCOUNT_ID,
          tokenEnvKey: TARGET_TOKEN_ENV_KEY,
        },
        null,
        2,
      ),
    );
    return;
  }

  const created = await prisma.vkAdsAccountIntegration.create({
    data: {
      accountId: TARGET_ACCOUNT_ID,
      isActive: true,
      tokenEnvKey: TARGET_TOKEN_ENV_KEY,
    },
    select: {
      id: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        status: 'created',
        id: created.id,
        accountId: TARGET_ACCOUNT_ID,
        tokenEnvKey: TARGET_TOKEN_ENV_KEY,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    if (isCreateMode()) {
      await createIntegrationIfMissing(prisma);
      return;
    }

    await printIntegrations(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error('[vk-ads-test-integration] failed:', error);
  process.exitCode = 1;
});
