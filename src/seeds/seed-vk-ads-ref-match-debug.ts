/**
 * Debug script: точечная диагностика matching VK Ads refs → CRM deals/tags.
 *
 * Режимы:
 *   1. БД-часть: VkAdsDailyStat rows + CRM deal/tag matching
 *   2. Live VK API: raw UTM из ad_groups, extractRefFromUtm, сравнение с БД
 *   3. Аномалии дат: saleDate < firstContact у vk_ads-* сделок
 *
 * Usage:
 *   npm run seed:vk-ads-ref-match-debug -- \
 *     --integrationId=3 \
 *     --dateFrom=2026-05-10 \
 *     --dateTo=2026-05-10 \
 *     --entity=ad_plans \
 *     --campaignId=136006657 \
 *     --bannerId=215968280 \
 *     --ref="vk_ads-136006657-215968280"
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { VkAdsService } from '../domains/vk-ads/vk-ads.service';
import { VkAdsIntegrationsService } from '../domains/vk-ads/vk-ads-integrations.service';
import { PrismaClient, Prisma } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const e = argv.find((a) => a.startsWith(`--${flag}=`));
    return e ? e.slice(flag.length + 3) : undefined;
  };

  const rawId = get('integrationId');
  if (!rawId) throw new Error('Provide --integrationId=N');

  return {
    integrationId: Number(rawId),
    dateFrom: get('dateFrom'),
    dateTo: get('dateTo'),
    entity: (get('entity') ?? 'ad_plans') as 'ad_plans' | 'ad_groups' | 'banners',
    campaignId: get('campaignId') ? Number(get('campaignId')) : undefined,
    adGroupId: get('adGroupId') ? Number(get('adGroupId')) : undefined,
    bannerId: get('bannerId') ? Number(get('bannerId')) : undefined,
    ref: get('ref'),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hr() {
  console.log('─'.repeat(70));
}

/** Same logic as VkAdsService.extractRefFromUtm (must stay in sync) */
function extractRefFromUtm(utm?: string): string | undefined {
  if (!utm || typeof utm !== 'string') return undefined;
  try {
    const parts = utm.split('&');
    for (const p of parts) {
      const eqIdx = p.indexOf('=');
      if (eqIdx < 0) continue;
      const k = p.slice(0, eqIdx);
      const v = p.slice(eqIdx + 1);
      if (k.trim().toLowerCase() === 'ref') {
        return decodeURIComponent(v.trim());
      }
    }
  } catch {}
  const idx = utm.indexOf('ref=');
  if (idx >= 0) {
    const rest = utm.slice(idx + 4);
    const amp = rest.indexOf('&');
    const raw = amp >= 0 ? rest.slice(0, amp) : rest;
    try {
      return decodeURIComponent(raw.trim());
    } catch {
      return raw.trim();
    }
  }
  return undefined;
}

function diffDays(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round((da - db) / 86_400_000);
}

// ── Section 1: VkAdsDailyStat DB ─────────────────────────────────────────────

async function sectionDb(args: ReturnType<typeof parseArgs>) {
  const { integrationId, dateFrom, dateTo, entity, campaignId, bannerId, adGroupId, ref } = args;

  console.log(`\n[1] VkAdsDailyStat — DB  entity=${entity}  ${dateFrom ?? '*'} … ${dateTo ?? '*'}`);

  const where: any = { integrationId, entity };
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = dateFrom;
    if (dateTo) where.date.lte = dateTo;
  }
  if (campaignId) where.entityId = campaignId;

  const rows = await prisma.vkAdsDailyStat.findMany({
    where,
    select: {
      id: true, integrationId: true, entity: true, entityId: true,
      date: true, refs: true, name: true, status: true,
      adGroups: true, banners: true, dealsPrice: true, makets: true, spentNds: true,
    },
    orderBy: { date: 'asc' },
  });

  console.log(`  rows_found=${rows.length}`);
  if (!rows.length) {
    console.log(`  ⚠ No rows. Check integrationId/entity/date range.`);
    return { allRefs: [] as string[], rows };
  }

  const allRefs = Array.from(new Set(rows.flatMap((r) => Array.isArray((r as any).refs) ? (r as any).refs as string[] : [])));
  console.log(`  unique_refs_across_rows=${allRefs.length}  sample: ${allRefs.slice(0, 8).join(', ')}${allRefs.length > 8 ? ' …' : ''}`);

  // Show each row
  for (const r of rows) {
    const refs: string[] = Array.isArray((r as any).refs) ? (r as any).refs : [];
    const banners: number[] = Array.isArray((r as any).banners) ? (r as any).banners : [];
    const adGroups: number[] = Array.isArray((r as any).adGroups) ? (r as any).adGroups : [];
    console.log(`  → id=${r.id} entityId=${r.entityId} date=${r.date} status=${(r as any).status ?? '?'} refs=[${refs.join(',')}] adGroups=[${adGroups.slice(0,5).join(',')}] banners=[${banners.slice(0,5).join(',')}]`);
    if (bannerId && banners.includes(bannerId)) {
      console.log(`    ^ contains bannerId=${bannerId}`);
    }
    if (adGroupId && adGroups.includes(adGroupId)) {
      console.log(`    ^ contains adGroupId=${adGroupId}`);
    }
  }

  // Check specific ref
  if (ref) {
    const matchingRows = rows.filter((r) => Array.isArray((r as any).refs) && (r as any).refs.includes(ref));
    console.log(`\n  ref_check: "${ref}" found_in_rows=${matchingRows.length}`);
    if (!matchingRows.length) {
      console.log(`  ⚠ This ref is NOT present in VkAdsDailyStat.refs for this scope.`);
      // Char analysis
      console.log(`    ref bytes: [${Array.from(ref).map(c => c.charCodeAt(0)).join(',')}]`);
      // Check similar
      const similar = allRefs.filter((r2) =>
        r2.includes('vk_ads') || (ref && r2.toLowerCase().includes(ref.slice(0,8).toLowerCase()))
      );
      if (similar.length) console.log(`    similar_refs: ${similar.slice(0,10).join(', ')}`);
    }
  }

  return { allRefs, rows };
}

// ── Section 2: CRM deal matching ──────────────────────────────────────────────

async function sectionCrmMatching(args: ReturnType<typeof parseArgs>, allRefs: string[]) {
  const { ref, dateFrom, dateTo } = args;
  const targetRef = ref;

  console.log(`\n[2] CRM Deal matching`);

  if (!targetRef && !allRefs.length) {
    console.log(`  skipped — no ref and no refs from DB`);
    return;
  }

  const refsToCheck = targetRef ? [targetRef] : allRefs.slice(0, 50);

  // 2a. Exact without date filter
  const dealsNoDate = await prisma.deal.findMany({
    where: { adTag: { in: refsToCheck } },
    select: { id: true, adTag: true, price: true, saleDate: true, client: { select: { id: true, firstContact: true } } },
  });
  console.log(`  deals_exact_no_date_filter=${dealsNoDate.length}`);

  // 2b. With client.firstContact date filter
  const clientDateWhere: any = {};
  if (dateFrom || dateTo) {
    clientDateWhere.firstContact = {};
    if (dateFrom) clientDateWhere.firstContact.gte = dateFrom;
    if (dateTo) clientDateWhere.firstContact.lte = dateTo;
  }
  const dealsWithDate = await prisma.deal.findMany({
    where: {
      adTag: { in: refsToCheck },
      ...(Object.keys(clientDateWhere).length ? { client: clientDateWhere } : {}),
    },
    select: { id: true, adTag: true, price: true, saleDate: true, client: { select: { id: true, firstContact: true } } },
  });
  console.log(`  deals_with_firstContact_filter=${dealsWithDate.length}  (dateFrom=${dateFrom ?? 'none'} dateTo=${dateTo ?? 'none'})`);

  if (dealsNoDate.length > 0 && dealsWithDate.length === 0 && (dateFrom || dateTo)) {
    console.log(`\n  ⚠ DIAGNOSIS: deals exist but firstContact filter removes ALL of them!`);
    for (const d of dealsNoDate.slice(0, 5)) {
      const fc = d.client?.firstContact ?? 'NULL';
      console.log(`    dealId=${d.id} adTag="${d.adTag}" saleDate=${d.saleDate} firstContact="${fc}"`);
    }
  } else if (dealsNoDate.length === 0 && targetRef) {
    // Raw SQL checks
    console.log(`\n  running raw SQL checks for ref="${targetRef}"…`);

    const rawExact = await prisma.$queryRaw<Array<{ id: number; adTag: string; len: number; firstContact: string }>>(
      Prisma.sql`SELECT d.id, d."adTag", length(d."adTag") AS len, c."firstContact" FROM "Deal" d JOIN "Client" c ON c.id = d."clientId" WHERE d."adTag" = ${targetRef} LIMIT 10`,
    );
    console.log(`  raw_exact=${rawExact.length}`);
    for (const r of rawExact) console.log(`    id=${r.id} adTag="${r.adTag}" len=${r.len} firstContact="${r.firstContact}"`);

    const rawTrim = await prisma.$queryRaw<Array<{ id: number; adTag: string; len: number }>>(
      Prisma.sql`SELECT d.id, d."adTag", length(d."adTag") AS len FROM "Deal" d WHERE trim(d."adTag") = ${targetRef.trim()} LIMIT 10`,
    );
    console.log(`  raw_trim=${rawTrim.length}`);

    const rawLike = await prisma.$queryRaw<Array<{ id: number; adTag: string; firstContact: string }>>(
      Prisma.sql`SELECT d.id, d."adTag", c."firstContact" FROM "Deal" d JOIN "Client" c ON c.id = d."clientId" WHERE d."adTag" LIKE 'vk_ads%' LIMIT 20`,
    );
    console.log(`  raw_like_vk_ads%=${rawLike.length}`);
    if (rawLike.length) {
      const sample = rawLike.slice(0, 5);
      for (const r of sample) console.log(`    adTag="${r.adTag}" firstContact="${r.firstContact}"`);
    }
  }
}

// ── Section 3: Live VK API ────────────────────────────────────────────────────

async function sectionLiveApi(
  args: ReturnType<typeof parseArgs>,
  vkService: VkAdsService,
  intService: VkAdsIntegrationsService,
  dbRefs: string[],
) {
  const { integrationId, dateFrom, dateTo, entity, campaignId, adGroupId, bannerId, ref } = args;

  if (!dateFrom) {
    console.log(`\n[3] Live VK API — skipped (no --dateFrom)`);
    return { diagnosis: 'ENTITY_OR_DATE_MISMATCH' as string };
  }

  console.log(`\n[3] Live VK API  entity=${entity}  ${dateFrom} … ${dateTo ?? dateFrom}`);

  let auth: { accessToken: string; baseUrl: string; tokenEnvKey?: string };
  try {
    auth = await intService.resolveIntegrationAuthContext(integrationId);
    console.log(`  auth: tokenEnvKey=${(auth as any).tokenEnvKey ?? '?'}  baseUrl=${auth.baseUrl}  token=***`);
  } catch (e: any) {
    console.log(`  ✘ auth failed: ${e?.message}`);
    return { diagnosis: 'ENTITY_OR_DATE_MISMATCH' as string };
  }

  const date_from = dateFrom;
  const date_to = dateTo ?? dateFrom;

  // 3a. Get live items for the entity
  let liveItems: any[] = [];
  try {
    let resp: any;
    const baseDto: any = { integrationId, date_from, date_to, limit: 250, offset: 0 };
    if (entity === 'ad_plans') {
      if (campaignId) baseDto.ids = String(campaignId);
      resp = await (vkService as any).getAdPlansDay(baseDto);
    } else if (entity === 'ad_groups') {
      if (adGroupId) baseDto.ids = String(adGroupId);
      resp = await (vkService as any).getAdGroupsDay(baseDto);
    } else {
      if (bannerId) baseDto.ids = String(bannerId);
      resp = await (vkService as any).getBannersDay(baseDto);
    }
    liveItems = Array.isArray(resp?.items) ? resp.items : [];
    console.log(`  live_items_count=${liveItems.length} (count=${resp?.count ?? '?'})`);
  } catch (e: any) {
    console.log(`  ✘ live fetch failed: ${e?.message}`);
  }

  // Print live items
  for (const it of liveItems.slice(0, 10)) {
    const itRefs: string[] = Array.isArray(it?.refs) ? it.refs : (it?.ref ? [it.ref] : []);
    const itBanners: number[] = Array.isArray(it?.banners) ? it.banners : [];
    const itGroups: number[] = Array.isArray(it?.ad_groups) ? it.ad_groups : [];
    console.log(`  live: id=${it?.id} status=${it?.status ?? '?'} refs=[${itRefs.join(',')}] ad_groups=[${itGroups.slice(0,5).join(',')}] banners=[${itBanners.slice(0,5).join(',')}]`);
  }

  // 3b. Ad groups with raw UTM (always useful regardless of entity)
  console.log(`\n[4] Live ad_groups UTM`);

  // Collect group ids to inspect
  const groupIdsToInspect = new Set<number>();
  if (adGroupId) groupIdsToInspect.add(adGroupId);

  // From live items
  for (const it of liveItems) {
    if (entity === 'ad_plans' && Array.isArray(it?.ad_groups)) {
      for (const g of it.ad_groups as number[]) groupIdsToInspect.add(g);
    } else if (entity === 'ad_groups' && it?.id) {
      groupIdsToInspect.add(Number(it.id));
    } else if (entity === 'banners' && it?.ad_group_id) {
      groupIdsToInspect.add(Number(it.ad_group_id));
    }
  }

  // Also from DB rows — their adGroups
  const dbAdGroupsFromRows = await prisma.vkAdsDailyStat.findMany({
    where: {
      integrationId,
      entity,
      ...(dateFrom ? { date: { gte: date_from, lte: date_to } } : {}),
      ...(campaignId ? { entityId: campaignId } : {}),
    },
    select: { adGroups: true, banners: true },
  });
  for (const r of dbAdGroupsFromRows) {
    if (Array.isArray((r as any).adGroups))
      for (const g of (r as any).adGroups as number[]) groupIdsToInspect.add(g);
  }

  let rawUtmRows: Array<{ id: number; plan_id?: number; name?: string; status?: string; utm?: string }> = [];
  if (groupIdsToInspect.size) {
    const ids = Array.from(groupIdsToInspect).slice(0, 150).join(',');
    try {
      const data: any = await axios.get(`${auth.baseUrl}/api/v2/ad_groups.json`, {
        params: { fields: 'id,name,utm,ad_plan_id,status', id: ids },
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      rawUtmRows = Array.isArray(data?.data?.items) ? data.data.items : [];
      console.log(`  utm_rows_fetched=${rawUtmRows.length}  group_ids_requested=${groupIdsToInspect.size}`);
    } catch (e: any) {
      console.log(`  ✘ ad_groups UTM fetch failed: ${e?.message}`);
    }
  } else {
    console.log(`  no group ids to inspect — skipping UTM fetch`);
  }

  const liveRefValues: string[] = [];
  let foundLiteralMacro = false;
  let foundMismatch = false;

  for (const g of rawUtmRows) {
    const rawUtm = g?.utm ?? '';
    const extracted = extractRefFromUtm(rawUtm);
    liveRefValues.push(...(extracted ? [extracted] : []));
    const hasMacro = rawUtm.includes('{{') || rawUtm.includes('%7B%7B');
    if (hasMacro) foundLiteralMacro = true;
    const bannerId_ = bannerId ? String(bannerId) : undefined;
    const campaignId_ = campaignId ? String(campaignId) : undefined;
    const refLabel = extracted ?? '(none)';

    // Check if DB has this ref
    const inDb = dbRefs.includes(extracted ?? '');

    console.log(`  grp id=${g.id} plan=${g.plan_id ?? '?'} status=${g.status ?? '?'}`);
    console.log(`    raw_utm="${rawUtm}"`);
    console.log(`    extracted_ref="${refLabel}"  in_db_refs=${inDb}`);
    if (hasMacro) {
      console.log(`    ⚠ LITERAL MACRO in utm — VK did not substitute {{campaign_id}}/{{banner_id}}`);
    }
    if (extracted && !inDb) {
      foundMismatch = true;
      console.log(`    ⚠ extracted ref not found in DB refs`);
    }
  }

  // 3c. Banner → group relation for specific bannerId
  if (bannerId) {
    console.log(`\n[5] Banner ${bannerId} relation`);
    let bannerGroupId: number | undefined;
    try {
      const bannerData: any = await axios.get(`${auth.baseUrl}/api/v2/banners.json`, {
        params: { fields: 'id,name,ad_group_id,status', id: String(bannerId) },
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      const banners = Array.isArray(bannerData?.data?.items) ? bannerData.data.items : [];
      for (const b of banners) {
        console.log(`  banner id=${b.id} name="${b.name ?? ''}" ad_group_id=${b.ad_group_id ?? '?'} status=${b.status ?? '?'}`);
        bannerGroupId = b.ad_group_id ? Number(b.ad_group_id) : undefined;
      }
    } catch (e: any) {
      console.log(`  ✘ banner fetch failed: ${e?.message}`);
    }

    if (bannerGroupId) {
      const group = rawUtmRows.find((g) => g.id === bannerGroupId);
      if (group) {
        const groupRef = extractRefFromUtm(group.utm);
        console.log(`  banner's group id=${bannerGroupId} utm="${group.utm ?? ''}" extracted_ref="${groupRef ?? '(none)'}"`);
        console.log(`  expected_banner_ref_if_from_id="${bannerId}"`);
        console.log(`  expected_banner_ref_if_from_utm="${groupRef ?? '(none)'}"`);
      } else {
        // Fetch this specific group
        try {
          const gData: any = await axios.get(`${auth.baseUrl}/api/v2/ad_groups.json`, {
            params: { fields: 'id,name,utm,ad_plan_id,status', id: String(bannerGroupId) },
            headers: { Authorization: `Bearer ${auth.accessToken}` },
          });
          const gItems = Array.isArray(gData?.data?.items) ? gData.data.items : [];
          for (const g of gItems) {
            const gRef = extractRefFromUtm(g.utm);
            console.log(`  banner's group id=${g.id} utm="${g.utm ?? ''}" extracted_ref="${gRef ?? '(none)'}"`);
            console.log(`  expected_banner_ref_if_from_id="${bannerId}"`);
            console.log(`  expected_banner_ref_if_from_utm="${gRef ?? '(none)'}"`);
            if (g.utm?.includes('{{')) {
              foundLiteralMacro = true;
              console.log(`  ⚠ LITERAL MACRO in banner's group utm`);
            }
          }
        } catch {}
      }
    }
  }

  // Determine diagnosis
  let diagnosis = 'UNKNOWN';
  if (foundLiteralMacro) {
    diagnosis = 'VK_RETURNS_LITERAL_MACRO';
  } else if (foundMismatch) {
    diagnosis = 'OUR_EXTRACTOR_OR_PERSIST_BUG';
  } else if (!rawUtmRows.length) {
    diagnosis = 'NO_REF_IN_VK';
  } else {
    diagnosis = 'MATCH_OK';
  }

  return { diagnosis, liveRefValues, foundLiteralMacro, foundMismatch };
}

// ── Section 4: Date anomalies ─────────────────────────────────────────────────

async function sectionDateAnomalies() {
  console.log(`\n[6] Deal date anomalies — adTag LIKE 'vk_ads%'`);

  const vkDeals = await prisma.deal.findMany({
    where: { adTag: { startsWith: 'vk_ads' } },
    select: {
      id: true, adTag: true, price: true, saleDate: true,
      client: { select: { id: true, firstContact: true } },
    },
    orderBy: { id: 'asc' },
  });

  console.log(`  total_vk_ads_deals=${vkDeals.length}`);

  if (!vkDeals.length) {
    console.log(`  No deals with adTag starting with 'vk_ads'`);
    return;
  }

  const withFirstContact = vkDeals.filter((d) => d.client?.firstContact);
  console.log(`  with_firstContact=${withFirstContact.length}`);

  // Anomalies: saleDate < firstContact
  const anomalies: Array<{ deal: typeof vkDeals[0]; diff: number }> = [];
  const normal: typeof vkDeals = [];
  const possibleTz: Array<{ deal: typeof vkDeals[0]; diff: number }> = [];

  for (const d of withFirstContact) {
    const fc = d.client!.firstContact;
    const sd = d.saleDate;
    if (!fc || !sd) continue;
    const diff = diffDays(sd, fc); // positive = saleDate is AFTER firstContact (normal)
    if (diff < 0) {
      const absDiff = Math.abs(diff);
      if (absDiff <= 1) {
        // Could be timezone shift (1 day)
        possibleTz.push({ deal: d, diff });
      } else {
        anomalies.push({ deal: d, diff });
      }
    } else {
      normal.push(d);
    }
  }

  console.log(`  normal=${normal.length}  anomalies=${anomalies.length}  possible_tz_shift=${possibleTz.length}`);

  if (anomalies.length) {
    const diffs = anomalies.map((a) => a.diff);
    const minDiff = Math.min(...diffs);
    const maxDiff = Math.max(...diffs);
    console.log(`  anomaly_diffDays: min=${minDiff}  max=${maxDiff}  (negative = saleDate before firstContact)`);
    console.log(`\n  ANOMALY ROWS (saleDate < firstContact, diff > 1 day):`);
    for (const a of anomalies.slice(0, 15)) {
      console.log(`    dealId=${a.deal.id} adTag="${a.deal.adTag}" saleDate=${a.deal.saleDate} firstContact="${a.deal.client?.firstContact}" diffDays=${a.diff} price=${a.deal.price} clientId=${a.deal.client?.id}`);
    }
    if (anomalies.length > 15) console.log(`    … (${anomalies.length - 15} more)`);
  }

  if (possibleTz.length) {
    console.log(`\n  POSSIBLE_TIMEZONE_SHIFT rows (diff = -1 day):`);
    for (const a of possibleTz.slice(0, 5)) {
      console.log(`    dealId=${a.deal.id} saleDate=${a.deal.saleDate} firstContact="${a.deal.client?.firstContact}" diffDays=${a.diff}`);
    }
  }

  if (normal.length) {
    console.log(`\n  SAMPLE NORMAL rows:`);
    for (const d of normal.slice(0, 5)) {
      console.log(`    dealId=${d.id} adTag="${d.adTag}" saleDate=${d.saleDate} firstContact="${d.client?.firstContact}"`);
    }
  }

  const massiveAnomaly = anomalies.length > 10;
  if (massiveAnomaly) {
    console.log(`\n  ⚠ DATA ANOMALY: ${anomalies.length} deals have saleDate BEFORE firstContact.`);
    console.log(`    This breaks attribution: client.firstContact filtering will never match these deals`);
    console.log(`    for the period when the actual sale happened.`);
  } else if (anomalies.length > 0) {
    console.log(`\n  ℹ ${anomalies.length} deals with saleDate < firstContact — isolated anomalies, likely data entry errors.`);
  } else {
    console.log(`\n  ✓ No saleDate < firstContact anomalies found.`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  console.log(`\n[vk-ads-ref-match-debug]`);
  console.log(`  integrationId=${args.integrationId}  entity=${args.entity}  ${args.dateFrom ?? '*'} … ${args.dateTo ?? '*'}`);
  if (args.campaignId) console.log(`  campaignId=${args.campaignId}`);
  if (args.adGroupId) console.log(`  adGroupId=${args.adGroupId}`);
  if (args.bannerId) console.log(`  bannerId=${args.bannerId}`);
  if (args.ref) console.log(`  ref="${args.ref}"`);
  hr();

  // Start Nest for live API
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const vkService = app.get(VkAdsService);
  const intService = app.get(VkAdsIntegrationsService);

  try {
    // Section 1: DB
    const { allRefs, rows } = await sectionDb(args);
    hr();

    // Section 2: CRM matching
    await sectionCrmMatching(args, allRefs);
    hr();

    // Section 3+4+5: Live API
    const liveResult = await sectionLiveApi(args, vkService, intService, allRefs);
    hr();

    // Section 6: Date anomalies
    await sectionDateAnomalies();
    hr();

    // ── Final diagnosis ───────────────────────────────────────────────────────
    console.log(`\n[FINAL DIAGNOSIS]`);
    console.log(`  db_refs_count=${allRefs.length}`);
    if (args.ref) {
      const refInDb = allRefs.includes(args.ref);
      console.log(`  target_ref_in_db=${refInDb}`);
    }

    const diag = liveResult?.diagnosis ?? 'NO_LIVE_DATA';

    if (diag === 'VK_RETURNS_LITERAL_MACRO') {
      console.log(`\n  ✘ VK_RETURNS_LITERAL_MACRO`);
      console.log(`    VK Ads API returns literal {{campaign_id}}/{{banner_id}} macros in ad_groups.utm.`);
      console.log(`    These are NOT substituted by VK — they are stored as-is in VkAdsDailyStat.refs.`);
      console.log(`    FIX NEEDED: either`);
      console.log(`      a) Remove macros from UTM template in VK cabinet (use static ref instead)`);
      console.log(`      b) OR set Deal.adTag = String(bannerId) instead of "vk_ads-{{campaign_id}}-{{banner_id}}")`);
      console.log(`    Most likely the UTM template in VK was set with macros expecting VK to substitute them.`);
      console.log(`    VK Ads does NOT substitute dynamic UTM macros in ad_groups.utm — only in click URLs.`);
    } else if (diag === 'OUR_EXTRACTOR_OR_PERSIST_BUG') {
      console.log(`\n  ✘ OUR_EXTRACTOR_OR_PERSIST_BUG`);
      console.log(`    VK API returns expanded ref values, but DB has different refs.`);
      console.log(`    Check: extractRefFromUtm parse logic, or persistStats overwriting refs.`);
    } else if (diag === 'NO_REF_IN_VK') {
      console.log(`\n  ✘ NO_REF_IN_VK`);
      console.log(`    VK API ad_groups have no utm/ref configured.`);
      console.log(`    Matching by ref is impossible until UTM is set in VK cabinet.`);
    } else if (diag === 'MATCH_OK') {
      console.log(`\n  ✓ Live refs match DB refs — issue may be on CRM side or date filter.`);
    }
  } finally {
    await app.close();
    await prisma.$disconnect();
  }

  console.log(`\n[vk-ads-ref-match-debug] done`);
}

main().catch((e) => {
  console.error('[vk-ads-ref-match-debug] fatal:', e);
  process.exit(1);
});
