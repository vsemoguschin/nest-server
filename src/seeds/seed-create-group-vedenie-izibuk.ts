// Запуск: cd crm/nest && npx ts-node src/seeds/seed-create-group-vedenie-izibuk.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GROUP_TITLE = 'ИзиБук Ведение';
const WORKSPACE_ID = 3;
const SOURCE_ROLE_ID = 8;
const SOURCE_GROUP_ID = 19;
const TARGET_USER_ID = 228;
const TARGET_ROLE_ID = 7;
const DATE_FROM = '2026-03-01';
const CLIENT_DATE_FROM = new Date(`${DATE_FROM}T00:00:00.000Z`);

async function run() {
  try {
    const existingGroup = await prisma.group.findFirst({
      where: {
        title: GROUP_TITLE,
        workSpaceId: WORKSPACE_ID,
      },
      select: {
        id: true,
        title: true,
        workSpaceId: true,
      },
      orderBy: { id: 'asc' },
    });

    let targetGroupId: number;

    if (existingGroup) {
      console.log(
        `[Group Seed] Group already exists: id=${existingGroup.id}, title="${existingGroup.title}", workSpaceId=${existingGroup.workSpaceId}`,
      );
      targetGroupId = existingGroup.id;
    } else {
      const createdGroup = await prisma.group.create({
        data: {
          title: GROUP_TITLE,
          workSpaceId: WORKSPACE_ID,
        },
        select: {
          id: true,
          title: true,
          workSpaceId: true,
        },
      });

      targetGroupId = createdGroup.id;
      console.log(
        `[Group Seed] Group created: id=${createdGroup.id}, title="${createdGroup.title}", workSpaceId=${createdGroup.workSpaceId}`,
      );
    }

    const usersToReassign = await prisma.user.findMany({
      where: {
        roleId: SOURCE_ROLE_ID,
        groupId: SOURCE_GROUP_ID,
      },
      select: {
        id: true,
      },
    });

    const userIds = usersToReassign.map((user) => user.id);

    const reassignedUsers = await prisma.user.updateMany({
      where: {
        id: {
          in: userIds,
        },
      },
      data: {
        groupId: targetGroupId,
      },
    });

    console.log(
      `[Group Seed] Users reassigned: ${reassignedUsers.count} (roleId=${SOURCE_ROLE_ID}, groupId: ${SOURCE_GROUP_ID} -> ${targetGroupId})`,
    );

    if (userIds.length > 0) {
      const [updatedClients, updatedDeals, updatedDops, updatedPayments] =
        await Promise.all([
          prisma.client.updateMany({
            where: {
              userId: { in: userIds },
              createdAt: { gte: CLIENT_DATE_FROM },
            },
            data: {
              groupId: targetGroupId,
            },
          }),
          prisma.deal.updateMany({
            where: {
              userId: { in: userIds },
              saleDate: { gte: DATE_FROM },
            },
            data: {
              groupId: targetGroupId,
            },
          }),
          prisma.dop.updateMany({
            where: {
              userId: { in: userIds },
              saleDate: { gte: DATE_FROM },
            },
            data: {
              groupId: targetGroupId,
            },
          }),
          prisma.payment.updateMany({
            where: {
              userId: { in: userIds },
              date: { gte: DATE_FROM },
            },
            data: {
              groupId: targetGroupId,
            },
          }),
        ]);

      console.log(
        `[Group Seed] Related records updated from ${DATE_FROM}: clients=${updatedClients.count}, deals=${updatedDeals.count}, dops=${updatedDops.count}, payments=${updatedPayments.count}`,
      );
    } else {
      console.log('[Group Seed] No users matched for related records update');
    }

    const updatedRole = await prisma.user.updateMany({
      where: {
        id: TARGET_USER_ID,
      },
      data: {
        roleId: TARGET_ROLE_ID,
      },
    });

    console.log(
      `[Group Seed] User role updated: ${updatedRole.count} (userId=${TARGET_USER_ID}, roleId -> ${TARGET_ROLE_ID})`,
    );
  } catch (error) {
    console.error('[Group Seed] Failed to create group', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
