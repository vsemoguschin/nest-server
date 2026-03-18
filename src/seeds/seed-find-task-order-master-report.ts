import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseTaskOrderId(): number | null {
  const rawValue = process.env.TASK_ORDER_ID ?? process.argv[2];
  if (!rawValue) {
    return null;
  }

  const taskOrderId = Number(rawValue);
  if (!Number.isInteger(taskOrderId) || taskOrderId <= 0) {
    return null;
  }

  return taskOrderId;
}

async function main() {
  const taskOrderId = parseTaskOrderId();

  if (!taskOrderId) {
    console.error(
      '[TaskOrder MasterReport] Укажи TASK_ORDER_ID или передай id первым аргументом.',
    );
    process.exit(1);
  }

  const order = await prisma.taskOrder.findUnique({
    where: { id: taskOrderId },
    select: {
      id: true,
      title: true,
      taskId: true,
      dealId: true,
      material: true,
      type: true,
      elements: true,
      adapter: true,
      dimmer: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!order) {
    console.log(`[TaskOrder MasterReport] TaskOrder id=${taskOrderId} не найден.`);
    return;
  }

  const reports = await prisma.masterReport.findMany({
    where: {
      orderId: taskOrderId,
    },
    select: {
      id: true,
      date: true,
      name: true,
      type: true,
      metrs: true,
      els: true,
      cost: true,
      penaltyCost: true,
      lightingType: true,
      lightingLength: true,
      lightingElements: true,
      lightingCost: true,
      comment: true,
      userId: true,
      dealId: true,
      orderId: true,
      deletedAt: true,
      user: {
        select: {
          id: true,
          fullName: true,
          workSpaceId: true,
        },
      },
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });

  console.log('[TaskOrder MasterReport] TaskOrder:');
  console.dir(order, { depth: null });

  console.log(
    `[TaskOrder MasterReport] Связанных MasterReport: ${reports.length}`,
  );

  if (reports.length > 0) {
    console.dir(reports, { depth: null });
  }
}

main()
  .catch((error) => {
    console.error('[TaskOrder MasterReport] Ошибка:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
