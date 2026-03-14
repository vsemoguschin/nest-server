import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const AD_SOURCES = [
  {
    title: 'ИЗИБУК АВИТО ТАРГЕТ',
    workSpaceId: 3,
    groupId: 19,
  },
  {
    title: 'ИЗИНЕОН АВИТО ТАРГЕТ',
    workSpaceId: 3,
    groupId: 18,
  },
] as const;

async function seedAdSources() {
  for (const adSource of AD_SOURCES) {
    const saved = await prisma.adSource.upsert({
      where: { title: adSource.title },
      update: {
        workSpaceId: adSource.workSpaceId,
        groupId: adSource.groupId,
      },
      create: {
        title: adSource.title,
        workSpaceId: adSource.workSpaceId,
        groupId: adSource.groupId,
      },
      select: {
        id: true,
        title: true,
        workSpaceId: true,
        groupId: true,
      },
    });

    console.log(
      `[seed-ad-sources-easybook-easyneon] saved id=${saved.id} title="${saved.title}" workSpaceId=${saved.workSpaceId} groupId=${saved.groupId}`,
    );
  }
}

async function main() {
  try {
    await seedAdSources();
    console.log(
      '[seed-ad-sources-easybook-easyneon] Сид источников рекламы успешно выполнен.',
    );
  } catch (error) {
    console.error(
      '[seed-ad-sources-easybook-easyneon] Ошибка при создании источников рекламы:',
      error,
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
