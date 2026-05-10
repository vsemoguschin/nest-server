/**
 * Diagnostic script: checks why makets/dealsPrice = 0 in /vk/stat for given integrations.
 *
 * Usage:
 *   npm run seed:vk-ads-stat-matching-diagnostics -- --integrationId=3
 *   npm run seed:vk-ads-stat-matching-diagnostics -- --integrationIds=3,4,5,6 --dateFrom=2026-05-06 --dateTo=2026-05-09
 *   npm run seed:vk-ads-stat-matching-diagnostics -- --integrationIds=1,2 --dateFrom=2026-05-01
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
    throw new Error(
      'Provide --integrationId=N or --integrationIds=1,2,3',
    );
  }

  if (!integrationIds.length) throw new Error('No valid integration IDs parsed');

  return { integrationIds, dateFrom, dateTo, entity };
}

async function diagnoseIntegration(
  integrationId: number,
  dateFrom: string,
  dateTo: string,
  entity: string,
  allowedStatusIds: number[],
) {
  console.log(`\n${'─'.repeat(70)}`);

  // Integration info
  const integration = await prisma.vkAdsAccountIntegration.findUnique({
    where: { id: integrationId },
    select: {
      id: true,
      name: true,
      isActive: true,
      tokenEnvKey: true,
      adSourceId: true,
      project: { select: { id: true, code: true, name: true } },
    },
  });

  if (!integration) {
    console.log(`[integrationId=${integrationId}] NOT FOUND in DB`);
    return;
  }

  const label = `integrationId=${integrationId} name="${integration.name ?? ''}" active=${integration.isActive}`;
  console.log(`[${label}]`);
  console.log(
    `  tokenEnvKey=${integration.tokenEnvKey ?? 'null'}  adSourceId=${(integration as any).adSourceId ?? 'null'}`,
  );
  if (integration.project) {
    console.log(
      `  project: id=${integration.project.id} code=${integration.project.code ?? 'null'} name=${integration.project.name ?? 'null'}`,
    );
  } else {
    console.log(`  project: NOT LINKED`);
  }

  // ── 1. VkAdsDailyStat ───────────────────────────────────────────────────
  console.log(`\n  [1] VkAdsDailyStat  entity=${entity}  ${dateFrom} … ${dateTo}`);

  const rows = await prisma.vkAdsDailyStat.findMany({
    where: {
      integrationId,
      entity,
      date: { gte: dateFrom, lte: dateTo },
    },
    select: {
      id: true,
      date: true,
      entityId: true,
      refs: true,
      spentNds: true,
      dealsPrice: true,
      makets: true,
    },
  });

  const rowCount = rows.length;
  const rowsWithRefs = rows.filter((r) => (r as any).refs?.length > 0);
  const allRefs = Array.from(
    new Set(rows.flatMap((r) => (Array.isArray((r as any).refs) ? (r as any).refs as string[] : []))),
  );
  const sumSpentNds = rows.reduce((s, r) => s + Number((r as any).spentNds || 0), 0);
  const sumDealsPrice = rows.reduce((s, r) => s + Number((r as any).dealsPrice || 0), 0);
  const sumMakets = rows.reduce((s, r) => s + Number((r as any).makets || 0), 0);

  console.log(`    rows_total=${rowCount}  rows_with_refs=${rowsWithRefs.length}  unique_refs=${allRefs.length}`);
  console.log(`    sum_spentNds=${sumSpentNds.toFixed(2)}  stored_dealsPrice=${sumDealsPrice}  stored_makets=${sumMakets}`);

  if (rowCount === 0) {
    console.log(`\n  ⚠ DIAGNOSIS: No VkAdsDailyStat rows found.`);
    console.log(`    Cause: collect hasn't been run for this integration/date range.`);
    console.log(`    Action: run seed:vk-ads-collect-one-day --integrationId=${integrationId} --dateFrom=${dateFrom} --dateTo=${dateTo}`);
    return;
  }

  if (allRefs.length > 0) {
    const sample = allRefs.slice(0, 10);
    console.log(`    sample_refs: ${sample.join(', ')}${allRefs.length > 10 ? ` … (+${allRefs.length - 10} more)` : ''}`);
  } else {
    console.log(`    refs: EMPTY`);
  }

  // ── 2. CRM matching ─────────────────────────────────────────────────────
  console.log(`\n  [2] CRM matching  refs_to_check=${allRefs.length}`);

  if (allRefs.length === 0) {
    console.log(`\n  ⚠ DIAGNOSIS: refs are empty in VkAdsDailyStat.`);
    console.log(`    Cause: UTM params (ref=xxx) are not set in VK Ads ad groups for this cabinet.`);
    console.log(`    → makets/dealsPrice cannot be computed without refs.`);
    return;
  }

  // Deals
  const deals = await prisma.deal.findMany({
    where: {
      adTag: { in: allRefs },
      client: dateFrom || dateTo
        ? {
            firstContact: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : undefined,
    },
    select: { id: true, adTag: true, price: true },
  });

  const matchedDealRefs = Array.from(new Set(deals.map((d) => d.adTag)));
  const dealIds = deals.map((d) => d.id);

  const dopSums = dealIds.length
    ? await prisma.dop.groupBy({
        by: ['dealId'],
        where: { dealId: { in: dealIds } },
        _sum: { price: true },
      })
    : [];
  const dopByDealId: Record<number, number> = {};
  for (const row of dopSums) dopByDealId[row.dealId] = Number(row._sum?.price || 0);

  let totalDealsPrice = 0;
  for (const d of deals) {
    totalDealsPrice += Number(d.price || 0) + (dopByDealId[d.id] || 0);
  }

  console.log(`    deals: found=${deals.length}  matched_refs=${matchedDealRefs.length}  total_price=${totalDealsPrice}`);
  if (matchedDealRefs.length) {
    console.log(`    matched_deal_refs: ${matchedDealRefs.slice(0, 5).join(', ')}${matchedDealRefs.length > 5 ? ' …' : ''}`);
  }

  // Makets
  let totalMakets = 0;
  const matchedMaketRefs: string[] = [];

  if (allowedStatusIds.length > 0) {
    const conds: Prisma.Sql[] = [
      Prisma.sql`t.name IN (${Prisma.join(allRefs)})`,
      Prisma.sql`c."crmStatusId" IN (${Prisma.join(allowedStatusIds)})`,
    ];
    if (dateFrom)
      conds.push(
        Prisma.sql`to_date(c."firstContactDate", 'YYYY-MM-DD') >= ${dateFrom}::date`,
      );
    if (dateTo)
      conds.push(
        Prisma.sql`to_date(c."firstContactDate", 'YYYY-MM-DD') <= ${dateTo}::date`,
      );
    const whereSql = Prisma.sql`${Prisma.join(conds, ' AND ')}`;
    const maketRows = await prisma.$queryRaw<Array<{ ref: string; cnt: bigint }>>(
      Prisma.sql`
        SELECT t.name AS ref, COUNT(DISTINCT c.id)::bigint AS cnt
        FROM "CrmCustomer" c
        JOIN "CrmCustomerTag" ct ON ct."customerId" = c.id
        JOIN "CrmTag" t ON t.id = ct."tagId"
        WHERE ${whereSql}
        GROUP BY t.name
      `,
    );
    for (const r of maketRows) {
      const cnt = Number(r.cnt || 0);
      if (cnt > 0) {
        matchedMaketRefs.push(r.ref);
        totalMakets += cnt;
      }
    }
  }

  console.log(`    makets: total=${totalMakets}  matched_refs=${matchedMaketRefs.length}`);
  if (matchedMaketRefs.length) {
    console.log(`    matched_maket_refs: ${matchedMaketRefs.slice(0, 5).join(', ')}${matchedMaketRefs.length > 5 ? ' …' : ''}`);
  }

  // Unmatched refs
  const allMatchedRefs = new Set([...matchedDealRefs, ...matchedMaketRefs]);
  const unmatchedRefs = allRefs.filter((r) => !allMatchedRefs.has(r));
  if (unmatchedRefs.length) {
    console.log(`    unmatched_refs (${unmatchedRefs.length}): ${unmatchedRefs.slice(0, 10).join(', ')}${unmatchedRefs.length > 10 ? ' …' : ''}`);
  }

  // ── 3. Diagnosis ─────────────────────────────────────────────────────────
  console.log(`\n  [3] Diagnosis`);

  const hasRefs = allRefs.length > 0;
  const hasCrmMatches = totalDealsPrice > 0 || totalMakets > 0;
  const hasStoredMetrics = sumDealsPrice > 0 || sumMakets > 0;

  if (!hasRefs) {
    // already handled above
    return;
  }

  if (hasRefs && !hasCrmMatches) {
    console.log(`    ⚠ refs exist but NO CRM matches found.`);
    console.log(`      Cause: refs in VK Ads don't correspond to any Deal.adTag or CrmTag.name in CRM.`);
    console.log(`      Check: are these ref values actually used in deals/customers for this date range?`);
    return;
  }

  if (hasRefs && hasCrmMatches && !hasStoredMetrics) {
    console.log(`    ✘ CRM matches found (dealsPrice=${totalDealsPrice}, makets=${totalMakets})`);
    console.log(`      but stored VkAdsDailyStat.dealsPrice=${sumDealsPrice}, makets=${sumMakets}`);
    console.log(`      CAUSE: collect/persist does NOT compute CRM matching — it only saves 0.`);
    console.log(`      FIX NEEDED: either compute dealsPrice/makets during collect,`);
    console.log(`                  or compute live in getFromDb() after reading refs.`);
    return;
  }

  if (hasStoredMetrics) {
    console.log(`    ✓ stored metrics OK: dealsPrice=${sumDealsPrice}, makets=${sumMakets}`);
    console.log(`      If UI still shows 0 — issue is on the read/display side.`);
  }
}

async function main() {
  const { integrationIds, dateFrom, dateTo, entity } = parseArgs();

  console.log(`[vk-ads-stat-matching-diagnostics]`);
  console.log(`  integrationIds=[${integrationIds.join(',')}]  entity=${entity}  ${dateFrom} … ${dateTo}`);

  // Pre-load allowed CRM status IDs once
  const statusRows = await prisma.crmStatus.findMany({
    where: { name: { in: ALLOWED_CRM_STATUSES } },
    select: { id: true, name: true },
  });
  const allowedStatusIds = statusRows.map((s) => s.id);
  console.log(`  allowed_crm_status_ids (${allowedStatusIds.length}): [${allowedStatusIds.join(',')}]`);

  for (const id of integrationIds) {
    await diagnoseIntegration(id, dateFrom, dateTo, entity, allowedStatusIds);
  }

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`[vk-ads-stat-matching-diagnostics] done`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[vk-ads-stat-matching-diagnostics] fatal:', e);
  process.exit(1);
});
