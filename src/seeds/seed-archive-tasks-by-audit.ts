// Скрипт для архивации задач, у которых все записи аудита и comments старше 5 дней
// Использует raw SQL для архивации без изменения updatedAt
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function archiveTasksByAudit() {
  const startTime = new Date();
  console.log(
    `Начинаем архивацию задач по аудиту и comments в ${startTime.toISOString()}...\n`,
  );

  // Вычисляем дату 5 дней назад
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  console.log(
    `Ищем задачи, у которых все записи аудита и comments старше: ${fiveDaysAgo.toISOString()}\n`,
  );

  // Статистика ДО архивации
  const statsBefore = {
    total: await prisma.kanbanTask.count({
      where: {
        archived: false,
        deletedAt: null,
      },
    }),
    archived: await prisma.kanbanTask.count({
      where: {
        archived: true,
        deletedAt: null,
      },
    }),
  };

  console.log('=== Статистика ДО архивации ===');
  console.log(`Активных задач: ${statsBefore.total}`);
  console.log(`Уже архивированных: ${statsBefore.archived}\n`);

  // Получаем все активные задачи с их аудитом и comments
  const tasks = await prisma.kanbanTask.findMany({
    where: {
      deletedAt: null,
      archived: false,
      boardId: 3,
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

  console.log(`Проверяем ${tasks.length} активных задач...\n`);

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

    // Проверяем, все ли записи аудита старше 5 дней
    const allAuditsOld = task.audits.every(
      (audit) => audit.createdAt < fiveDaysAgo,
    );

    // Проверяем, все ли comments старше 5 дней (если есть)
    const allCommentsOld =
      task.comments.length === 0 ||
      task.comments.every((comment) => comment.updatedAt < fiveDaysAgo);

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

    console.log(`\n${index + 1}. Задача ID: ${task.id}`);
    console.log(`   Название: ${task.title}`);
    console.log(`   Доска ID: ${task.boardId}, Колонка ID: ${task.columnId}`);
    console.log(`   Записей аудита: ${task.audits.length}`);
    console.log(
      `   Самая старая запись аудита: ${oldestAudit.createdAt.toISOString()} (${daysSinceOldestAudit} дней назад)`,
    );
    if (oldestComment) {
      const daysSinceOldestComment = Math.floor(
        (new Date().getTime() - oldestComment.updatedAt.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      console.log(
        `   Comments: ${task.comments.length}, самый старый: ${oldestComment.updatedAt.toISOString()} (${daysSinceOldestComment} дней назад)`,
      );
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
  const archivedCount = await prisma.$executeRaw`
    UPDATE "KanbanTask"
    SET archived = true
    WHERE id = ANY(${tasksToArchive}::int[])
  `;
  console.log(`✓ Заархивировано задач: ${archivedCount}\n`);

  // Статистика ПОСЛЕ архивации
  // const statsAfter = {
  //   total: await prisma.kanbanTask.count({
  //     where: {
  //       archived: false,
  //       deletedAt: null,
  //     },
  //   }),
  //   archived: await prisma.kanbanTask.count({
  //     where: {
  //       archived: true,
  //       deletedAt: null,
  //     },
  //   }),
  // };

  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();

  console.log('\n=== Итоговая статистика ===');
  console.log(`Найдено задач для архивации: ${tasksToArchive.length}`);
  console.log(
    `Время выполнения: ${duration}ms (${(duration / 1000).toFixed(1)}с)`,
  );
  console.log(
    '\n⚠️ Архивация закомментирована. Раскомментируйте код для выполнения архивации.',
  );
}

async function main() {
  try {
    await archiveTasksByAudit();
    console.log('\n✓ Скрипт успешно выполнен');
  } catch (error) {
    console.error('✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
