import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROOT_CATEGORY_IDS = [38, 42, 45] as const;
const TARGET_CATEGORY_NAME = 'Подписки и сервисы';

type MergeSummary = {
  createdCategoryId: number;
  mergedCategoryCount: number;
  operationPositions: number;
  counterPartiesIncome: number;
  counterPartiesOutcome: number;
  autoCategoryRules: number;
  originalOperations: number;
  sourceCategoriesSoftDeleted: number;
};

type CategoryNode = {
  id: number;
  name: string;
  type: string;
  parentId: number | null;
  deletedAt: Date | null;
};

function collectDescendantIds(
  rootIds: number[],
  childrenMap: Map<number, CategoryNode[]>,
) {
  const visited = new Set<number>();
  const stack = [...rootIds];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (currentId === undefined || visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    const children = childrenMap.get(currentId) || [];
    children.forEach((child) => {
      if (!visited.has(child.id)) {
        stack.push(child.id);
      }
    });
  }

  return Array.from(visited);
}

async function mergeExpenseCategories() {
  const rootCategories = await prisma.expenseCategory.findMany({
    where: {
      id: {
        in: [...ROOT_CATEGORY_IDS],
      },
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      type: true,
      parentId: true,
      deletedAt: true,
    },
  });

  if (rootCategories.length !== ROOT_CATEGORY_IDS.length) {
    const foundIds = new Set(rootCategories.map((category) => category.id));
    const missingIds = ROOT_CATEGORY_IDS.filter((id) => !foundIds.has(id));
    throw new Error(`Не найдены категории с ID: ${missingIds.join(', ')}`);
  }

  const categoryTypes = new Set(rootCategories.map((category) => category.type));
  if (categoryTypes.size !== 1) {
    throw new Error(
      `Категории имеют разные типы: ${Array.from(categoryTypes).join(', ')}`,
    );
  }

  const targetType = rootCategories[0].type;
  const existingTarget = await prisma.expenseCategory.findFirst({
    where: {
      name: TARGET_CATEGORY_NAME,
      type: targetType,
      deletedAt: null,
      id: {
        notIn: [...ROOT_CATEGORY_IDS],
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (existingTarget) {
    throw new Error(
      `Активная категория "${TARGET_CATEGORY_NAME}" уже существует (id=${existingTarget.id}). Остановлено во избежание дубля.`,
    );
  }

  const activeCategories = await prisma.expenseCategory.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      type: true,
      parentId: true,
      deletedAt: true,
    },
  });

  const childrenMap = new Map<number, CategoryNode[]>();
  activeCategories.forEach((category) => {
    if (category.parentId === null) return;
    if (!childrenMap.has(category.parentId)) {
      childrenMap.set(category.parentId, []);
    }
    childrenMap.get(category.parentId)!.push(category);
  });

  const sourceCategoryIds = collectDescendantIds([...ROOT_CATEGORY_IDS], childrenMap);
  const sourceCategories = activeCategories.filter((category) =>
    sourceCategoryIds.includes(category.id),
  );

  const [
    operationPositionsCount,
    counterPartiesIncomeCount,
    counterPartiesOutcomeCount,
    autoCategoryRulesCount,
    originalOperationsCount,
  ] = await Promise.all([
    prisma.operationPosition.count({
      where: {
        expenseCategoryId: {
          in: sourceCategoryIds,
        },
      },
    }),
    prisma.counterParty.count({
      where: {
        incomeExpenseCategoryId: {
          in: sourceCategoryIds,
        },
      },
    }),
    prisma.counterParty.count({
      where: {
        outcomeExpenseCategoryId: {
          in: sourceCategoryIds,
        },
      },
    }),
    prisma.autoCategoryRule.count({
      where: {
        expenseCategoryId: {
          in: sourceCategoryIds,
        },
      },
    }),
    prisma.originalOperationFromTbank.count({
      where: {
        expenseCategoryId: {
          in: sourceCategoryIds,
        },
      },
    }),
  ]);

  console.log('Подготовка к слиянию категорий:');
  console.log(
    `- roots: ${rootCategories
      .map((category) => `${category.id} (${category.name})`)
      .join(', ')}`,
  );
  console.log(`- source category ids: ${sourceCategoryIds.join(', ')}`);
  console.log(`- source category count: ${sourceCategories.length}`);
  console.log(`- new category name: ${TARGET_CATEGORY_NAME}`);
  console.log(`- operationPositions: ${operationPositionsCount}`);
  console.log(`- counterPartiesIncome: ${counterPartiesIncomeCount}`);
  console.log(`- counterPartiesOutcome: ${counterPartiesOutcomeCount}`);
  console.log(`- autoCategoryRules: ${autoCategoryRulesCount}`);
  console.log(`- originalOperationFromTbank: ${originalOperationsCount}`);

  const summary = await prisma.$transaction<MergeSummary>(async (tx) => {
    const createdCategory = await tx.expenseCategory.create({
      data: {
        name: TARGET_CATEGORY_NAME,
        type: targetType,
        description: null,
        parentId: null,
      },
      select: {
        id: true,
      },
    });

    const targetCategoryId = createdCategory.id;
    const deletedAt = new Date();

    const [
      operationPositions,
      counterPartiesIncome,
      counterPartiesOutcome,
      autoCategoryRules,
      originalOperations,
      sourceCategoriesSoftDeleted,
    ] = await Promise.all([
      tx.operationPosition.updateMany({
        where: {
          expenseCategoryId: {
            in: sourceCategoryIds,
          },
        },
        data: {
          expenseCategoryId: targetCategoryId,
        },
      }),
      tx.counterParty.updateMany({
        where: {
          incomeExpenseCategoryId: {
            in: sourceCategoryIds,
          },
        },
        data: {
          incomeExpenseCategoryId: targetCategoryId,
        },
      }),
      tx.counterParty.updateMany({
        where: {
          outcomeExpenseCategoryId: {
            in: sourceCategoryIds,
          },
        },
        data: {
          outcomeExpenseCategoryId: targetCategoryId,
        },
      }),
      tx.autoCategoryRule.updateMany({
        where: {
          expenseCategoryId: {
            in: sourceCategoryIds,
          },
        },
        data: {
          expenseCategoryId: targetCategoryId,
        },
      }),
      tx.originalOperationFromTbank.updateMany({
        where: {
          expenseCategoryId: {
            in: sourceCategoryIds,
          },
        },
        data: {
          expenseCategoryId: targetCategoryId,
          expenseCategoryName: TARGET_CATEGORY_NAME,
        },
      }),
      tx.expenseCategory.updateMany({
        where: {
          id: {
            in: sourceCategoryIds,
          },
          deletedAt: null,
        },
        data: {
          deletedAt,
        },
      }),
    ]);

    return {
      createdCategoryId: targetCategoryId,
      mergedCategoryCount: sourceCategoryIds.length,
      operationPositions: operationPositions.count,
      counterPartiesIncome: counterPartiesIncome.count,
      counterPartiesOutcome: counterPartiesOutcome.count,
      autoCategoryRules: autoCategoryRules.count,
      originalOperations: originalOperations.count,
      sourceCategoriesSoftDeleted: sourceCategoriesSoftDeleted.count,
    };
  });

  console.log('\nСлияние завершено:');
  console.log(`- created category id: ${summary.createdCategoryId}`);
  console.log(`- merged categories: ${summary.mergedCategoryCount}`);
  console.log(`- updated operationPositions: ${summary.operationPositions}`);
  console.log(
    `- updated counterPartiesIncome: ${summary.counterPartiesIncome}`,
  );
  console.log(
    `- updated counterPartiesOutcome: ${summary.counterPartiesOutcome}`,
  );
  console.log(`- updated autoCategoryRules: ${summary.autoCategoryRules}`);
  console.log(
    `- updated originalOperationFromTbank: ${summary.originalOperations}`,
  );
  console.log(
    `- soft-deleted source categories: ${summary.sourceCategoriesSoftDeleted}`,
  );
}

async function main() {
  try {
    await mergeExpenseCategories();
    console.log('\n✓ Скрипт успешно выполнен');
  } catch (error) {
    console.error('\n✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
