import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function nullifyOvernightExpenseCategory() {
  const startTime = new Date();
  console.log(
    `Начинаем обработку операций с 'Овернайт' в ${startTime.toISOString()}...\n`,
  );

  // Находим все оригинальные операции из Т-Банка, у которых payPurpose содержит 'Овернайт'
  const originalOperations = await prisma.originalOperationFromTbank.findMany({
    where: {
      payPurpose: {
        contains: 'Овернайт',
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      operationId: true,
      payPurpose: true,
      operationPositions: {
        select: {
          id: true,
          expenseCategoryId: true,
        },
      },
    },
  });

  console.log(
    `Найдено оригинальных операций с 'Овернайт': ${originalOperations.length}\n`,
  );

  if (originalOperations.length === 0) {
    console.log('Нет операций для обработки.');
    return;
  }

  // Собираем все ID позиций, которые нужно обновить
  const positionIds: number[] = [];
  let totalPositions = 0;
  let positionsWithCategory = 0;

  originalOperations.forEach((operation) => {
    operation.operationPositions.forEach((position) => {
      totalPositions++;
      if (position.expenseCategoryId !== null) {
        positionsWithCategory++;
        positionIds.push(position.id);
      }
    });
  });

  console.log('=== Статистика ===');
  console.log(`Всего оригинальных операций: ${originalOperations.length}`);
  console.log(`Всего позиций: ${totalPositions}`);
  console.log(`Позиций с категорией: ${positionsWithCategory}`);
  console.log(`Позиций для обновления: ${positionIds.length}\n`);

  if (positionIds.length === 0) {
    console.log('Нет позиций с категорией для обновления.');
    return;
  }

  // Показываем примеры операций (первые 10)
  console.log('Примеры операций (первые 10):');
  console.log('-'.repeat(80));

  originalOperations.slice(0, 10).forEach((operation, index) => {
    const positionsCount = operation.operationPositions.length;
    const positionsWithCat = operation.operationPositions.filter(
      (p) => p.expenseCategoryId !== null,
    ).length;

    console.log(`\n${index + 1}. Оригинальная операция ID: ${operation.id}`);
    console.log(`   Operation ID: ${operation.operationId}`);
    console.log(`   Pay Purpose: ${operation.payPurpose}`);
    console.log(
      `   Позиций: ${positionsCount}, с категорией: ${positionsWithCat}`,
    );
  });

  if (originalOperations.length > 10) {
    console.log(`\n... и еще ${originalOperations.length - 10} операций`);
  }

  console.log('\n' + '-'.repeat(80));

  // Обновляем все позиции, устанавливая expenseCategoryId = null
  console.log('\n=== Обновление позиций ===');
  const updateResult = await prisma.operationPosition.updateMany({
    where: {
      id: {
        in: positionIds,
      },
    },
    data: {
      expenseCategoryId: null,
    },
  });

  console.log(`✓ Обновлено позиций: ${updateResult.count}\n`);

  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();

  console.log('\n=== Итоговая статистика ===');
  console.log(`Обработано оригинальных операций: ${originalOperations.length}`);
  console.log(`Обновлено позиций: ${updateResult.count}`);
  console.log(
    `Время выполнения: ${duration}ms (${(duration / 1000).toFixed(1)}с)`,
  );
}

async function main() {
  try {
    await nullifyOvernightExpenseCategory();
    console.log('\n✓ Скрипт успешно выполнен');
  } catch (error) {
    console.error('✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
