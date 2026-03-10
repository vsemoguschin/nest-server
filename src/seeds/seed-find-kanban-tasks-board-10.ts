// Запуск: cd crm/nest && npx ts-node src/seeds/seed-find-kanban-tasks-board-10.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BOARD_ID = Number(process.env.BOARD_ID ?? 3);
const USER_ID = Number(process.env.USER_ID ?? 75);

async function findKanbanTasks() {
  if (Number.isNaN(BOARD_ID) || Number.isNaN(USER_ID)) {
    throw new Error('BOARD_ID и USER_ID должны быть числами.');
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const tasks = await prisma.kanbanTask.findMany({
    where: {
      boardId: BOARD_ID,
      deletedAt: null,
      archived: false,
      audits: {
        some: {
          action: 'MOVE_TASK',
          userId: USER_ID,
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
        where: {
          action: 'MOVE_TASK',
          userId: USER_ID,
          createdAt: {
            gte: start,
            lt: end,
          },
        },
      },
    },
  });

  console.log(
    `KanbanTask: найдено ${tasks.length} карточек за сегодня для boardId=${BOARD_ID}, перемещённых пользователем userId=${USER_ID}`,
  );
  if (!tasks.length) return;

  console.log(
    tasks.map((t) => `https://easy-crm.pro/boards/${BOARD_ID}/task/${t.id}`),
  );
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
