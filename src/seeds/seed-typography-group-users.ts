import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GROUP_TITLE = 'Типография';
const WORKSPACE_ID = 8;
const USER_IDS = [133, 399];
const ROLE = {
  shortName: 'PRINTER',
  department: 'PRODUCTION',
  fullName: 'Печатник',
};

async function run() {
  try {
    const workspace = await prisma.workSpace.findUnique({
      where: { id: WORKSPACE_ID },
      select: { id: true, title: true },
    });

    if (!workspace) {
      throw new Error(`Workspace id=${WORKSPACE_ID} not found`);
    }

    const users = await prisma.user.findMany({
      where: {
        id: {
          in: USER_IDS,
        },
      },
      select: {
        id: true,
        fullName: true,
        groupId: true,
        workSpaceId: true,
        deletedAt: true,
      },
      orderBy: { id: 'asc' },
    });

    const foundUserIds = new Set(users.map((user) => user.id));
    const missingUserIds = USER_IDS.filter((id) => !foundUserIds.has(id));

    if (missingUserIds.length > 0) {
      throw new Error(`Users not found: ${missingUserIds.join(', ')}`);
    }

    const deletedUsers = users.filter((user) => user.deletedAt);
    if (deletedUsers.length > 0) {
      throw new Error(
        `Users are deleted: ${deletedUsers.map((user) => user.id).join(', ')}`,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const role = await tx.role.upsert({
        where: {
          shortName: ROLE.shortName,
        },
        update: {
          department: ROLE.department,
          fullName: ROLE.fullName,
        },
        create: ROLE,
        select: {
          id: true,
          shortName: true,
          department: true,
          fullName: true,
        },
      });

      let group = await tx.group.findFirst({
        where: {
          title: GROUP_TITLE,
          workSpaceId: WORKSPACE_ID,
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          workSpaceId: true,
        },
        orderBy: { id: 'asc' },
      });

      if (!group) {
        group = await tx.group.create({
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
      }

      const updatedUsers = await tx.user.updateMany({
        where: {
          id: {
            in: USER_IDS,
          },
          groupId: {
            not: group.id,
          },
        },
        data: {
          groupId: group.id,
        },
      });

      return {
        group,
        role,
        updatedUsersCount: updatedUsers.count,
      };
    });

    const assignedUsers = await prisma.user.findMany({
      where: {
        id: {
          in: USER_IDS,
        },
      },
      select: {
        id: true,
        fullName: true,
        groupId: true,
        workSpaceId: true,
      },
      orderBy: { id: 'asc' },
    });

    console.log(
      `[Seed] Group "${result.group.title}" id=${result.group.id}, workSpaceId=${result.group.workSpaceId}`,
    );
    console.log(
      `[Seed] Role "${result.role.shortName}" id=${result.role.id}, department=${result.role.department}, fullName="${result.role.fullName}"`,
    );
    console.log(`[Seed] Updated users: ${result.updatedUsersCount}`);
    console.table(assignedUsers);
  } catch (error) {
    console.error('[Seed] Failed to seed typography group/users', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
