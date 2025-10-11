import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const { count } = await prisma.managerReport.updateMany({
    where: {
      shiftCost: 800,
      user: {
        groupId: {
          not: 19,
        },
      },
    },
    data: {
      isIntern: true,
    },
  });

  console.log(`Updated ${count} manager reports`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
