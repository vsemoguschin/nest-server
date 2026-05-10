import { PrismaClient } from '@prisma/client';

type TargetIntegration = {
  tokenEnvKey: string;
  projectId: number;
  name: string;
  workSpaceId?: number; // только для VK_ADS_ACCOUNT_* — создаёт AdSource
};

const prisma = new PrismaClient();

const TARGETS: TargetIntegration[] = [
  {
    tokenEnvKey: 'VK_ADS_BOOK_TOKEN',
    projectId: 2,
    name: 'Изибук',
  },
  {
    tokenEnvKey: 'VK_ADS_TOKEN',
    projectId: 3,
    name: 'Изинеон',
  },
  {
    tokenEnvKey: 'VK_ADS_ACCOUNT_28513061',
    projectId: 2,
    name: 'Изибук у славы',
    workSpaceId: 3,
  },
  {
    tokenEnvKey: 'VK_ADS_ACCOUNT_26052915',
    projectId: 3,
    name: 'Изинеон у славы',
    workSpaceId: 3,
  },
  {
    tokenEnvKey: 'VK_ADS_ACCOUNT_21795602',
    projectId: 2,
    name: 'Изибук сказки',
    workSpaceId: 3,
  },
  {
    tokenEnvKey: 'VK_ADS_ACCOUNT_29060985',
    projectId: 2,
    name: 'Калинкапринт',
    workSpaceId: 3,
  },
];

// Явные присвоения: связываем существующие adSource с интеграцией и проектом
type ExplicitAdSourceLink = {
  adSourceId: number;
  integrationId: number;
  projectId: number;
};

const EXPLICIT_AD_SOURCE_LINKS: ExplicitAdSourceLink[] = [
  { adSourceId: 1, integrationId: 2, projectId: 3 },
  { adSourceId: 19, integrationId: 1, projectId: 2 },
];

async function resolveProjectAccountId(projectId: number) {
  const projectIntegrations = await prisma.vkAdsAccountIntegration.findMany({
    where: {
      projectId,
      isActive: true,
    },
    select: {
      id: true,
      accountId: true,
      tokenEnvKey: true,
      projectId: true,
      name: true,
    },
  });

  const distinctAccountIds = Array.from(
    new Set(projectIntegrations.map((item) => item.accountId)),
  );

  if (!projectIntegrations.length) {
    throw new Error(
      `Не удалось определить accountId для projectId=${projectId}. Нужен явный accountId в seed.`,
    );
  }

  if (distinctAccountIds.length !== 1) {
    throw new Error(
      `Для projectId=${projectId} найдено несколько accountId у активных VkAdsAccountIntegration: ${distinctAccountIds.join(', ')}. Нужен явный accountId в seed.`,
    );
  }

  return distinctAccountIds[0];
}

async function ensureProject(projectId: number, tokenEnvKey: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, code: true, name: true, isActive: true },
  });

  console.log(
    `[vk-ads-integration-projects] tokenEnvKey=${tokenEnvKey} projectId=${projectId} projectFound=${project ? 'yes' : 'no'}`,
  );

  if (!project) {
    console.log(
      `[vk-ads-integration-projects] tokenEnvKey=${tokenEnvKey} skipped: project missing`,
    );
    return null;
  }

  return project;
}

async function upsertAdSource(
  name: string,
  workSpaceId: number,
  projectId: number,
): Promise<number> {
  const existing = await prisma.adSource.findUnique({
    where: { title: name },
    select: { id: true, projectId: true },
  });

  if (existing) {
    const needsUpdate = existing.projectId !== projectId;
    if (needsUpdate) {
      await prisma.adSource.update({
        where: { id: existing.id },
        data: { projectId },
      });
      console.log(
        `[vk-ads-integration-projects] adSource title="${name}" id=${existing.id} projectId updated to ${projectId}`,
      );
    } else {
      console.log(
        `[vk-ads-integration-projects] adSource title="${name}" id=${existing.id} action=skipped`,
      );
    }
    return existing.id;
  }

  const created = await prisma.adSource.create({
    data: {
      title: 'ВК Таргет ' + name,
      workSpaceId,
      projectId,
    },
    select: { id: true },
  });

  console.log(
    `[vk-ads-integration-projects] adSource title="${name}" id=${created.id} workSpaceId=${workSpaceId} projectId=${projectId} action=created`,
  );
  return created.id;
}

async function upsertIntegration(target: TargetIntegration) {
  const project = await ensureProject(target.projectId, target.tokenEnvKey);
  if (!project) return;

  const existingRows = await prisma.vkAdsAccountIntegration.findMany({
    where: { tokenEnvKey: target.tokenEnvKey },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      accountId: true,
      projectId: true,
      name: true,
      tokenEnvKey: true,
      adSourceId: true,
    },
  });

  if (existingRows.length > 1) {
    throw new Error(
      `Найдено несколько VkAdsAccountIntegration с tokenEnvKey=${target.tokenEnvKey}. Нужна ручная чистка перед seed.`,
    );
  }

  const existing = existingRows[0] ?? null;
  const accountId =
    existing?.accountId ?? (await resolveProjectAccountId(target.projectId));

  // Создаём AdSource только для VK_ADS_ACCOUNT_* (workSpaceId задан)
  const adSourceId =
    target.workSpaceId != null
      ? await upsertAdSource(target.name, target.workSpaceId, target.projectId)
      : null;

  if (!existing) {
    const created = await prisma.vkAdsAccountIntegration.create({
      data: {
        accountId,
        projectId: target.projectId,
        name: target.name,
        isActive: true,
        tokenEnvKey: target.tokenEnvKey,
        ...(adSourceId != null ? { adSourceId } : {}),
      },
      select: {
        id: true,
        accountId: true,
        projectId: true,
        name: true,
        tokenEnvKey: true,
        adSourceId: true,
      },
    });

    console.log(
      [
        `[vk-ads-integration-projects] tokenEnvKey=${target.tokenEnvKey}`,
        `integrationId=${created.id}`,
        `oldName=null -> newName=${created.name ?? 'null'}`,
        `oldProjectId=null -> newProjectId=${created.projectId}`,
        `accountId=${created.accountId}`,
        `adSourceId=${created.adSourceId ?? 'null'}`,
        'action=created',
      ].join(' '),
    );
    return;
  }

  const oldProjectId = existing.projectId ?? null;
  const oldName = existing.name ?? null;
  const oldAdSourceId = existing.adSourceId ?? null;
  const needsUpdate =
    oldProjectId !== target.projectId ||
    oldName !== target.name ||
    (adSourceId != null && oldAdSourceId !== adSourceId);

  if (!needsUpdate) {
    console.log(
      [
        `[vk-ads-integration-projects] tokenEnvKey=${target.tokenEnvKey}`,
        `integrationId=${existing.id}`,
        `oldName=${oldName ?? 'null'} -> newName=${target.name}`,
        `oldProjectId=${oldProjectId ?? 'null'} -> newProjectId=${target.projectId}`,
        `accountId=${existing.accountId}`,
        `adSourceId=${existing.adSourceId ?? 'null'}`,
        'action=skipped',
      ].join(' '),
    );
    return;
  }

  const updated = await prisma.vkAdsAccountIntegration.update({
    where: { id: existing.id },
    data: {
      projectId: target.projectId,
      name: target.name,
      ...(adSourceId != null ? { adSourceId } : {}),
    },
    select: {
      id: true,
      accountId: true,
      projectId: true,
      name: true,
      tokenEnvKey: true,
      adSourceId: true,
    },
  });

  console.log(
    [
      `[vk-ads-integration-projects] tokenEnvKey=${target.tokenEnvKey}`,
      `integrationId=${updated.id}`,
      `oldName=${oldName ?? 'null'} -> newName=${updated.name ?? 'null'}`,
      `oldProjectId=${oldProjectId ?? 'null'} -> newProjectId=${updated.projectId}`,
      `accountId=${updated.accountId}`,
      `adSourceId=${updated.adSourceId ?? 'null'}`,
      'action=updated',
    ].join(' '),
  );
}

async function applyExplicitAdSourceLinks() {
  for (const link of EXPLICIT_AD_SOURCE_LINKS) {
    const adSource = await prisma.adSource.findUnique({
      where: { id: link.adSourceId },
      select: { id: true, title: true, projectId: true },
    });

    if (!adSource) {
      console.warn(
        `[vk-ads-integration-projects] explicit link skipped: adSource id=${link.adSourceId} not found`,
      );
      continue;
    }

    const integration = await prisma.vkAdsAccountIntegration.findUnique({
      where: { id: link.integrationId },
      select: { id: true, name: true, adSourceId: true },
    });

    if (!integration) {
      console.warn(
        `[vk-ads-integration-projects] explicit link skipped: integration id=${link.integrationId} not found`,
      );
      continue;
    }

    const adSourceNeedsUpdate = adSource.projectId !== link.projectId;
    const integrationNeedsUpdate = integration.adSourceId !== link.adSourceId;

    if (!adSourceNeedsUpdate && !integrationNeedsUpdate) {
      console.log(
        `[vk-ads-integration-projects] explicit link adSourceId=${link.adSourceId} integrationId=${link.integrationId} action=skipped`,
      );
      continue;
    }

    if (adSourceNeedsUpdate) {
      await prisma.adSource.update({
        where: { id: link.adSourceId },
        data: { projectId: link.projectId },
      });
    }

    if (integrationNeedsUpdate) {
      await prisma.vkAdsAccountIntegration.update({
        where: { id: link.integrationId },
        data: { adSourceId: link.adSourceId },
      });
    }

    console.log(
      [
        `[vk-ads-integration-projects] explicit link`,
        `adSourceId=${link.adSourceId} title="${adSource.title}"`,
        `integrationId=${link.integrationId} name="${integration.name ?? 'null'}"`,
        `projectId=${link.projectId}`,
        'action=updated',
      ].join(' '),
    );
  }
}

async function main() {
  try {
    for (const target of TARGETS) {
      await upsertIntegration(target);
    }
    await applyExplicitAdSourceLinks();
  } catch (error) {
    console.error('[vk-ads-integration-projects] failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[vk-ads-integration-projects] fatal:', error);
  process.exit(1);
});
