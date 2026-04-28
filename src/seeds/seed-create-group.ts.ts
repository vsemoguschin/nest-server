import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const WORKSPACE_ID = 2;
const GROUP_TITLES = ['Изибук Сказки', 'Изибук Авито'];

// const workspaceUpdates = [
//   { id: 2, title: 'Сергей' },
//   { id: 3, title: 'Юля' },
// ];

const projectAssignments: { projectId: number; groupIds: number[]; label: string }[] = [
  { projectId: 1, groupIds: [10, 11], label: 'общая деятельность' },
  { projectId: 2, groupIds: [19, 17, 26, 27, 28, 29], label: 'изибук' },
  { projectId: 3, groupIds: [2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 18], label: 'изинеон' },
];

async function run() {
  try {
    const workspace = await prisma.workSpace.findUnique({
      where: { id: WORKSPACE_ID },
      select: { id: true, title: true },
    });

    if (!workspace) {
      throw new Error(`Workspace id=${WORKSPACE_ID} not found`);
    }

    console.log(`[Seed] Workspace: "${workspace.title}" id=${workspace.id}`);

    // Создание двух новых групп
    const results: { id: number; title: string; workSpaceId: number }[] = [];

    for (const title of GROUP_TITLES) {
      const existing = await prisma.group.findFirst({
        where: { title, workSpaceId: WORKSPACE_ID, deletedAt: null },
        select: { id: true, title: true, workSpaceId: true },
      });

      if (existing) {
        console.log(
          `[Seed] Group already exists: "${existing.title}" id=${existing.id}`,
        );
        results.push(existing);
        continue;
      }

      const group = await prisma.group.create({
        data: { title, workSpaceId: WORKSPACE_ID },
        select: { id: true, title: true, workSpaceId: true },
      });

      console.log(`[Seed] Created group: "${group.title}" id=${group.id}`);
      results.push(group);
    }

    console.log('\n[Seed] Created/existing groups:');
    console.table(results);

    // Присвоение projectId существующим группам
    console.log('\n[Seed] Assigning projectId to groups...');

    for (const { projectId, groupIds, label } of projectAssignments) {
      const updated = await prisma.group.updateMany({
        where: {
          id: { in: groupIds },
          deletedAt: null,
        },
        data: { projectId },
      });

      console.log(
        `[Seed] projectId=${projectId} (${label}): updated ${updated.count} of ${groupIds.length} groups [${groupIds.join(', ')}]`,
      );
    }

    // Обновление title у workspace
    console.log('\n[Seed] Updating workspace titles...');

    // for (const { id, title } of workspaceUpdates) {
    //   const updated = await prisma.workSpace.update({
    //     where: { id },
    //     data: { title },
    //     select: { id: true, title: true },
    //   });
    //   console.log(`[Seed] Workspace id=${updated.id} title="${updated.title}"`);
    // }

    // Создание группы для workspace id=6
    console.log('\n[Seed] Creating group for workspace id=6...');

    const ws6Group = await prisma.group.findFirst({
      where: { title: 'ИзиБук дизайнеры', workSpaceId: 6, deletedAt: null },
      select: { id: true, title: true, workSpaceId: true },
    });

    if (ws6Group) {
      console.log(`[Seed] Group already exists: "${ws6Group.title}" id=${ws6Group.id}`);
    } else {
      const created = await prisma.group.create({
        data: { title: 'ИзиБук дизайнеры', workSpaceId: 6 },
        select: { id: true, title: true, workSpaceId: true },
      });
      console.log(`[Seed] Created group: "${created.title}" id=${created.id}`);
    }
  } catch (error) {
    console.error('[Seed] Failed to seed groups', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
