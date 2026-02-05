import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORY_IDS = [
  143, 141, 57, 52, 72, 71, 81, 83, 84, 85, 38, 42, 45, 36, 68, 43, 138, 48,
];

async function main() {
  try {
    const categories = await prisma.expenseCategory.findMany({
      where: { id: { in: CATEGORY_IDS } },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });

    categories.forEach((category) => {
      console.log(`${category.id}: ${category.name}`);
    });
  } catch (error) {
    console.error('Ошибка при получении категорий:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
