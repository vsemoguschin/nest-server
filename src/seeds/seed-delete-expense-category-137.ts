import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const categoryId = 137;

  console.log(`Начинаем обработку expenseCategory с id = ${categoryId}`);

  // Проверяем, существует ли категория
  const category = await prisma.expenseCategory.findUnique({
    where: { id: categoryId },
  });

  if (!category) {
    console.log(`Категория с id = ${categoryId} не найдена`);
    return;
  }

  console.log(`Найдена категория: "${category.name}" (id: ${category.id})`);

  // Находим все позиции операций с expenseCategoryId = 137
  const positionsToUpdate = await prisma.operationPosition.findMany({
    where: {
      expenseCategoryId: categoryId,
    },
  });

  console.log(
    `Найдено позиций операций с expenseCategoryId = ${categoryId}: ${positionsToUpdate.length}`,
  );

  // Обновляем все позиции, устанавливая expenseCategoryId = null
  if (positionsToUpdate.length > 0) {
    const updateResult = await prisma.operationPosition.updateMany({
      where: {
        expenseCategoryId: categoryId,
      },
      data: {
        expenseCategoryId: null,
      },
    });

    console.log(`Обновлено позиций: ${updateResult.count}`);
  }

  // Удаляем категорию
  await prisma.expenseCategory.delete({
    where: { id: categoryId },
  });

  console.log(`Категория с id = ${categoryId} успешно удалена`);

  console.log('Скрипт завершен успешно');
}

main()
  .catch((error) => {
    console.error('Ошибка выполнения скрипта:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
