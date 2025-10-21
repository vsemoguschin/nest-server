import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const titleToSet = 'Без названия';

  const result = await prisma.column.updateMany({
    where: {
      title: '',
    },
    data: {
      title: titleToSet,
    },
  });

  console.log(`Updated ${result.count} columns with empty title.`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
