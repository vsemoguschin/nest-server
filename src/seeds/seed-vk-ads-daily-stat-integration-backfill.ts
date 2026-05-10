import { PrismaClient } from '@prisma/client';

type Target = {
  tokenEnvKey: string;
  legacyProjectKey: 'neon' | 'book';
};

const prisma = new PrismaClient();

const TARGETS: Target[] = [
  { tokenEnvKey: 'VK_ADS_BOOK_TOKEN', legacyProjectKey: 'book' },
  { tokenEnvKey: 'VK_ADS_TOKEN', legacyProjectKey: 'neon' },
];

async function backfillTarget(target: Target) {
  const integration = await prisma.vkAdsAccountIntegration.findFirst({
    where: {
      tokenEnvKey: target.tokenEnvKey,
      isActive: true,
    },
    select: {
      id: true,
      accountId: true,
      projectId: true,
      name: true,
      tokenEnvKey: true,
    },
  });

  console.log(
    `[vk-ads-daily-stat-backfill] tokenEnvKey=${target.tokenEnvKey} integrationFound=${integration ? 'yes' : 'no'} legacyProject=${target.legacyProjectKey}`,
  );

  if (!integration) {
    console.log(
      `[vk-ads-daily-stat-backfill] tokenEnvKey=${target.tokenEnvKey} skipped: integration missing`,
    );
    return;
  }

  if (integration.projectId == null) {
    throw new Error(
      `Интеграция tokenEnvKey=${target.tokenEnvKey} не привязана к projectId. Сначала проставьте projectId.`,
    );
  }

  const alreadyBackfilled = await prisma.vkAdsDailyStat.count({
    where: {
      project: target.legacyProjectKey,
      integrationId: integration.id,
    },
  });

  const pending = await prisma.vkAdsDailyStat.count({
    where: {
      project: target.legacyProjectKey,
      integrationId: null,
    },
  });

  console.log(
    `[vk-ads-daily-stat-backfill] tokenEnvKey=${target.tokenEnvKey} integrationId=${integration.id} oldRows=${pending} alreadyBackfilled=${alreadyBackfilled}`,
  );

  if (!pending) {
    console.log(
      `[vk-ads-daily-stat-backfill] tokenEnvKey=${target.tokenEnvKey} skipped: nothing to backfill`,
    );
    return;
  }

  const result = await prisma.vkAdsDailyStat.updateMany({
    where: {
      project: target.legacyProjectKey,
      integrationId: null,
    },
    data: {
      integrationId: integration.id,
    },
  });

  console.log(
    `[vk-ads-daily-stat-backfill] tokenEnvKey=${target.tokenEnvKey} integrationId=${integration.id} updated=${result.count} action=updated`,
  );
}

async function main() {
  try {
    for (const target of TARGETS) {
      await backfillTarget(target);
    }
  } catch (error) {
    console.error('[vk-ads-daily-stat-backfill] failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[vk-ads-daily-stat-backfill] fatal:', error);
  process.exit(1);
});
