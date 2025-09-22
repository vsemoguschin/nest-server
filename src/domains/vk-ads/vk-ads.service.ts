import axios, { AxiosInstance } from 'axios';
import { Injectable, HttpException } from '@nestjs/common';
import {
  StatisticsDayAdPlansDto,
  StatisticsDayGroupsDto,
  StatsDayResponse,
} from './dto/statistics-day.dto';
import { AdPlan } from './dto/ad-plans.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

type VkError = { error?: { message?: string; code?: string } };

const VK_ERR_TO_HTTP: Record<string, number> = {
  ERR_WRONG_PARAMETER: 400,
  ERR_LIMIT_EXCEEDED: 400,
  ERR_WRONG_DATE: 400,
  ERR_WRONG_BANNERS: 400,
  ERR_WRONG_ADGROUPS: 400,
  ERR_WRONG_ADPLANS: 400,
  ERR_WRONG_USERS: 400,
  ERR_ACCESS_DENIED: 403,
  ERR_WRONG_RESOURCE: 404,
  ERR_WRONG_IDS: 404,
  ERR_INTERNAL: 500,
};

@Injectable()
export class VkAdsService {
  private http: AxiosInstance;
  private host: string;
  private readonly VK_ADS_TOKEN = process.env.VK_ADS_TOKEN;

  private readonly VK_ADS_API_HOST = process.env.VK_ADS_API_HOST;

  // In-memory cache and helpers for heavy operations
  private cache = new Map<string, { ts: number; ttl: number; value: any }>();
  private readonly DEFAULT_TTL = 2 * 60 * 1000; // 2 minutes
  private inflight = new Map<string, Promise<any>>();

  constructor(private readonly prisma: PrismaService) {
    this.http = axios.create({
      baseURL: this.VK_ADS_API_HOST,
      headers: { Authorization: `Bearer ${this.VK_ADS_TOKEN}` },
      timeout: 20000,
    });
  }
  private async getAllAdPlanIdsCsv(statusesFilter?: string[]): Promise<{
    idsCsv: string;
    statusById: Record<number, string>;
    nameById: Record<number, string>;
  }> {
    const limit = 250;
    const statuses =
      statusesFilter && statusesFilter.length
        ? statusesFilter
        : ['active', 'blocked', 'deleted'];
    const ids: number[] = [];
    const statusById: Record<number, string> = {};
    const nameById: Record<number, string> = {};
    try {
      const cacheKey = ['ids', 'ad_plans', ...statuses].join('|');
      const cached = this.getCache<{
        ids: number[];
        statusById: Record<number, string>;
        nameById: Record<number, string>;
      }>(cacheKey);
      if (cached)
        return {
          idsCsv: cached.ids.join(','),
          statusById: cached.statusById,
          nameById: cached.nameById,
        };
      for (const st of statuses) {
        let offset = 0;
        let total = Infinity;
        while (offset < total) {
          const data = await this.getWithRetry(`/api/v2/ad_plans.json`, {
            limit,
            offset,
            _status: st,
          });
          // console.log(data);
          const items: any[] = (data as any)?.items ?? [];
          const count: number =
            typeof (data as any)?.count === 'number'
              ? (data as any).count
              : items.length + offset;
          total = count;
          for (const it of items) {
            if (it && typeof it.id === 'number') {
              ids.push(it.id);
              statusById[it.id] = st;
              if (typeof it.name === 'string') nameById[it.id] = it.name;
            }
          }
          if (!items.length) break;
          offset += items.length;
        }
      }
      this.setCache(cacheKey, {
        ids: ids.slice(),
        statusById: { ...statusById },
        nameById: { ...nameById },
      });
      return { idsCsv: ids.join(','), statusById, nameById };
    } catch (e) {
      this.handleError(e);
    }
  }

  private getCache<T = any>(key: string): T | undefined {
    const rec = this.cache.get(key);
    if (!rec) return undefined;
    if (Date.now() - rec.ts > rec.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    return rec.value as T;
  }

  private setCache<T = any>(key: string, value: T, ttl = this.DEFAULT_TTL) {
    this.cache.set(key, { ts: Date.now(), ttl, value });
  }

  private async getOrJoinInflight<T>(
    key: string,
    factory: () => Promise<T>,
  ): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const p = (async () => {
      try {
        return await factory();
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  private parseStatusesFilter(
    input?: string,
    allowed = ['active', 'blocked', 'deleted'],
  ): string[] | undefined {
    if (!input || input === 'all') return undefined;
    const set = new Set<string>();
    for (const s of String(input)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)) {
      if (allowed.includes(s)) set.add(s);
    }
    return set.size ? Array.from(set) : undefined;
  }

  private async mapPool<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, idx: number) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let i = 0;
    const runner = async (): Promise<void> => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        results[idx] = await fn(items[idx], idx);
      }
    };
    const workers = Array.from(
      { length: Math.min(limit, Math.max(1, items.length)) },
      () => runner(),
    );
    await Promise.all(workers);
    return results;
  }

  private wait(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  private parseRetryAfter(header?: string): number | undefined {
    if (!header) return undefined;
    const n = Number(header);
    if (!Number.isNaN(n)) return Math.max(0, n) * 1000; // seconds → ms
    const dt = Date.parse(header);
    if (!Number.isNaN(dt)) {
      const delta = dt - Date.now();
      return delta > 0 ? delta : undefined;
    }
    return undefined;
  }

  private async getWithRetry<T = any>(
    url: string,
    params: any,
    retries = 4,
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        const { data } = await this.http.get(url, { params });
        // console.log(url, params);
        return data as T;
      } catch (e: any) {
        const status = e?.response?.status;
        const retryAfter = this.parseRetryAfter(
          e?.response?.headers?.['retry-after'] ||
            e?.response?.headers?.['Retry-After'],
        );
        const shouldRetry = status === 429 || (status >= 500 && status < 600);
        if (!shouldRetry || attempt >= retries) throw e;
        const base = 300; // ms
        const backoff = retryAfter ?? base * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 100);
        await this.wait(backoff + jitter);
        attempt++;
      }
    }
  }

  private splitIdsCsv(idsCsv?: string): number[] {
    if (!idsCsv) return [];
    return String(idsCsv)
      .split(',')
      .map((s) => Number(String(s).trim()))
      .filter((n) => Number.isFinite(n));
  }

  private async fetchStatsAggregated(
    entity: string,
    ids: number[],
    q: any,
  ): Promise<StatsDayResponse> {
    const url = `/api/v3/statistics/${entity}/day.json`;
    const chunkSize = 150; // keep well under any 200-id limits and URL length
    const perPage = 250;
    const allItems: any[] = [];
    // aggregate top-level total across chunks/items
    const aggTotal: any = {};
    const addTotals = (dst: any, src: any) => {
      if (!src || typeof src !== 'object') return dst;
      for (const k of Object.keys(src)) {
        const sv = (src as any)[k];
        if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
          dst[k] = addTotals(dst[k] || {}, sv);
        } else {
          const n =
            typeof sv === 'string'
              ? Number(sv)
              : typeof sv === 'number'
                ? sv
                : Number(sv);
          if (Number.isFinite(n)) dst[k] = (Number(dst[k]) || 0) + n;
        }
      }
      return dst;
    };
    const baseParams: any = {
      id_ne: q.id_ne,
      date_from: q.date_from,
      date_to: q.date_to,
      fields: q.fields || 'base',
      attribution: q.attribution || 'conversion',
      banner_status: q.banner_status,
      banner_status_ne: q.banner_status_ne,
      ad_group_status: q.ad_group_status,
      ad_group_status_ne: q.ad_group_status_ne,
      ad_group_id: q.ad_group_id,
      ad_group_id_ne: q.ad_group_id_ne,
      package_id: q.package_id,
      package_id_ne: q.package_id_ne,
      sort_by: q.sort_by || 'base.clicks',
      d: q.d || 'desc',
    };
    // console.log('baseParams: ', baseParams);

    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += chunkSize)
      chunks.push(ids.slice(i, i + chunkSize));

    // Cache key for aggregate (without sort/paging)
    const cacheKey = [
      'agg',
      entity,
      q.date_from ?? '',
      q.date_to ?? '',
      q.fields || 'base',
      q.attribution || 'conversion',
      q.banner_status || '',
      q.banner_status_ne || '',
      q.ad_group_status || '',
      q.ad_group_status_ne || '',
      q.ad_group_id || '',
      q.ad_group_id_ne || '',
      q.package_id || '',
      q.package_id_ne || '',
      `ids:${ids.length}:${ids.slice(0, 50).join(',')}`,
    ].join('|');

    const cached = this.getCache<{ items: any[]; total: any }>(cacheKey);
    if (cached) {
      allItems.push(...cached.items);
      addTotals(aggTotal, cached.total);
    } else {
      // Avoid stampede: only one aggregate build per key at a time
      await this.getOrJoinInflight(cacheKey, async () => {
        const pool = Math.max(1, Number(process.env.VK_ADS_AGG_POOL) || 3);
        const results = await this.mapPool(chunks, pool, async (chunk) => {
          const data = await this.getWithRetry(
            url,
            {
              ...baseParams,
              id: chunk.join(','),
              limit: perPage,
              offset: 0,
            },
            6,
          );
          return data as any;
        });
        for (const data of results) {
          const items = (data as any)?.items ?? [];
          allItems.push(...items);
          if ((data as any)?.total) addTotals(aggTotal, (data as any).total);
        }
        this.setCache(cacheKey, {
          items: allItems.slice(),
          total: { ...aggTotal },
        });
        return null;
      });
    }

    // Global sort across aggregated chunks to emulate server-side sorting
    const sortBy: string = q.sort_by || 'base.clicks';
    const dir: 'asc' | 'desc' = (q.d || 'desc') === 'asc' ? 'asc' : 'desc';
    const getVal = (it: any): number => {
      try {
        // Expecting metric under total, e.g. total.base.clicks
        const [group, field] = String(sortBy).split('.', 2);
        const v = it?.total?.[group]?.[field];
        const n =
          typeof v === 'string'
            ? Number(v)
            : typeof v === 'number'
              ? v
              : Number(v);
        return Number.isFinite(n) ? n : 0;
      } catch {
        return 0;
      }
    };
    allItems.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va === vb) return 0;
      return dir === 'asc' ? va - vb : vb - va;
    });

    const reqLimit: number = Math.min(Math.max(Number(q.limit || 20), 1), 250);
    const reqOffset: number = Math.max(Number(q.offset || 0), 0);
    const sliced = allItems.slice(reqOffset, reqOffset + reqLimit);

    return {
      items: sliced,
      count: allItems.length,
      limit: reqLimit,
      offset: reqOffset,
      total: aggTotal,
    } as StatsDayResponse;
  }

  private handleError(e: any): never {
    const data: VkError = e?.response?.data ?? {};
    const code = data?.error?.code;
    const message = data?.error?.message || e.message || 'VK Ads error';
    if (code && VK_ERR_TO_HTTP[code])
      throw new HttpException({ code, message }, VK_ERR_TO_HTTP[code]);
    const status = e?.response?.status ?? 500;
    throw new HttpException({ code: code || 'ERR_INTERNAL', message }, status);
  }

  private ensureDateRange(daysFrom: string, daysTo?: string) {
    if (!daysFrom || !daysTo) return;
    const from = new Date(daysFrom + 'T00:00:00Z');
    const to = new Date(daysTo + 'T00:00:00Z');
    const diff =
      Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diff > 366) {
      throw new HttpException(
        {
          code: 'ERR_LIMIT_EXCEEDED',
          message: 'Date range must be <= 366 days',
        },
        400,
      );
    }
  }

  // Specialized version of getV3Day for ad_plans (entity is implicit)
  async getAdPlansDay(
    q: StatisticsDayAdPlansDto,
  ): Promise<StatsDayResponse<{ status?: string; name?: string }>> {
    const url = `/api/v3/statistics/ad_plans/day.json`;
    // const { data } = await this.http.get(url, {
    // });
    try {
      let idsParam: string | undefined;
      let adPlanStatuses: Record<number, string> | undefined;
      let adPlanNames: Record<number, string> | undefined;

      // Auto-populate with all ad plan IDs and collect status when ids not provided
      if (!idsParam) {
        const adPlanStatusesFilter = this.parseStatusesFilter(q.status);
        const meta = await this.getAllAdPlanIdsCsv(adPlanStatusesFilter);
        idsParam = meta.idsCsv;
        adPlanStatuses = meta.statusById;
        adPlanNames = meta.nameById;
        if (!idsParam) {
          throw new HttpException(
            { code: 'ERR_WRONG_IDS', message: 'Рекламные кампании не найдены' },
            404,
          );
        }
      }
      this.ensureDateRange(q.date_from, q.date_to);

      // If URL risks being too long, or too many ids, fetch in chunks and aggregate
      const idsList = this.splitIdsCsv(idsParam);
      const needsAggregate =
        idsList.length > 200 || String(idsParam || '').length > 1500;
      let data: any;
      if (needsAggregate) {
        const q2: any = {
          date_from: q.date_from,
          date_to: q.date_to,
          fields: 'base',
          attribution: 'conversion',
          sort_by: 'base.shows',
          d: q.d || 'desc',
          ad_group_status: q.status,
        };
        data = await this.fetchStatsAggregated('ad_plans', idsList, q2);
      } else {
        data = await this.getWithRetry(url, {
          id: idsParam,
          date_from: q.date_from,
          date_to: q.date_to,
          fields: 'base',
          attribution: 'conversion',
          ad_group_status: q.status,
          sort_by: 'base.shows',
          d: q.d || 'desc',
          limit: q.limit || 250,
          offset: q.offset || 0,
        });
      }

      // Enrich each item with ad plan status and name when applicable
      if (Array.isArray((data as any)?.items)) {
        for (const it of (data as any).items as Array<{
          id: number | string;
          status?: string;
          name?: string;
        }>) {
          const idNum = typeof it?.id === 'number' ? it.id : Number(it?.id);
          if (!Number.isNaN(idNum)) {
            if (adPlanStatuses && adPlanStatuses[idNum])
              it.status = adPlanStatuses[idNum];
            if (adPlanNames && adPlanNames[idNum]) it.name = adPlanNames[idNum];
          }
        }
      }
      return data as StatsDayResponse<{ status?: string; name?: string }>;
    } catch (e) {
      this.handleError(e);
    }
  }

  // Fetch ad group meta (name, status) for a given id list, including all statuses
  private async getAdGroupsMetaByIds(ids: number[]): Promise<{
    nameById: Record<number, string>;
  }> {
    const nameById: Record<number, string> = {};
    if (!ids.length) return { nameById };
    const chunkSize = 200;
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += chunkSize)
      chunks.push(ids.slice(i, i + chunkSize));
    const pool = Math.max(1, Number(process.env.VK_ADS_META_POOL) || 3);
    const results = await this.mapPool(chunks, pool, async (chunk) => {
      const params: any = {
        limit: Math.min(250, chunk.length),
        offset: 0,
        _id__in: chunk.join(','),
        _status__in: 'active,blocked,deleted',
      };
      const data = await this.getWithRetry(`/api/v2/ad_groups.json`, params, 5);
      return data as any;
    });
    for (const data of results) {
      const items: any[] = (data as any)?.items ?? [];
      for (const it of items) {
        if (it && typeof it.id === 'number') {
          if (typeof it.name === 'string') nameById[it.id] = it.name;
        }
      }
    }
    return { nameById };
  }

  // Get ad_groups stats for a given ad_plan id: fetch groups, then delegate to v3 stats with explicit ids
  async getAdPlanGroupsStats(
    adPlanId: number,
    q: StatisticsDayGroupsDto,
  ): Promise<
    StatsDayResponse<{
      status?: string;
      name?: string;
      budget_limit_day?: string | number;
      dealsPrice?: number;
      ref?: string;
      makets?: number;
      spent_nds?: number;
      maketPrice?: number;
      adExpenses?: number;
      drr?: number;
    }>
  > {
    try {
      // Fetch the ad plan with groups list; try both 'groups' and 'ad_groups'
      const adPlan = await this.getAdPlanGroupsData(adPlanId, q.status);
      // console.log(adPlan);
      // console.log(adPlan.ad_groups);
      const groupsRaw: any = (adPlan as any)?.items;
      if (!Array.isArray(groupsRaw) || groupsRaw.length === 0) {
        return {
          items: [],
          count: 0,
          limit: (q as any)?.limit ?? 20,
          offset: (q as any)?.offset ?? 0,
        };
      }
      const groupIds: number[] = groupsRaw
        .map((g: any) =>
          typeof g === 'number'
            ? g
            : typeof g?.id === 'number'
              ? g.id
              : Number(g?.id),
        )
        .filter((n: any) => Number.isFinite(n) && n > 0);
      if (!groupIds.length) {
        return {
          items: [],
          count: 0,
          limit: (q as any)?.limit ?? 20,
          offset: (q as any)?.offset ?? 0,
        };
      }

      // Build meta maps from the ad groups detail response (name, budget_limit_day, utm ref)
      const nameById: Record<number, string | undefined> = {};
      const budgetLimitDayById: Record<number, string | number | undefined> =
        {};
      const refById: Record<number, string | undefined> = {};
      const uniqueRefs = new Set<string>();
      for (const g of groupsRaw) {
        const idNum = typeof g?.id === 'number' ? g.id : Number(g?.id ?? NaN);
        if (!Number.isFinite(idNum)) continue;
        if (typeof g?.name === 'string') nameById[idNum] = g.name;
        if (g?.budget_limit_day !== undefined)
          budgetLimitDayById[idNum] = g.budget_limit_day;
        // Extract ref from utm string
        const utm: string | undefined =
          typeof g?.utm === 'string' ? g.utm : undefined;
        const ref = this.extractRefFromUtm(utm);
        if (ref) {
          refById[idNum] = ref;
          uniqueRefs.add(ref);
        }
      }

      // Pre-aggregate deals sum by adTag (ref) within date range
      // Sum per deal: deal.price + sum(dop.price) for that deal
      const dealsSumByRef: Record<string, number> = {};
      if (uniqueRefs.size) {
        const dealsWhere: any = { adTag: { in: Array.from(uniqueRefs) } };
        // Filter by related Client.firstContact instead of Deal.saleDate
        const clientWhere: any = {};
        if (q?.date_from) clientWhere.firstContact = { gte: q.date_from };
        if (q?.date_to)
          clientWhere.firstContact = {
            ...(clientWhere.firstContact || {}),
            lte: q.date_to,
          };
        if (Object.keys(clientWhere).length) dealsWhere.client = clientWhere;
        // Fetch matching deals with minimal fields
        const deals = await this.prisma.deal.findMany({
          where: dealsWhere,
          select: { id: true, adTag: true, price: true },
        });
        if (deals.length) {
          const dealIds = deals.map((d) => d.id);
          // Group dops by dealId to get sum(price) per deal
          const dopSums = await this.prisma.dop.groupBy({
            by: ['dealId'],
            where: { dealId: { in: dealIds } },
            _sum: { price: true },
          });
          const dopByDealId: Record<number, number> = {};
          for (const row of dopSums)
            dopByDealId[row.dealId] = Number(row._sum?.price || 0);
          // Accumulate per adTag (ref)
          for (const d of deals) {
            const totalForDeal =
              Number(d.price || 0) + (dopByDealId[d.id] || 0);
            dealsSumByRef[d.adTag] =
              (dealsSumByRef[d.adTag] || 0) + totalForDeal;
          }
        }
      }

      // Count CRM customers (makets) per ref with filters:
      // - customer has tag with name == ref
      // - customer.crmStatusId in allowed statuses (mapped from external ids)
      // - firstContactDate within [date_from, date_to]
      const maketsByRef: Record<string, number> = {};
      if (uniqueRefs.size) {
        const refs = Array.from(uniqueRefs);
        const allowedStatusExternalIds = [
          'Макет нарисован', //9
          'ХОЧЕТ КУПИТЬ', //51422
          'Бизнес макет', //1185
          'Личный контакт', //328
          'Ожидаем предоплату', //5879
          'Бронь цены', //1919
          'Предоплата получена', //419
          'Заказ оплачен полностью', //4355
          'Заказ отправлен', //1721
          'Не оплачивает', //4443
          'Ждем отзыв', //4135
          'Постоянник', //26
          'Постоянник (начало)', //5761
          'Постоянник (макет)', //1960
          'Постоянник (хочет)', //27452
          'Проблемный клиент', //200
          'Заказ доставлен',
        ];

        const statusRows = await this.prisma.crmStatus.findMany({
          where: { name: { in: allowedStatusExternalIds } },
          select: { id: true },
        });
        const allowedStatusIds = statusRows.map((s) => s.id);
        const tags = await this.prisma.crmTag.findMany({
          where: { name: { in: refs } },
          select: { id: true, name: true },
        });
        const tagIdByName: Record<string, number> = {};
        const tagIds: number[] = [];
        for (const t of tags) {
          tagIdByName[t.name] = t.id;
          tagIds.push(t.id);
        }
        if (tagIds.length && allowedStatusIds.length) {
          // Build raw SQL with proper date conversion (DD.MM.YYYY -> date)
          const conds: Prisma.Sql[] = [
            Prisma.sql`t.name IN (${Prisma.join(refs)})`,
            Prisma.sql`c."crmStatusId" IN (${Prisma.join(allowedStatusIds)})`,
          ];
          if (q?.date_from)
            conds.push(
              Prisma.sql`to_date(c."firstContactDate", 'DD.MM.YYYY') >= ${q.date_from}::date`,
            );
          if (q?.date_to)
            conds.push(
              Prisma.sql`to_date(c."firstContactDate", 'DD.MM.YYYY') <= ${q.date_to}::date`,
            );
          const whereSql = Prisma.sql`${Prisma.join(conds, ' AND ')}`;
          const rows = await this.prisma.$queryRaw<
            Array<{ ref: string; cnt: bigint }>
          >(
            Prisma.sql`
              SELECT t.name AS ref, COUNT(DISTINCT c.id)::bigint AS cnt
              FROM "CrmCustomer" c
              JOIN "CrmCustomerTag" ct ON ct."customerId" = c.id
              JOIN "CrmTag" t ON t.id = ct."tagId"
              WHERE ${whereSql}
              GROUP BY t.name
            `,
          );
          const countByRef: Record<string, number> = {};
          for (const r of rows) countByRef[r.ref] = Number(r.cnt || 0);
          for (const ref of refs) maketsByRef[ref] = countByRef[ref] || 0;
        } else {
          for (const ref of refs) maketsByRef[ref] = 0;
        }
      }

      // drr теперь считается по spend (из метрик VK) / dealsSales * 100
      // БД adExpenses больше не запрашиваем здесь

      // Fetch stats only for these groups with defaults
      const idsCsv = groupIds.join(',');
      const url = `/api/v3/statistics/ad_groups/day.json`;
      const needsAggregate = groupIds.length > 200 || idsCsv.length > 1500;
      let data: any;
      if (needsAggregate) {
        const q2: any = {
          date_from: q.date_from,
          date_to: q.date_to,
          fields: 'base',
          attribution: 'conversion',
          sort_by: 'base.shows',
          d: q.d || 'desc',
          ad_group_status: q.status,
          limit: q.limit || 250,
          offset: q.offset || 0,
        };
        data = await this.fetchStatsAggregated('ad_groups', groupIds, q2);
      } else {
        data = await this.getWithRetry(url, {
          id: idsCsv,
          date_from: q.date_from,
          date_to: q.date_to,
          fields: 'base',
          attribution: 'conversion',
          ad_group_status: q.status,
          sort_by: 'base.shows',
          d: q.d || 'desc',
          limit: q.limit || 250,
          offset: q.offset || 0,
        });
      }

      // console.log(data);

      // Enrich with name, budget_limit_day from v2 groups, and deals sum by ref
      if (Array.isArray((data as any)?.items)) {
        for (const it of (data as any).items as Array<{
          id: number | string;
          status?: string;
          name?: string;
          budget_limit_day?: string | number;
          dealsPrice?: number;
          ref?: string;
          makets?: number;
          spent_nds?: number;
          maketPrice?: number;
          adExpenses?: number;
          drr?: number;
        }>) {
          const idNum = typeof it?.id === 'number' ? it.id : Number(it?.id);
          if (!Number.isNaN(idNum)) {
            if (nameById[idNum] !== undefined) it.name = nameById[idNum];
            if (budgetLimitDayById[idNum] !== undefined)
              it.budget_limit_day = budgetLimitDayById[idNum];
            const ref = refById[idNum];
            if (ref) it.ref = ref;
            it.dealsPrice = ref ? dealsSumByRef[ref] || 0 : 0;
            it.makets = ref ? maketsByRef[ref] || 0 : 0;
            // Compute spent_nds (spent * 1.2) and maketPrice = spent_nds / makets
            try {
              const rawSpent =
                Number(
                  (it as any)?.total?.base?.spent ??
                    (it as any)?.total?.base?.spend ??
                    0,
                ) || 0;
              const spentNds = rawSpent * 1.2;
              it.spent_nds = Number(spentNds.toFixed(2));
            } catch {
              it.spent_nds = 0;
            }
            it.maketPrice = it.makets
              ? Number(((it.spent_nds || 0) / it.makets).toFixed(2))
              : 0;
            // DRR = spend / dealsPrice * 100 (округление до сотых)
            try {
              const rawSpentForDrr =
                Number(
                  (it as any)?.total?.base?.spent ??
                    (it as any)?.total?.base?.spend ??
                    0,
                ) || 0;
              it.drr = it.dealsPrice
                ? Number(((rawSpentForDrr / it.dealsPrice) * 100).toFixed(2))
                : 0;
            } catch {
              it.drr = 0;
            }
          }
        }
      }
      return data as StatsDayResponse<{
        status?: string;
        name?: string;
        budget_limit_day?: string | number;
        dealsPrice?: number;
        ref?: string;
        makets?: number;
        spent_nds?: number;
        maketPrice?: number;
        adExpenses?: number;
        drr?: number;
      }>;
    } catch (e) {
      this.handleError(e);
    }
  }

  async getAdPlanGroupsData(id: number, status: string | undefined) {
    const url = '/api/v2/ad_groups.json';
    try {
      const { data } = await this.http.get(url, {
        params: {
          fields: 'ad_plan_id,id,name,utm,budget_limit_day', //utm это ref=...
          _ad_plan_id: id,
          _status__in: status ?? 'active,blocked,deleted',
        },
      });
      // console.log(data);
      return data as AdPlan;
    } catch (e) {
      this.handleError(e);
    }
  }

  private extractRefFromUtm(utm?: string): string | undefined {
    if (!utm || typeof utm !== 'string') return undefined;
    // try parse as query string like "a=b&ref=xxx&x=y"
    try {
      const parts = utm.split('&');
      for (const p of parts) {
        const [k, v] = p.split('=');
        if (!k) continue;
        if (k.trim().toLowerCase() === 'ref') {
          return decodeURIComponent((v ?? '').trim());
        }
      }
    } catch {}
    // fallback: look for 'ref=' substring
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
}
