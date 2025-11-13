import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Начинаем создание категорий EASYNEON...\n');

  // Создаем категорию "Доходы" -> "EASYNEON"
  let incomeCategory = await prisma.expenseCategory.findFirst({
    where: {
      name: 'EASYNEON',
      type: 'Доходы',
    },
  });

  if (!incomeCategory) {
    incomeCategory = await prisma.expenseCategory.create({
      data: {
        name: 'EASYNEON',
        type: 'Доходы',
      },
    });
    console.log(
      `✓ Создана категория "Доходы" -> "EASYNEON" (ID: ${incomeCategory.id})`,
    );
  } else {
    console.log(
      `✓ Категория "Доходы" -> "EASYNEON" уже существует (ID: ${incomeCategory.id})`,
    );
  }

  // Создаем категорию "Расходы" -> "EASYNEON"
  let expenseCategory = await prisma.expenseCategory.findFirst({
    where: {
      name: 'EASYNEON',
      type: 'Расходы',
    },
  });

  if (!expenseCategory) {
    expenseCategory = await prisma.expenseCategory.create({
      data: {
        name: 'EASYNEON',
        type: 'Расходы',
      },
    });
    console.log(
      `✓ Создана категория "Расходы" -> "EASYNEON" (ID: ${expenseCategory.id})`,
    );
  } else {
    console.log(
      `✓ Категория "Расходы" -> "EASYNEON" уже существует (ID: ${expenseCategory.id})`,
    );
  }

  console.log('');

  // Находим все категории типа "Доходы" без parentId
  const incomeCategoriesWithoutParent = await prisma.expenseCategory.findMany({
    where: {
      type: 'Доходы',
      parentId: null,
      id: {
        not: incomeCategory.id, // Исключаем саму созданную категорию
      },
    },
  });

  console.log(
    `Найдено категорий "Доходы" без parentId: ${incomeCategoriesWithoutParent.length}`,
  );

  if (incomeCategoriesWithoutParent.length > 0) {
    const updateIncomeResult = await prisma.expenseCategory.updateMany({
      where: {
        id: {
          in: incomeCategoriesWithoutParent.map((cat) => cat.id),
        },
      },
      data: {
        parentId: incomeCategory.id,
      },
    });

    console.log(`✓ Обновлено категорий "Доходы": ${updateIncomeResult.count}`);
  }

  // Находим все категории типа "Расходы" без parentId
  const expenseCategoriesWithoutParent = await prisma.expenseCategory.findMany({
    where: {
      type: 'Расходы',
      parentId: null,
      id: {
        not: expenseCategory.id, // Исключаем саму созданную категорию
      },
    },
  });

  console.log(
    `Найдено категорий "Расходы" без parentId: ${expenseCategoriesWithoutParent.length}`,
  );

  if (expenseCategoriesWithoutParent.length > 0) {
    const updateExpenseResult = await prisma.expenseCategory.updateMany({
      where: {
        id: {
          in: expenseCategoriesWithoutParent.map((cat) => cat.id),
        },
      },
      data: {
        parentId: expenseCategory.id,
      },
    });

    console.log(
      `✓ Обновлено категорий "Расходы": ${updateExpenseResult.count}`,
    );
  }

  console.log('');

  // Мягкое удаление доски "ИЗИБУК"
  const boardToDelete = await prisma.board.findFirst({
    where: {
      title: 'ИЗИБУК',
      deletedAt: null, // Ищем только не удаленные доски
    },
  });

  if (boardToDelete) {
    await prisma.board.update({
      where: {
        id: boardToDelete.id,
      },
      data: {
        deletedAt: new Date(),
      },
    });
    console.log(`✓ Доска "ИЗИБУК" (ID: ${boardToDelete.id}) мягко удалена`);
  } else {
    console.log('✓ Доска "ИЗИБУК" не найдена или уже удалена');
  }

  console.log('\n✓ Seed script completed successfully.');
}

main()
  .catch((e) => {
    console.error('✗ Ошибка при выполнении скрипта:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
