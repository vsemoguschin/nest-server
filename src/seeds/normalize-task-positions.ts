// Скрипт для нормализации позиций задач в колонках
// Проходит по всем колонкам и перенумеровывает задачи начиная с 1, 2, 3...
// Использует raw SQL для обновления позиций без изменения updatedAt
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const POSITION_SCALE = 4;

function formatPosition(value: number): string {
  return value.toFixed(POSITION_SCALE);
}

async function main() {
  const startTime = new Date();
  console.log(
    `Начинаем нормализацию позиций задач в ${startTime.toISOString()}...\n`,
  );

  // Получаем все доски
  const boards = await prisma.board.findMany({
    select: { id: true, title: true },
  });

  let totalColumnsProcessed = 0;
  let totalTasksProcessed = 0;

  for (const board of boards) {
    console.log(`Обрабатываем доску: ${board.title} (ID: ${board.id})`);

    // Получаем все колонки в доске, отсортированные по позиции
    const columns = await prisma.column.findMany({
      where: {
        boardId: board.id,
      },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        title: true,
      },
    });

    for (const column of columns) {
      // Получаем все задачи в колонке
      const tasks = await prisma.kanbanTask.findMany({
        where: {
          boardId: board.id,
          columnId: column.id,
        },
        orderBy: { position: 'asc' },
        select: {
          id: true,
        },
      });

      if (tasks.length === 0) {
        continue;
      }

      console.log(
        `  Колонка "${column.title}": найдено задач: ${tasks.length}`,
      );

      // Перенумеровываем задачи: 1, 2, 3, 4...
      // Используем raw SQL для обновления позиций без изменения updatedAt
      for (let i = 0; i < tasks.length; i++) {
        const newPosition = i + 1;
        const formattedPosition = formatPosition(newPosition);

        // Обновляем позицию задачи через raw SQL, чтобы не изменять updatedAt
        await prisma.$executeRaw`
          UPDATE "KanbanTask"
          SET position = ${formattedPosition}::DECIMAL(10, 4)
          WHERE id = ${tasks[i].id}
        `;
      }

      totalColumnsProcessed++;
      totalTasksProcessed += tasks.length;
      console.log(`    ✓ Позиции обновлены: 1, 2, ..., ${tasks.length}\n`);
    }
  }

  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();

  console.log('\n' + '='.repeat(50));
  console.log(`✓ Нормализация завершена успешно!`);
  console.log(`  Обработано колонок: ${totalColumnsProcessed}`);
  console.log(`  Обработано задач: ${totalTasksProcessed}`);
  console.log(
    `  Время выполнения: ${duration}ms (${(duration / 1000).toFixed(1)}с)`,
  );
  console.log('='.repeat(50));
}

main()
  .catch((e) => {
    console.error('❌ Ошибка при выполнении скрипта:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
