import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const USER_ID = 454;
const TARGET_GROUP_ID = 12;

async function main() {
  console.log(
    `[User Group Seed] Start: set user ${USER_ID} groupId -> ${TARGET_GROUP_ID}`,
  );

  const [user, group] = await Promise.all([
    prisma.user.findUnique({
      where: { id: USER_ID },
      select: {
        id: true,
        fullName: true,
        email: true,
        groupId: true,
        workSpaceId: true,
        deletedAt: true,
      },
    }),
    prisma.group.findUnique({
      where: { id: TARGET_GROUP_ID },
      select: {
        id: true,
        title: true,
        workSpaceId: true,
        deletedAt: true,
      },
    }),
  ]);

  if (!user) {
    throw new Error(`User id=${USER_ID} not found`);
  }

  if (!group) {
    throw new Error(`Group id=${TARGET_GROUP_ID} not found`);
  }

  if (user.deletedAt) {
    console.warn(
      `[User Group Seed] Warning: user id=${USER_ID} is soft-deleted (${user.deletedAt.toISOString()})`,
    );
  }

  if (group.deletedAt) {
    console.warn(
      `[User Group Seed] Warning: group id=${TARGET_GROUP_ID} is soft-deleted (${group.deletedAt.toISOString()})`,
    );
  }

  if (user.workSpaceId !== group.workSpaceId) {
    throw new Error(
      `Workspace mismatch: user.workSpaceId=${user.workSpaceId}, group.workSpaceId=${group.workSpaceId}`,
    );
  }

  if (user.groupId === TARGET_GROUP_ID) {
    console.log(
      `[User Group Seed] No changes: user ${user.id} already has groupId=${TARGET_GROUP_ID}`,
    );
    return;
  }

  const updatedUser = await prisma.user.update({
    where: { id: USER_ID },
    data: { groupId: TARGET_GROUP_ID },
    select: {
      id: true,
      fullName: true,
      email: true,
      groupId: true,
      workSpaceId: true,
    },
  });

  console.log('[User Group Seed] Updated user:', updatedUser);
  console.log(
    `[User Group Seed] Done: groupId ${user.groupId} -> ${updatedUser.groupId}`,
  );
}

main()
  .catch((error) => {
    console.error('[User Group Seed] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
