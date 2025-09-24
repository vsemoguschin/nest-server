import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.updateMany({
    where: {
      email: {
        in: ['Dima123perm', 'art_riskov'],
      },
    },
    data: {
      deletedAt: null,
    },
  });
  console.log(users);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
