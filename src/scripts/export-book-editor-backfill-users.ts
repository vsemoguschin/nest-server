import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_ROLES = ['KD', 'G', 'DO', 'ROP', 'MOP', 'ROD', 'DIZ'];

function parseRoles(input?: string): string[] {
  if (!input?.trim()) return DEFAULT_ROLES;
  return input
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
}

function isTruthy(value?: string): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
}

async function main() {
  const roles = parseRoles(process.env.ONLY_ROLES);
  const includeDeleted = isTruthy(process.env.INCLUDE_DELETED);
  const withHeader = isTruthy(process.env.CSV_HEADER);

  const users = await prisma.user.findMany({
    where: {
      ...(includeDeleted ? {} : { deletedAt: null }),
      role: {
        deletedAt: null,
        shortName: { in: roles },
      },
    },
    select: {
      id: true,
      role: {
        select: { shortName: true },
      },
    },
    orderBy: { id: 'asc' },
  });

  if (withHeader) {
    process.stdout.write('userId,role\n');
  }

  for (const user of users) {
    process.stdout.write(`${user.id},${user.role.shortName}\n`);
  }

  console.error(
    [
      'Export completed',
      `count=${users.length}`,
      `roles=${roles.join(',')}`,
      `includeDeleted=${includeDeleted}`,
      `withHeader=${withHeader}`,
    ].join(' | '),
  );
}

main()
  .catch((error) => {
    console.error('Export failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

