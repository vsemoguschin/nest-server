// Скрипт для архивации задач доски 17, у которых все записи аудита и comments старше 7 дней
// Использует raw SQL для архивации без изменения updatedAt
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function archiveBoard17Tasks() {
  const startTime = new Date();
  console.log(
    `Начинаем архивацию задач доски 17 по аудиту и comments в ${startTime.toISOString()}...\n`,
  );

  // Вычисляем дату 7 дней назад
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  console.log(
    `Ищем задачи, у которых все записи аудита и comments старше: ${sevenDaysAgo.toISOString()}\n`,
  );

  const BOARD_ID = 17;
  const IGNORE_COLUMNS_IDS: number[] = []; // Можно добавить ID колонок для исключения

  // Статистика ДО архивации
  const statsBefore = {
    total: await prisma.kanbanTask.count({
      where: {
        archived: false,
        deletedAt: null,
        boardId: BOARD_ID,
      },
    }),
    archived: await prisma.kanbanTask.count({
      where: {
        archived: true,
        deletedAt: null,
        boardId: BOARD_ID,
      },
    }),
  };

  console.log('=== Статистика ДО архивации (доска 17) ===');
  console.log(`Активных задач: ${statsBefore.total}`);
  console.log(`Уже архивированных: ${statsBefore.archived}\n`);

  // Получаем все активные задачи с их аудитом и comments
  const tasks = await prisma.kanbanTask.findMany({
    where: {
      deletedAt: null,
      archived: false,
      boardId: BOARD_ID,
      ...(IGNORE_COLUMNS_IDS.length > 0 && {
        columnId: { notIn: IGNORE_COLUMNS_IDS },
      }),
    },
    select: {
      id: true,
      title: true,
      boardId: true,
      columnId: true,
      audits: {
        select: {
          id: true,
          createdAt: true,
          action: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      comments: {
        where: {
          deletedAt: null, // Исключаем удаленные комментарии
        },
        select: {
          id: true,
          updatedAt: true,
        },
      },
    },
  });

  console.log(`Проверяем ${tasks.length} активных задач доски 17...\n`);

  const tasksToArchive: number[] = [];
  const tasksWithoutAudit: number[] = [];
  const tasksWithRecentActivity: number[] = [];
  const tasksWithRecentComments: number[] = [];

  // Проверяем каждую задачу
  for (const task of tasks) {
    // Если у задачи нет записей аудита, пропускаем
    if (task.audits.length === 0) {
      tasksWithoutAudit.push(task.id);
      continue;
    }

    // Проверяем, все ли записи аудита старше 7 дней
    const allAuditsOld = task.audits.every(
      (audit) => audit.createdAt < sevenDaysAgo,
    );

    // Проверяем, все ли comments старше 7 дней (если есть)
    const allCommentsOld =
      task.comments.length === 0 ||
      task.comments.every((comment) => comment.updatedAt < sevenDaysAgo);

    // Архивируем только если все условия выполнены
    if (allAuditsOld && allCommentsOld) {
      tasksToArchive.push(task.id);
    } else {
      if (!allAuditsOld) {
        tasksWithRecentActivity.push(task.id);
      }
      if (!allCommentsOld) {
        tasksWithRecentComments.push(task.id);
      }
    }
  }

  console.log('=== Результаты проверки ===');
  console.log(`Задач без аудита: ${tasksWithoutAudit.length}`);
  console.log(`Задач с недавним аудитом: ${tasksWithRecentActivity.length}`);
  console.log(`Задач с недавними comments: ${tasksWithRecentComments.length}`);
  console.log(`Задач для архивации: ${tasksToArchive.length}\n`);

  if (tasksToArchive.length === 0) {
    console.log('Нет задач для архивации.');
    return;
  }

  // Показываем список задач для архивации (первые 20)
  console.log('Список задач для архивации (первые 20):');
  console.log('-'.repeat(80));

  const tasksToShow = tasks
    .filter((task) => tasksToArchive.includes(task.id))
    .slice(0, 20);

  tasksToShow.forEach((task, index) => {
    const oldestAudit = task.audits[task.audits.length - 1];
    const daysSinceOldestAudit = Math.floor(
      (new Date().getTime() - oldestAudit.createdAt.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    const oldestComment =
      task.comments.length > 0
        ? task.comments.reduce((oldest, comment) =>
            comment.updatedAt < oldest.updatedAt ? comment : oldest,
          )
        : null;

    // console.log(`\n${index + 1}. Задача ID: ${task.id}`);
    // console.log(`   Название: ${task.title}`);
    // console.log(`   Доска ID: ${task.boardId}, Колонка ID: ${task.columnId}`);
    // console.log(`   Записей аудита: ${task.audits.length}`);
    // console.log(
    //   `   Самая старая запись аудита: ${oldestAudit.createdAt.toISOString()} (${daysSinceOldestAudit} дней назад)`,
    // );
    if (oldestComment) {
      const daysSinceOldestComment = Math.floor(
        (new Date().getTime() - oldestComment.updatedAt.getTime()) /
          (1000 * 60 * 60 * 24),
      );
    //   console.log(
    //     `   Comments: ${task.comments.length}, самый старый: ${oldestComment.updatedAt.toISOString()} (${daysSinceOldestComment} дней назад)`,
    //   );
    } else {
      console.log(`   Comments: нет`);
    }
  });

  if (tasksToArchive.length > 20) {
    console.log(`\n... и еще ${tasksToArchive.length - 20} задач`);
  }

  console.log('\n' + '-'.repeat(80));

  // Архивируем задачи через raw SQL без изменения updatedAt
  // ЗАКОММЕНТИРОВАНО: раскомментируйте для выполнения архивации
  console.log('\n=== Архивация задач ===');
  console.log(
    '⚠️ Архивация закомментирована для безопасности. Раскомментируйте код ниже для выполнения:',
  );

  // Раскомментируйте следующие строки для выполнения архивации:

  const archivedCount = await prisma.$executeRaw`
    UPDATE "KanbanTask"
    SET archived = true
    WHERE id = ANY(${tasksToArchive}::int[])
  `;
  console.log(`✓ Заархивировано задач: ${archivedCount}\n`);

  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();

  console.log('\n=== Итоговая статистика ===');
  console.log(`Найдено задач для архивации: ${tasksToArchive.length}`);
  console.log(
    `Время выполнения: ${duration}ms (${(duration / 1000).toFixed(1)}с)`,
  );
  console.log(
    '\n⚠️ Чтобы выполнить архивацию, раскомментируйте соответствующий блок кода.',
  );
}

async function main() {
  try {
    await archiveBoard17Tasks();
    console.log('\n✓ Скрипт успешно выполнен');
  } catch (error) {
    console.error('✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
