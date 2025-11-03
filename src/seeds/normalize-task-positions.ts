// Скрипт для нормализации позиций задач в колонках
// Проходит по всем колонкам и перенумеровывает задачи начиная с 1, 2, 3...
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const POSITION_SCALE = 4;

function formatPosition(value: number): string {
  return value.toFixed(POSITION_SCALE);
}

async function main() {
  console.log('Начинаем нормализацию позиций задач...\n');

  // Получаем все доски
  const boards = await prisma.board.findMany({
    where: { deletedAt: null },
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
      for (let i = 0; i < tasks.length; i++) {
        const newPosition = i + 1;
        const formattedPosition = formatPosition(newPosition);

        // Обновляем позицию задачи
        await prisma.kanbanTask.update({
          where: { id: tasks[i].id },
          data: { position: formattedPosition },
        });
      }

      totalColumnsProcessed++;
      totalTasksProcessed += tasks.length;
      console.log(`    ✓ Позиции обновлены: 1, 2, ..., ${tasks.length}\n`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✓ Нормализация завершена успешно!`);
  console.log(`  Обработано колонок: ${totalColumnsProcessed}`);
  console.log(`  Обработано задач: ${totalTasksProcessed}`);
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
