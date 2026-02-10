import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PERIOD = process.env.PERIOD ?? new Date().toISOString().slice(0, 7);
const APPLY = ['1', 'true', 'yes'].includes(
  String(process.env.APPLY ?? '').toLowerCase(),
);
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 1000);

type ReportMeta = {
  id: number;
  date: string;
  userId: number;
  orderId: number | null;
  type: string;
  metrs: number;
  els: number;
  cost: number;
  lightingType: string | null;
  lightingLength: number | null;
  lightingElements: number | null;
  lightingCost: number;
};

const calculateBaseCost = (
  workSpaceId: number,
  type: string,
  metrs: number,
  els: number,
) => {
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

async function run() {
  console.log(`[MasterReport Recalc] period=${PERIOD} apply=${APPLY}`);

  const reports: ReportMeta[] = [];
  let skippedMissingUser = 0;
  let skippedMissingOrder = 0;
  let skippedNoChanges = 0;
  let updated = 0;

  let cursor = 0;
  while (true) {
    const batch = await prisma.masterReport.findMany({
      where: {
        date: {
          startsWith: PERIOD,
        },
        deletedAt: null,
      },
      select: {
        id: true,
        date: true,
        userId: true,
        orderId: true,
        type: true,
        metrs: true,
        els: true,
        cost: true,
        lightingType: true,
        lightingLength: true,
        lightingElements: true,
        lightingCost: true,
      },
      orderBy: {
        id: 'asc',
      },
      skip: cursor,
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;
    reports.push(...batch);
    cursor += batch.length;
  }

  console.log(`[MasterReport Recalc] Reports found: ${reports.length}`);

  if (reports.length === 0) {
    return;
  }

  const userIds = Array.from(new Set(reports.map((r) => r.userId)));
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

  const orderIds = Array.from(
    new Set(reports.map((r) => r.orderId).filter((id): id is number => !!id)),
  );
  const orders = await prisma.taskOrder.findMany({
    where: {
      id: {
        in: orderIds,
      },
    },
    select: {
      id: true,
      material: true,
      adapter: true,
      dimmer: true,
    },
  });
  const orderMap = new Map(orders.map((order) => [order.id, order]));

  let totalBefore = 0;
  let totalAfter = 0;
  let totalChanged = 0;

  for (const report of reports) {
    const workSpaceId = userMap.get(report.userId);
    if (!workSpaceId) {
      skippedMissingUser += 1;
      continue;
    }

    const order = report.orderId ? orderMap.get(report.orderId) : null;
    if (report.orderId && !order) {
      skippedMissingOrder += 1;
      continue;
    }

    const baseCost = calculateBaseCost(
      workSpaceId,
      report.type,
      report.metrs,
      report.els,
    );
    const surcharge =
      order && order.material === 'ПВХ'
        ? (order.adapter && order.adapter !== 'Нет' ? 60 : 0) +
          (order.dimmer ? 60 : 0)
        : 0;
    const nextCost = baseCost + surcharge;
    const nextLightingCost = calculateLightingCost(
      workSpaceId,
      report.lightingType,
      report.lightingLength,
      report.lightingElements,
    );

    const roundedCost = Math.round(nextCost);
    const roundedLightingCost = Math.round(nextLightingCost);

    totalBefore += report.cost + (report.lightingCost ?? 0);
    totalAfter += roundedCost + roundedLightingCost;

    const hasChanges =
      roundedCost !== report.cost ||
      roundedLightingCost !== report.lightingCost;

    if (!hasChanges) {
      skippedNoChanges += 1;
      continue;
    }

    totalChanged += 1;

    if (!APPLY) {
      continue;
    }

    await prisma.masterReport.update({
      where: { id: report.id },
      data: {
        cost: roundedCost,
        lightingCost: roundedLightingCost,
      },
    });
    updated += 1;
  }

  console.log(`[MasterReport Recalc] Total before: ${totalBefore}`);
  console.log(`[MasterReport Recalc] Total after: ${totalAfter}`);
  console.log(`[MasterReport Recalc] Delta: ${totalAfter - totalBefore}`);
  console.log(`[MasterReport Recalc] Changed: ${totalChanged}`);
  console.log(`[MasterReport Recalc] Updated: ${updated}`);
  console.log(
    `[MasterReport Recalc] Skipped missing user: ${skippedMissingUser}`,
  );
  console.log(
    `[MasterReport Recalc] Skipped missing order: ${skippedMissingOrder}`,
  );
  console.log(
    `[MasterReport Recalc] Skipped no changes: ${skippedNoChanges}`,
  );
}

run()
  .catch((error) => {
    console.error('[MasterReport Recalc] Fatal error', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
