import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TASK_ID_REGEX = /\/task\/(\d+)/;
const buildTaskLink = (boardId: number, taskId: number) =>
  `https://easy-crm.pro/boards/${boardId}/task/${taskId}`;

const extractTaskId = (name: string): number | null => {
  const match = name.match(TASK_ID_REGEX);
  if (!match) {
    return null;
  }

  const taskId = Number(match[1]);
  if (!Number.isFinite(taskId)) {
    return null;
  }

  return taskId;
};

async function updatePackerReportsByTaskLink() {
  console.log(
    'Поиск packerReport c ссылкой easy-crm.pro и привязка к kanbanTask...',
  );

  const packerReports = await prisma.packerReport.findMany({
    where: {
      name: {
        contains: 'easy-crm.pro',
      },
    },
    orderBy: {
      id: 'desc',
    },
  });

  console.log(`Найдено packerReport: ${packerReports.length}`);

  if (packerReports.length === 0) {
    return;
  }

  let parsedLinks = 0;
  let taskFound = 0;
  let updated = 0;
  let alreadyLinked = 0;
  let noTaskIdInName = 0;
  let taskNotFound = 0;

  for (const report of packerReports) {
    const taskId = extractTaskId(report.name);
    if (!taskId) {
      noTaskIdInName += 1;
      continue;
    }

    parsedLinks += 1;

    const task = await prisma.kanbanTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      taskNotFound += 1;
      continue;
    }

    taskFound += 1;

    if (report.taskId === task.id) {
      alreadyLinked += 1;
      continue;
    }

    await prisma.packerReport.update({
      where: { id: report.id },
      data: { taskId: task.id },
    });
    updated += 1;
  }

  console.log(`Разобрано ссылок: ${parsedLinks}`);
  console.log(`Найдено kanbanTask: ${taskFound}`);
  console.log(`Обновлено packerReport: ${updated}`);
  console.log(`Уже были привязаны: ${alreadyLinked}`);
  console.log(`Нет task/id в name: ${noTaskIdInName}`);
  console.log(`Task не найдены: ${taskNotFound}`);
}

async function updateMasterReportsByTaskLink() {
  console.log(
    'Поиск masterReport c ссылкой easy-crm.pro и привязка к task orders...',
  );

  const masterReports = await prisma.masterReport.findMany({
    where: {
      name: {
        contains: 'easy-crm.pro',
      },
      orderId: null,
    },
    include: {
      user: {
        select: {
          fullName: true,
        },
      },
    },
    orderBy: {
      date: 'asc',
    },
  });

  console.log(`Найдено masterReport: ${masterReports.length}`);

  if (masterReports.length === 0) {
    return;
  }

  let parsedLinks = 0;
  let taskFound = 0;
  let updated = 0;
  let noTaskIdInName = 0;
  let taskNotFound = 0;
  let noOrders = 0;
  let noMatchingOrder = 0;
  let multipleMatchingOrders = 0;
  const noMatchingOrderDetails: string[] = [];

  for (const report of masterReports) {
    const taskId = extractTaskId(report.name);
    if (!taskId) {
      noTaskIdInName += 1;
      continue;
    }

    parsedLinks += 1;

    const task = await prisma.kanbanTask.findUnique({
      where: { id: taskId },
      include: { orders: true },
    });

    if (!task) {
      taskNotFound += 1;
      continue;
    }

    taskFound += 1;

    if (task.orders.length === 0) {
      noOrders += 1;
      continue;
    }

    const matchedOrders = task.orders.filter(
      (order) => order.elements === report.els,
    );

    if (matchedOrders.length === 0) {
      noMatchingOrder += 1;
      const taskLink = buildTaskLink(task.boardId, task.id);
      const masterName = report.user?.fullName ?? `userId:${report.userId}`;
      const orderElements = task.orders.map((order) => order.elements);
      if (
        task.orders.length === 1 &&
        task.orders[0].elements > report.els
      ) {
        continue;
      }
      noMatchingOrderDetails.push(
        `${taskLink} | мастер: ${masterName} | дата: ${report.date} | отчетId: ${report.id} | отчет.els: ${report.els} | order.elements: [${orderElements.join(', ')}]`,
      );
      continue;
    }

    if (matchedOrders.length > 1) {
      multipleMatchingOrders += 1;
    }

    const order = matchedOrders[0];
    await prisma.masterReport.update({
      where: { id: report.id },
      data: { orderId: order.id },
    });
    updated += 1;
  }

  console.log(`Разобрано ссылок: ${parsedLinks}`);
  console.log(`Найдено kanbanTask: ${taskFound}`);
  console.log(`Обновлено masterReport: ${updated}`);
  console.log(`Нет task/id в name: ${noTaskIdInName}`);
  console.log(`Task не найдены: ${taskNotFound}`);
  console.log(`Нет orders у task: ${noOrders}`);
  console.log(`Нет совпадений по elements: ${noMatchingOrder}`);
  console.log(`Несколько совпадений по elements: ${multipleMatchingOrders}`);
  if (noMatchingOrderDetails.length > 0) {
    console.log('Детали "Нет совпадений по elements":');
    for (const detail of noMatchingOrderDetails) {
      console.log(`- ${detail}`);
    }
  }
}

async function main() {
  try {
    await updatePackerReportsByTaskLink();
    await updateMasterReportsByTaskLink();
    console.log('\n✓ Скрипт успешно выполнен');
  } catch (error) {
    console.error('✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
