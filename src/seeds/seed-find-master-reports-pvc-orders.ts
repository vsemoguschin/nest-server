import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 1000);
const MAX_PRINT = Number(process.env.MAX_PRINT ?? 0);

type OrderMeta = {
  id: number;
  title: string;
  taskId: number;
  dealId: number | null;
  material: string;
  deletedAt: Date | null;
  adapter: string;
  dimmer: boolean;
};

type ReportMeta = {
  id: number;
  date: string;
  name: string;
  orderId: number | null;
  type: string;
  userId: number;
  cost: number;
  metrs: number;
  els: number;
  lightingType: string | null;
  lightingLength: number | null;
  lightingElements: number | null;
  lightingCost: number;
};

async function run() {
  const orders = await prisma.taskOrder.findMany({
    where: {
      material: 'ПВХ',
    },
    select: {
      id: true,
      title: true,
      taskId: true,
      dealId: true,
      material: true,
      deletedAt: true,
      adapter: true,
      dimmer: true,
    },
  });

  console.log(
    `[MasterReport PVC] Orders with material=ПВХ: ${orders.length}`,
  );

  if (orders.length === 0) {
    return;
  }

  const orderMap = new Map<number, OrderMeta>(
    orders.map((order) => [order.id, order]),
  );

  const orderIds = orders.map((order) => order.id);
  const reports: ReportMeta[] = [];

  for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
    const batchIds = orderIds.slice(i, i + BATCH_SIZE);
    const batchReports = await prisma.masterReport.findMany({
      where: {
        orderId: {
          in: batchIds,
        },
      },
      select: {
        id: true,
        date: true,
        name: true,
        orderId: true,
        type: true,
        userId: true,
        cost: true,
        metrs: true,
        els: true,
        lightingType: true,
        lightingLength: true,
        lightingElements: true,
        lightingCost: true,
      },
      orderBy: {
        date: 'asc',
      },
    });
    reports.push(...batchReports);
  }

  console.log(
    `[MasterReport PVC] Master reports linked to PVC orders: ${reports.length}`,
  );

  if (reports.length === 0) {
    return;
  }

  const userIds = Array.from(new Set(reports.map((report) => report.userId)));
  const users = await prisma.user.findMany({
    where: {
      id: {
        in: userIds,
      },
    },
    select: {
      id: true,
      workSpaceId: true,
    },
  });
  const userMap = new Map(users.map((user) => [user.id, user.workSpaceId]));

  let updated = 0;
  let skippedMissingUser = 0;
  let skippedMissingOrder = 0;
  let skippedNoChanges = 0;

  const calculateBaseCost = (workSpaceId: number, type: string, metrs: number, els: number) => {
    if (workSpaceId === 8) {
      switch (type) {
        case 'Стандартная':
        case 'ПВХ':
        case 'ВБ':
        case 'ОЗОН':
        case 'Подарок':
          return metrs * 60 + els * 30;
        case 'Уличная':
          return metrs * 90 + els * 45;
        case 'Уличная подсветка':
          return metrs * 54 + els * 37;
        case 'РГБ Контражур':
          return metrs * 80 + els * 67;
        case 'РГБ':
        case 'Смарт':
          return metrs * 84 + els * 42;
        case 'Контражур':
          return metrs * 36 + els * 18;
        default:
          return 0;
      }
    }

    switch (type) {
      case 'Стандартная':
      case 'ПВХ':
      case 'ВБ':
      case 'ОЗОН':
      case 'Подарок':
        return metrs * 100 + els * 50;
      case 'Уличная':
      case 'РГБ Контражур':
        return metrs * 130 + els * 70;
      case 'РГБ':
      case 'Смарт':
        return metrs * 140 + els * 150;
      case 'Контражур':
        return metrs * 60 + els * 30;
      default:
        return 0;
    }
  };

  const calculateLightingCost = (
    workSpaceId: number,
    lightingType: string | null,
    lightingLength: number | null,
    lightingElements: number | null,
  ) => {
    if (
      !lightingType ||
      lightingType === 'none' ||
      lightingType === '' ||
      !lightingLength ||
      !lightingElements
    ) {
      return 0;
    }

    if (workSpaceId === 8) {
      switch (lightingType) {
        case 'Контражур':
          return lightingLength * 36 + lightingElements * 18;
        case 'РГБ Контражур':
          return lightingLength * 80 + lightingElements * 67;
        default:
          return 0;
      }
    }

    switch (lightingType) {
      case 'Контражур':
        return lightingLength * 60 + lightingElements * 30;
      case 'РГБ Контражур':
        return lightingLength * 130 + lightingElements * 70;
      default:
        return 0;
    }
  };

  const rows = reports
    .map((report) => {
      const order = report.orderId ? orderMap.get(report.orderId) : null;
      return {
        reportId: report.id,
        date: report.date,
        orderId: report.orderId ?? 0,
        type: report.type,
        cost: report.cost,
        userId: report.userId,
        metrs: report.metrs,
        els: report.els,
        lightingType: report.lightingType,
        lightingLength: report.lightingLength,
        lightingElements: report.lightingElements,
        lightingCost: report.lightingCost,
        orderTitle: order?.title ?? '',
        taskId: order?.taskId ?? 0,
        dealId: order?.dealId ?? null,
        orderDeletedAt: order?.deletedAt ?? null,
        adapter: order?.adapter ?? '',
        dimmer: order?.dimmer ?? false,
      };
    })
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.reportId - b.reportId;
    });

  for (const row of rows) {
    const workSpaceId = userMap.get(row.userId);
    if (!workSpaceId) {
      skippedMissingUser += 1;
      continue;
    }

    const order = row.orderId ? orderMap.get(row.orderId) : null;
    if (!order) {
      skippedMissingOrder += 1;
      continue;
    }

    const nextType = 'ПВХ';
    const baseCost = calculateBaseCost(
      workSpaceId,
      nextType,
      row.metrs,
      row.els,
    );
    const surcharge =
      (order.adapter && order.adapter !== 'Нет' ? 60 : 0) +
      (order.dimmer ? 60 : 0);
    const nextCost = baseCost + surcharge;
    const nextLightingCost = calculateLightingCost(
      workSpaceId,
      row.lightingType,
      row.lightingLength,
      row.lightingElements,
    );

    if (
      nextCost === row.cost &&
      nextLightingCost === row.lightingCost &&
      row.type === nextType
    ) {
      skippedNoChanges += 1;
      continue;
    }

    await prisma.masterReport.update({
      where: { id: row.reportId },
      data: {
        type: nextType,
        cost: Math.round(nextCost),
        lightingCost: Math.round(nextLightingCost),
      },
    });
    updated += 1;
  }

  console.log(`[MasterReport PVC] Updated: ${updated}`);
  console.log(`[MasterReport PVC] Skipped missing user: ${skippedMissingUser}`);
  console.log(`[MasterReport PVC] Skipped missing order: ${skippedMissingOrder}`);
  console.log(`[MasterReport PVC] Skipped no changes: ${skippedNoChanges}`);

  const printable = MAX_PRINT > 0 ? rows.slice(0, MAX_PRINT) : rows;

  for (const row of printable) {
    console.log(
      `reportId=${row.reportId} date=${row.date} orderId=${row.orderId} type=${row.type} cost=${row.cost} userId=${row.userId} taskId=${row.taskId} dealId=${row.dealId ?? ''} deletedAt=${row.orderDeletedAt ?? ''} title="${row.orderTitle}"`,
    );
  }

  if (MAX_PRINT > 0 && rows.length > printable.length) {
    console.log(
      `[MasterReport PVC] Printed ${printable.length} of ${rows.length}. Set MAX_PRINT=0 to print all.`,
    );
  }
}

run()
  .catch((error) => {
    console.error('[MasterReport PVC] Fatal error', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
