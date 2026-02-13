// Запуск: cd crm/nest && npx ts-node src/seeds/seed-find-kanban-tasks-board-10.ts
import { PrismaClient } from '@prisma/client';
import { title } from 'process';

const prisma = new PrismaClient();

const BOARD_ID = Number(process.env.BOARD_ID ?? 10);

async function findKanbanTasks() {
  if (Number.isNaN(BOARD_ID)) {
    throw new Error('BOARD_ID должен быть числом.');
  }
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const tasks = await prisma.kanbanTask.findMany({
    where: {
      boardId: BOARD_ID,
      columnId: 68,
      deletedAt: null,
      archived: false,
      audits: {
        some: {
          action: 'MOVE_TASK',
          createdAt: {
            gte: start,
            lt: end,
          },
        },
      },
    },
    orderBy: [{ columnId: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      columnId: true,
      audits: {
        where: { action: 'MOVE_TASK' },
      },
    },
  });

  console.log(
    `KanbanTask: найдено ${tasks.length} карточек для boardId=${BOARD_ID}`,
  );
  if (!tasks.length) return;

  console.log(tasks.map((t) => 'https://easy-crm.pro/boards/10/task/' + t.id));
  // console.log(tasks.map((t) => ({ audits: t.audits, title: t.title })));
}

async function main() {
  try {
    await findKanbanTasks();
    console.log('✓ Скрипт завершен без ошибок');
  } catch (error) {
    console.error('✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
