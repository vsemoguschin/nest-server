/**
 * Enrichment seed: recalculates dealsPrice and makets for stored VkAdsDailyStat rows
 * by matching refs against CRM deals/customers for each specific stat row's date.
 *
 * Business rule: Deal.client.firstContact is the attribution date —
 * it must fall within the stat row's date (single-day window per row).
 *
 * Usage:
 *   npm run seed:vk-ads-enrich-daily-stat-crm-metrics -- --integrationIds=3,4,5,6 --dateFrom=2026-01-01 --dateTo=2026-05-10
 *   npm run seed:vk-ads-enrich-daily-stat-crm-metrics -- --integrationIds=3 --dateFrom=2026-05-10 --dateTo=2026-05-10 --dryRun=true
 *   npm run seed:vk-ads-enrich-daily-stat-crm-metrics -- --integrationIds=3 --entity=ad_groups --dateFrom=2026-05-01
 */

import { PrismaClient, Prisma } from '@prisma/client';

const ALLOWED_CRM_STATUSES = [
  'Макет нарисован',
  'ХОЧЕТ КУПИТЬ',
  'Бизнес макет',
  'Личный контакт',
  'Ожидаем предоплату',
  'Бронь цены',
  'Предоплата получена',
  'Заказ оплачен полностью',
  'Заказ отправлен',
  'Не оплачивает',
  'Ждем отзыв',
  'Постоянник',
  'Постоянник (начало)',
  'Постоянник (макет)',
  'Постоянник (хочет)',
  'Проблемный клиент',
  'Заказ доставлен',
];

const prisma = new PrismaClient();

function parseArgs(): {
  integrationIds: number[];
  dateFrom: string;
  dateTo: string;
  entity: string;
  dryRun: boolean;
} {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const e = argv.find((a) => a.startsWith(`--${flag}=`));
    return e ? e.slice(flag.length + 3) : undefined;
  };

  const today = new Date().toISOString().slice(0, 10);
  const dateTo = get('dateTo') ?? today;
  const dateFrom = get('dateFrom') ?? dateTo;
  const entity = get('entity') ?? 'ad_plans';
  const dryRun = (get('dryRun') ?? 'false') === 'true';

  const rawId = get('integrationId');
  const rawIds = get('integrationIds');

  let integrationIds: number[];
  if (rawId) {
    integrationIds = [Number(rawId)];
  } else if (rawIds) {
    integrationIds = rawIds
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  } else {
    throw new Error('Provide --integrationId=N or --integrationIds=1,2,3');
  }

  if (!integrationIds.length) throw new Error('No valid integration IDs parsed');

  return { integrationIds, dateFrom, dateTo, entity, dryRun };
}

async function computeCrmMetricsForRefs(
  refs: string[],
  rowDate: string,
  allowedStatusIds: number[],
): Promise<{ dealsPrice: number; makets: number }> {
  if (!refs.length) return { dealsPrice: 0, makets: 0 };

  // Deals: adTag IN refs AND client.firstContact = rowDate (single-day attribution)
  const deals = await prisma.deal.findMany({
    where: {
      adTag: { in: refs },
      client: {
        firstContact: { gte: rowDate, lte: rowDate },
      },
    },
    select: { id: true, price: true },
  });

  let dealsPrice = 0;
  if (deals.length) {
    const dealIds = deals.map((d) => d.id);
    const dopSums = await prisma.dop.groupBy({
      by: ['dealId'],
      where: { dealId: { in: dealIds } },
      _sum: { price: true },
    });
    const dopByDealId: Record<number, number> = {};
    for (const row of dopSums) dopByDealId[row.dealId] = Number(row._sum?.price || 0);
    for (const d of deals) {
      dealsPrice += Number(d.price || 0) + (dopByDealId[d.id] || 0);
    }
  }

  // Makets: CrmCustomer with allowed status, tagged with refs, firstContactDate = rowDate
  let makets = 0;
  if (allowedStatusIds.length > 0) {
    const conds: Prisma.Sql[] = [
      Prisma.sql`t.name IN (${Prisma.join(refs)})`,
      Prisma.sql`c."crmStatusId" IN (${Prisma.join(allowedStatusIds)})`,
      Prisma.sql`to_date(c."firstContactDate", 'YYYY-MM-DD') = ${rowDate}::date`,
    ];
    const maketRows = await prisma.$queryRaw<Array<{ cnt: bigint }>>(
      Prisma.sql`
        SELECT COUNT(DISTINCT c.id)::bigint AS cnt
        FROM "CrmCustomer" c
        JOIN "CrmCustomerTag" ct ON ct."customerId" = c.id
        JOIN "CrmTag" t ON t.id = ct."tagId"
        WHERE ${Prisma.join(conds, ' AND ')}
      `,
    );
    makets = Number(maketRows[0]?.cnt || 0);
  }

  return { dealsPrice, makets };
}

async function enrichIntegration(
  integrationId: number,
  dateFrom: string,
  dateTo: string,
  entity: string,
  allowedStatusIds: number[],
  dryRun: boolean,
): Promise<{ updated: number; skipped: number }> {
  const rows = await prisma.vkAdsDailyStat.findMany({
    where: {
      integrationId,
      entity,
      date: { gte: dateFrom, lte: dateTo },
    },
    select: { id: true, date: true, entityId: true, refs: true, dealsPrice: true, makets: true },
    orderBy: { date: 'asc' },
  });

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const refs = Array.isArray(row.refs) ? (row.refs as string[]) : [];
    if (!refs.length) {
      skipped++;
      continue;
    }

    const { dealsPrice, makets } = await computeCrmMetricsForRefs(
      refs,
      row.date,
      allowedStatusIds,
    );

    const prevDealsPrice = Number(row.dealsPrice || 0);
    const prevMakets = Number(row.makets || 0);

    if (dealsPrice === prevDealsPrice && makets === prevMakets) {
      skipped++;
      continue;
    }

    if (!dryRun) {
      await prisma.vkAdsDailyStat.update({
        where: { id: row.id },
        data: { dealsPrice, makets },
      });
    }

    console.log(
      `  [${dryRun ? 'dry' : 'upd'}] id=${row.id} date=${row.date} entityId=${row.entityId}` +
      ` dealsPrice: ${prevDealsPrice} → ${dealsPrice}  makets: ${prevMakets} → ${makets}` +
      ` refs_count=${refs.length}`,
    );
    updated++;
  }

  return { updated, skipped };
}

async function main() {
  const { integrationIds, dateFrom, dateTo, entity, dryRun } = parseArgs();

  console.log(`[vk-ads-enrich-daily-stat-crm-metrics]`);
  console.log(
    `  integrationIds=[${integrationIds.join(',')}]  entity=${entity}  ${dateFrom} … ${dateTo}  dryRun=${dryRun}`,
  );

  const statusRows = await prisma.crmStatus.findMany({
    where: { name: { in: ALLOWED_CRM_STATUSES } },
    select: { id: true },
  });
  const allowedStatusIds = statusRows.map((s) => s.id);
  console.log(`  allowed_crm_status_ids: ${allowedStatusIds.length}`);

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const integrationId of integrationIds) {
    console.log(`\n[integrationId=${integrationId}]`);
    const { updated, skipped } = await enrichIntegration(
      integrationId,
      dateFrom,
      dateTo,
      entity,
      allowedStatusIds,
      dryRun,
    );
    console.log(`  done: updated=${updated} skipped=${skipped}`);
    totalUpdated += updated;
    totalSkipped += skipped;
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(
    `[done] totalUpdated=${totalUpdated} totalSkipped=${totalSkipped}${dryRun ? '  (DRY RUN — no writes)' : ''}`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[vk-ads-enrich-daily-stat-crm-metrics] fatal:', e);
  process.exit(1);
});
