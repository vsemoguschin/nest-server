import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedEasyneonCategories() {
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
}

async function main() {
  await seedEasyneonCategories();

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

  // Удаление категории расходов с id=139
  const categoryToDelete = await prisma.expenseCategory.findUnique({
    where: {
      id: 139,
    },
    include: {
      children: true,
      counterPartiesIncome: true,
      counterPartiesOutcome: true,
      operationPositions: true,
    },
  });

  if (categoryToDelete) {
    // Проверяем наличие связанных записей
    const hasChildren = categoryToDelete.children.length > 0;
    const hasCounterPartiesIncome =
      categoryToDelete.counterPartiesIncome.length > 0;
    const hasCounterPartiesOutcome =
      categoryToDelete.counterPartiesOutcome.length > 0;
    const hasOperationPositions =
      categoryToDelete.operationPositions.length > 0;

    if (
      hasChildren ||
      hasCounterPartiesIncome ||
      hasCounterPartiesOutcome ||
      hasOperationPositions
    ) {
      console.log(
        `⚠ Категория расходов (ID: 139, название: "${categoryToDelete.name}") не удалена, так как имеет связанные записи:`,
      );
      if (hasChildren) {
        console.log(
          `  - Дочерние категории: ${categoryToDelete.children.length}`,
        );
      }
      if (hasCounterPartiesIncome) {
        console.log(
          `  - Контрагенты (доходы): ${categoryToDelete.counterPartiesIncome.length}`,
        );
      }
      if (hasCounterPartiesOutcome) {
        console.log(
          `  - Контрагенты (расходы): ${categoryToDelete.counterPartiesOutcome.length}`,
        );
      }
      if (hasOperationPositions) {
        console.log(
          `  - Позиции операций: ${categoryToDelete.operationPositions.length}`,
        );
      }
    } else {
      await prisma.expenseCategory.delete({
        where: {
          id: 139,
        },
      });
      console.log(
        `✓ Категория расходов (ID: 139, название: "${categoryToDelete.name}") удалена`,
      );
    }
  } else {
    console.log('✓ Категория расходов с ID 139 не найдена или уже удалена');
  }

  // Разархивация задач с указанными параметрами
  const BOARD_IDS = [3];
  const IGNORE_COLUMNS_IDS = [18, 19, 20, 21, 22, 23, 24, 104, 42];

  const archivedTasks = await prisma.kanbanTask.findMany({
    where: {
      boardId: { in: BOARD_IDS },
      columnId: { in: IGNORE_COLUMNS_IDS },
      archived: true,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  console.log(
    `\nНайдено архивированных задач для разархивации: ${archivedTasks.length}`,
  );

  if (archivedTasks.length > 0) {
    const unarchiveResult = await prisma.kanbanTask.updateMany({
      where: {
        id: {
          in: archivedTasks.map((task) => task.id),
        },
      },
      data: {
        archived: false,
      },
    });

    console.log(
      `✓ Разархивировано задач: ${unarchiveResult.count}\nДоска: ${BOARD_IDS.join(', ')}, Колонки: ${IGNORE_COLUMNS_IDS.join(', ')}`,
    );
  } else {
    console.log('✓ Нет архивированных задач для разархивации');
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
