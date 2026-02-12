import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listExpenseCategories() {
  const categories = await prisma.expenseCategory.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      id: 'asc',
    },
  });

  console.log(JSON.stringify(categories, null, 2));
}

async function main() {
  try {
    await listExpenseCategories();
  } catch (error) {
    console.error('Failed to list expense categories:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
