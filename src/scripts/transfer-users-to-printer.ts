import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

const TARGET_USER_IDS = [399, 133] as const;
const TARGET_ROLE_SHORT_NAME = 'PRINTER';

type UserLookupClient = Pick<PrismaClient, 'user'>;

type UserSnapshot = {
  id: number;
  fullName: string;
  email: string;
  password: string;
  info: string;
  tg: string;
  tg_id: string;
  status: string;
  deletedAt: Date | null;
  avatarUrl: string | null;
  roleId: number;
  workSpaceId: number;
  groupId: number;
  isIntern: boolean;
  role: {
    id: number;
    shortName: string;
  };
  boards: {
    id: number;
  }[];
};

type PlannedUserTransfer = {
  oldUserId: number;
  oldEmail: string;
  archivedEmail: string;
  oldRole: string;
  newRole: string;
  boardsToCopy: number[];
  fieldsToCopy: string[];
};

const prisma = new PrismaClient();

function hasApplyFlag(): boolean {
  return process.argv.includes('--apply');
}

function buildArchivedEmail(baseEmail: string, userId: number, suffix: number) {
  const postfix = suffix === 0 ? '' : `-${suffix}`;
  return `${baseEmail}-archived-${userId}${postfix}`;
}

async function resolveArchivedEmail(
  tx: UserLookupClient,
  baseEmail: string,
  userId: number,
): Promise<string> {
  let suffix = 0;

  while (true) {
    const candidate = buildArchivedEmail(baseEmail, userId, suffix);
    const existing = await tx.user.findUnique({
      where: { email: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    suffix += 1;
  }
}

async function loadTargetUsers(): Promise<UserSnapshot[]> {
  const users = await prisma.user.findMany({
    where: {
      id: {
        in: [...TARGET_USER_IDS],
      },
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      password: true,
      info: true,
      tg: true,
      tg_id: true,
      status: true,
      deletedAt: true,
      avatarUrl: true,
      roleId: true,
      workSpaceId: true,
      groupId: true,
      isIntern: true,
      role: {
        select: {
          id: true,
          shortName: true,
        },
      },
      boards: {
        select: {
          id: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  const foundIds = new Set(users.map((user) => user.id));
  const missingIds = TARGET_USER_IDS.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    throw new Error(`Не найдены пользователи: ${missingIds.join(', ')}`);
  }

  return users as UserSnapshot[];
}

async function loadPrinterRole() {
  const role = await prisma.role.findUnique({
    where: {
      shortName: TARGET_ROLE_SHORT_NAME,
    },
    select: {
      id: true,
      shortName: true,
    },
  });

  if (!role) {
    throw new Error(
      `Роль ${TARGET_ROLE_SHORT_NAME} не найдена. Проверьте seed ролей.`,
    );
  }

  return role;
}

function buildPlan(params: {
  users: UserSnapshot[];
  printerRoleShortName: string;
  archivedEmails: Map<number, string>;
}): PlannedUserTransfer[] {
  const { users, printerRoleShortName, archivedEmails } = params;

  return users.map((user) => {
    const archivedEmail = archivedEmails.get(user.id);
    if (!archivedEmail) {
      throw new Error(`Не найден архивный email для пользователя ${user.id}`);
    }

    return {
      oldUserId: user.id,
      oldEmail: user.email,
      archivedEmail,
      oldRole: user.role.shortName,
      newRole: printerRoleShortName,
      boardsToCopy: user.boards.map((board) => board.id),
      fieldsToCopy: [
        'fullName',
        'email',
        'password',
        'workSpaceId',
        'groupId',
        'avatarUrl',
        'info',
        'tg',
        'tg_id',
        'status',
        'isIntern',
        'boards',
      ],
    };
  });
}

function printDryRun(plan: PlannedUserTransfer[]) {
  console.log('[dry-run] План переноса в PRINTER:');
  console.table(
    plan.map((row) => ({
      oldUserId: row.oldUserId,
      oldEmail: row.oldEmail,
      archivedEmail: row.archivedEmail,
      oldRole: row.oldRole,
      newRole: row.newRole,
      boardsCount: row.boardsToCopy.length,
      boardIds: row.boardsToCopy.join(', ') || '-',
      fieldsToCopy: row.fieldsToCopy.join(', '),
      oldWillBeSoftDeleted: 'yes',
      passwordBehavior: 'old and new keep the same hash',
    })),
  );
}

async function applyTransfer(
  printerRole: { id: number; shortName: string },
  users: UserSnapshot[],
) {
  const result = await prisma.$transaction(async (tx) => {
    const output: Array<{
      oldUserId: number;
      newUserId: number;
      oldEmail: string;
      archivedEmail: string;
      newRole: string;
      boardsCopied: number;
      oldDeletedAt: Date | null;
    }> = [];

    for (const oldUser of users) {
      const archivedEmail = await resolveArchivedEmail(
        tx,
        oldUser.email,
        oldUser.id,
      );
      const boardIds = oldUser.boards.map((board) => board.id);

      const deletedAt = new Date();

      await tx.user.update({
        where: { id: oldUser.id },
        data: {
          email: archivedEmail,
          deletedAt,
        },
      });

      const newUser = await tx.user.create({
        data: {
          fullName: oldUser.fullName,
          email: oldUser.email,
          password: oldUser.password,
          info: oldUser.info,
          tg: oldUser.tg,
          tg_id: oldUser.tg_id,
          status: oldUser.status,
          avatarUrl: oldUser.avatarUrl,
          roleId: printerRole.id,
          workSpaceId: oldUser.workSpaceId,
          groupId: oldUser.groupId,
          isIntern: oldUser.isIntern,
          boards: {
            connect: boardIds.map((id) => ({ id })),
          },
        },
        select: {
          id: true,
        },
      });

      output.push({
        oldUserId: oldUser.id,
        newUserId: newUser.id,
        oldEmail: oldUser.email,
        archivedEmail,
        newRole: printerRole.shortName,
        boardsCopied: boardIds.length,
        oldDeletedAt: deletedAt,
      });
    }

    return output;
  });

  console.table(
    result.map((row) => ({
      oldUserId: row.oldUserId,
      newUserId: row.newUserId,
      oldEmail: row.oldEmail,
      archivedEmail: row.archivedEmail,
      newRole: row.newRole,
      boardsCopied: row.boardsCopied,
      oldDeletedAt: row.oldDeletedAt ? row.oldDeletedAt.toISOString() : null,
    })),
  );
}

async function main() {
  const apply = hasApplyFlag();
  const users = await loadTargetUsers();
  const printerRole = await loadPrinterRole();

  const archivedEmails = new Map<number, string>();
  for (const user of users) {
    archivedEmails.set(
      user.id,
      await resolveArchivedEmail(prisma, user.email, user.id),
    );
  }

  const plan = buildPlan({
    users,
    printerRoleShortName: printerRole.shortName,
    archivedEmails,
  });

  if (!apply) {
    printDryRun(plan);
    console.log('[dry-run] Изменения не внесены. Для применения запустите с --apply');
    return;
  }

  await applyTransfer(printerRole, users);
}

main()
  .catch((error) => {
    console.error('[transfer-users-to-printer] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
