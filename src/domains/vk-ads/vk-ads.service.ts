import axios, { AxiosInstance } from 'axios';
import { Injectable, HttpException } from '@nestjs/common';
import {
  StatisticsDayAdPlansDto,
  StatisticsDayGroupsDto,
  StatisticsDayBannersDto,
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

/**
 * VkAdsService
 * Сервис-обертка над VK Ads API и нашей БД (Prisma).
 * Отвечает за сбор метаданных (кампании, группы, баннеры),
 * запросы статистики по дням (v3), агрегацию, кэширование и
 * обогащение результатов бизнес-метриками (dealsPrice/makets/DRR).
 */
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

  /**
   * Конструктор: инициализирует HTTP‑клиент VK Ads и внедряет PrismaService
   */
  constructor(private readonly prisma: PrismaService) {
    this.http = axios.create({
      baseURL: this.VK_ADS_API_HOST,
      headers: { Authorization: `Bearer ${this.VK_ADS_TOKEN}` },
      timeout: 20000,
    });
  }
  /**
   * Возвращает список id всех рекламных кампаний (ad_plans) + служебные мапы.
   * Использует VK v2 ad_plans, пагинацию и кэширование.
   *
   * Вход: необязательный фильтр статусов.
   * Выход: CSV со всеми id и карты: статус/имя/лимиты/идентификаторы групп/refs по плану.
   */
  private async getAllAdPlanIdsCsv(statusesFilter?: string[]): Promise<{
    idsCsv: string;
    statusById: Record<number, string>;
    nameById: Record<number, string>;
    budgetLimitDayById: Record<number, string | number>;
    adGroupsById: Record<number, number[]>;
    refsByPlan: Record<number, string[]>;
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
        budgetLimitDayById: Record<number, string | number>;
        adGroupsById: Record<number, number[]>;
        refsByPlan: Record<number, string[]>;
      }>(cacheKey);
      if (cached)
        return {
          idsCsv: cached.ids.join(','),
          statusById: cached.statusById,
          nameById: cached.nameById,
          budgetLimitDayById: cached.budgetLimitDayById,
          adGroupsById: cached.adGroupsById,
          refsByPlan: cached.refsByPlan,
        };
      const budgetLimitDayById: Record<number, string | number> = {};
      const adGroupsById: Record<number, number[]> = {};
      for (const st of statuses) {
        let offset = 0;
        let total = Infinity;
        while (offset < total) {
          const data = await this.getWithRetry(
            `/api/v2/ad_plans.json?fields=id,name,status,budget_limit_day`,
            {
              limit,
              offset,
              _status: st,
            },
          );

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
              if (it.budget_limit_day !== undefined)
                budgetLimitDayById[it.id] = it.budget_limit_day;
            }
          }
          if (!items.length) break;
          offset += items.length;
        }
      }
      // After ad plans collected, fetch groups per plan via v2/ad_groups.json (fields=id,utm)
      if (ids.length) {
        const map = await this.fetchGroupIdsByAdPlanIds(ids);
        for (const k of Object.keys(map))
          adGroupsById[Number(k)] = map[Number(k)];
      }
      this.setCache(cacheKey, {
        ids: ids.slice(),
        statusById: { ...statusById },
        nameById: { ...nameById },
        budgetLimitDayById: { ...budgetLimitDayById },
        adGroupsById: { ...adGroupsById },
        refsByPlan: {},
      });
      // After ad plans collected, fetch groups per plan via v2/ad_groups.json (fields=id,utm)
      let refsByPlan: Record<number, string[]> = {};
      if (ids.length) {
        const { groupsByPlan, refsByPlan: rByPlan } =
          await this.fetchGroupIdsByAdPlanIds(ids, 'all');
        for (const k of Object.keys(groupsByPlan))
          adGroupsById[Number(k)] = groupsByPlan[Number(k)];
        refsByPlan = rByPlan;
      }
      this.setCache(cacheKey, {
        ids: ids.slice(),
        statusById: { ...statusById },
        nameById: { ...nameById },
        budgetLimitDayById: { ...budgetLimitDayById },
        adGroupsById: { ...adGroupsById },
        refsByPlan: { ...refsByPlan },
      });
      // console.log(refsByPlan);
      return {
        idsCsv: ids.join(','),
        statusById,
        nameById,
        budgetLimitDayById,
        adGroupsById,
        refsByPlan,
      };
    } catch (e) {
      this.handleError(e);
    }
  }

  /**
   * Получить значение из простого in-memory кэша по ключу.
   */
  private getCache<T = any>(key: string): T | undefined {
    const rec = this.cache.get(key);
    if (!rec) return undefined;
    if (Date.now() - rec.ts > rec.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    return rec.value as T;
  }

  /**
   * Положить значение в in-memory кэш с TTL (по умолчанию 2 минуты).
   */
  private setCache<T = any>(key: string, value: T, ttl = this.DEFAULT_TTL) {
    this.cache.set(key, { ts: Date.now(), ttl, value });
  }

  /**
   * Объединение конкурирующих запросов по одному ключу (inflight de-duplication).
   * Если по key уже есть промис — возвращаем его, иначе создаем новый через factory.
   */
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

  // Fetch all ad_group ids and meta (name, budget_limit_day, ref)
  /**
   * Возвращает все id групп и их метаданные: name, budget_limit_day, ref (из utm), status.
   * Обходит VK v2 ad_groups (пагинация) для набора статусов.
   */
  private async getAllAdGroupIdsMeta(statusesFilter?: string[]): Promise<{
    ids: number[];
    nameById: Record<number, string>;
    budgetLimitDayById: Record<number, string | number>;
    refById: Record<number, string[]>;
    statusById: Record<number, string | undefined>;
  }> {
    const limit = 250;
    const statuses =
      statusesFilter && statusesFilter.length
        ? statusesFilter
        : ['active', 'blocked', 'deleted'];
    const ids: number[] = [];
    const nameById: Record<number, string> = {};
    const budgetLimitDayById: Record<number, string | number> = {};
    const refById: Record<number, string[]> = {};
    const statusById: Record<number, string | undefined> = {};
    for (const st of statuses) {
      let offset = 0;
      let total = Infinity;
      while (offset < total) {
        const data = await this.getWithRetry<any>(
          '/api/v2/ad_groups.json?fields=id,name,utm,budget_limit_day,status',
          { limit, offset, _status: st },
          5,
        );
        const items: any[] = (data as any)?.items ?? [];
        const count: number =
          typeof (data as any)?.count === 'number'
            ? (data as any).count
            : items.length + offset;
        total = count;
        for (const it of items) {
          if (it && typeof it.id === 'number') {
            ids.push(it.id);
            if (typeof it.name === 'string') nameById[it.id] = it.name;
            if (it.budget_limit_day !== undefined)
              budgetLimitDayById[it.id] = it.budget_limit_day;
            if (typeof it.status === 'string') statusById[it.id] = it.status;
            const utm: string | null | undefined = it?.utm;
            const ref = utm ? this.extractRefFromUtm(String(utm)) : undefined;
            refById[it.id] = ref ? [String(ref)] : [];
          }
        }
        if (!items.length) break;
        offset += items.length;
      }
    }
    return { ids, nameById, budgetLimitDayById, refById, statusById };
  }

  // Fetch all banner ids and meta (status, name, ad_group_id)
  /**
   * Возвращает все id баннеров и их метаданные: status, name, ad_group_id.
   * Обходит VK v2 banners (пагинация) для набора статусов.
   */
  private async getAllBannerIdsMeta(statusesFilter?: string[]): Promise<{
    ids: number[];
    statusById: Record<number, string | undefined>;
    nameById: Record<number, string | undefined>;
    adGroupIdByBannerId: Record<number, number | undefined>;
  }> {
    const limit = 250;
    const statuses =
      statusesFilter && statusesFilter.length
        ? statusesFilter
        : ['active', 'blocked', 'deleted'];
    const ids: number[] = [];
    const statusById: Record<number, string | undefined> = {};
    const nameById: Record<number, string | undefined> = {};
    const adGroupIdByBannerId: Record<number, number | undefined> = {};
    for (const st of statuses) {
      let offset = 0;
      let total = Infinity;
      while (offset < total) {
        const data = await this.getWithRetry<any>(
          '/api/v2/banners.json?fields=id,ad_group_id,name,status',
          { limit, offset, _status: st },
          5,
        );
        const items: any[] = (data as any)?.items ?? [];
        const count: number =
          typeof (data as any)?.count === 'number'
            ? (data as any).count
            : items.length + offset;
        total = count;
        for (const it of items) {
          const bid: number =
            typeof it?.id === 'number' ? it.id : Number(it?.id);
          if (!Number.isFinite(bid)) continue;
          ids.push(bid);
          if (typeof it?.status === 'string') statusById[bid] = it.status;
          if (typeof it?.name === 'string') nameById[bid] = it.name;
          const gid: number =
            typeof it?.ad_group_id === 'number'
              ? it.ad_group_id
              : Number(it?.ad_group_id ?? it?.ad_group?.id);
          if (Number.isFinite(gid)) adGroupIdByBannerId[bid] = gid;
        }
        if (!items.length) break;
        offset += items.length;
      }
    }
    return { ids, statusById, nameById, adGroupIdByBannerId };
  }

  // Compute deals sum (deal.price + dops) and makets count for a set of refs within optional date range
  /**
   * Подсчет бизнес‑метрик по множеству ref:
   *  - dealsPrice = сумма (цена сделки + сумма допов по сделке)
   *  - makets     = число клиентов с тегами ref в разрешенных статусах и датах
   */
  private async computePlanMetricsForRefs(
    refs: string[],
    dateFrom?: string,
    dateTo?: string,
  ): Promise<{ dealsPrice: number; makets: number }> {
    if (!refs || !refs.length) return { dealsPrice: 0, makets: 0 };
    const uniqRefs = Array.from(new Set(refs.map((r) => String(r))));

    // Deals sum by refs
    let dealsPrice = 0;
    const dealsWhere: any = { adTag: { in: uniqRefs } };
    const clientWhere: any = {};
    if (dateFrom) clientWhere.firstContact = { gte: dateFrom };
    if (dateTo)
      clientWhere.firstContact = {
        ...(clientWhere.firstContact || {}),
        lte: dateTo,
      };
    if (Object.keys(clientWhere).length) dealsWhere.client = clientWhere;
    const deals = await this.prisma.deal.findMany({
      where: dealsWhere,
      select: { id: true, price: true },
    });
    if (deals.length) {
      const dealIds = deals.map((d) => d.id);
      const dopSums = await this.prisma.dop.groupBy({
        by: ['dealId'],
        where: { dealId: { in: dealIds } },
        _sum: { price: true },
      });
      const dopByDealId: Record<number, number> = {};
      for (const row of dopSums)
        dopByDealId[row.dealId] = Number(row._sum?.price || 0);
      for (const d of deals)
        dealsPrice += Number(d.price || 0) + (dopByDealId[d.id] || 0);
    }

    // Makets count: distinct customers having tag name IN refs and allowed statuses
    const allowedStatusExternalIds = [
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
    const statusRows = await this.prisma.crmStatus.findMany({
      where: { name: { in: allowedStatusExternalIds } },
      select: { id: true },
    });
    const allowedStatusIds = statusRows.map((s) => s.id);
    let makets = 0;
    if (allowedStatusIds.length) {
      const conds: Prisma.Sql[] = [
        Prisma.sql`t.name IN (${Prisma.join(uniqRefs)})`,
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
      const rows = await this.prisma.$queryRaw<
        Array<{ cnt: bigint }>
      >(Prisma.sql`
        SELECT COUNT(DISTINCT c.id)::bigint AS cnt
        FROM "CrmCustomer" c
        JOIN "CrmCustomerTag" ct ON ct."customerId" = c.id
        JOIN "CrmTag" t ON t.id = ct."tagId"
        WHERE ${whereSql}
      `);
      makets = Number(rows?.[0]?.cnt || 0);
    }

    return { dealsPrice, makets };
  }

  /**
   * Разбор фильтра статусов вида: "active,blocked" или "all" → undefined (значит все).
   */
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

  /**
   * Примитивный пул параллелизма: выполняет fn над items максимум в limit параллельных задачах.
   */
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

  /** Пауза на ms миллисекунд */
  private wait(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  /**
   * Разбор Retry-After: число секунд или дата. Возвращает задержку в мс.
   */
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

  /**
   * GET с повторными попытками при 429/5xx, экспоненциальный backoff + уважение Retry-After.
   */
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

  /** Преобразование CSV c id в массив чисел (невалидные отбрасываются). */
  private splitIdsCsv(idsCsv?: string): number[] {
    if (!idsCsv) return [];
    return String(idsCsv)
      .split(',')
      .map((s) => Number(String(s).trim()))
      .filter((n) => Number.isFinite(n));
  }

  // Fetch ad_groups per ad_plan ids using v2/ad_groups.json, return map: planId -> [groupIds]
  /**
   * Возвращает по id кампаний список id групп и refs.
   * Если у группы нет ref в utm, в refs ничего не добавляем.
   */
  private async fetchGroupIdsByAdPlanIds(
    adPlanIds: number[],
    status?: string,
  ): Promise<{
    groupsByPlan: Record<number, number[]>;
    refsByPlan: Record<number, string[]>;
  }> {
    const groupsByPlan: Record<number, number[]> = {};
    const refsByPlan: Record<number, string[]> = {};
    if (!adPlanIds?.length) return { groupsByPlan, refsByPlan };
    // Process plans with small concurrency
    const pool = Math.max(1, Number(process.env.VK_ADS_META_POOL) || 3);
    const planIds = Array.from(new Set(adPlanIds));
    let idx = 0;
    const worker = async () => {
      while (idx < planIds.length) {
        const i = idx++;
        const planId = planIds[i];
        let offset = 0;
        const limit = 250;
        const ids: number[] = [];
        const refs: string[] = [];
        while (true) {
          const params: any = {
            fields: 'id,utm',
            limit,
            offset,
            _ad_plan_id: planId,
          };
          if (status)
            params._status__in =
              status === 'all' ? 'active,blocked,deleted' : status;
          const data = await this.getWithRetry<any>(
            '/api/v2/ad_groups.json',
            params,
            5,
          );
          const items: any[] = (data as any)?.items ?? [];
          if (!items.length) break;
          for (const g of items) {
            const gid =
              typeof (g as any)?.id === 'number'
                ? (g as any).id
                : Number((g as any)?.id);
            if (Number.isFinite(gid)) {
              ids.push(gid);
              const utm: string | null | undefined = (g as any)?.utm;
              const refFromUtm = utm
                ? this.extractRefFromUtm(String(utm))
                : undefined;
              if (refFromUtm && String(refFromUtm).length) {
                refs.push(String(refFromUtm));
              }
            }
          }
          offset += items.length;
          const count: number = (data as any)?.count ?? 0;
          if (!count || offset >= count) break;
        }
        groupsByPlan[planId] = Array.from(new Set(ids));
        refsByPlan[planId] = Array.from(new Set(refs));
      }
    };
    await Promise.all(Array.from({ length: pool }, () => worker()));
    return { groupsByPlan, refsByPlan };
  }

  // Fetch banner ids for provided ad_group ids with pagination
  /**
   * Возвращает карту: groupId → массив id баннеров (через VK v2 banners, пагинация).
   */
  private async fetchBannersByGroupIds(
    groupIds: number[],
    status?: string,
  ): Promise<Record<number, number[]>> {
    const out: Record<number, number[]> = {};
    if (!groupIds?.length) return out;
    const chunkSize = 150; // keep URL length safe
    for (let i = 0; i < groupIds.length; i += chunkSize) {
      const chunk = groupIds.slice(i, i + chunkSize);
      let offset = 0;
      const limit = 250;
      while (true) {
        const params: any = {
          fields: 'id,ad_group_id',
          limit,
          offset,
          _ad_group_id__in: chunk.join(','),
        };
        if (status)
          params._status__in =
            status === 'all' ? 'active,blocked,deleted' : status;
        const data = await this.getWithRetry<any>(
          '/api/v2/banners.json',
          params,
          5,
        );
        const items: any[] = (data as any)?.items ?? [];
        if (!items.length) break;
        for (const b of items) {
          const gid: number =
            typeof (b as any)?.ad_group_id === 'number'
              ? (b as any).ad_group_id
              : Number((b as any)?.ad_group_id ?? (b as any)?.ad_group?.id);
          const bid: number =
            typeof (b as any)?.id === 'number'
              ? (b as any).id
              : Number((b as any)?.id);
          if (Number.isFinite(gid) && Number.isFinite(bid)) {
            if (!out[gid]) out[gid] = [];
            out[gid].push(bid);
          }
        }
        offset += items.length;
        const count: number = (data as any)?.count ?? 0;
        if (!count || offset >= count) break;
      }
    }
    return out;
  }

  /**
   * Агрегированная выборка статистики v3 по дням с разбиением id на чанки,
   * объединением результатов и суммированием total.
   */
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

  /** Преобразование ошибок VK в HttpException с маппингом кодов. */
  private handleError(e: any): never {
    const data: VkError = e?.response?.data ?? {};
    const code = data?.error?.code;
    const message = data?.error?.message || e.message || 'VK Ads error';
    if (code && VK_ERR_TO_HTTP[code])
      throw new HttpException({ code, message }, VK_ERR_TO_HTTP[code]);
    const status = e?.response?.status ?? 500;
    throw new HttpException({ code: code || 'ERR_INTERNAL', message }, status);
  }

  /** Проверка: диапазон дат не длиннее 366 дней. */
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
  /**
   * Статистика по дням для кампаний (ad_plans) с обогащением:
   * статус/имя/лимит, группы, баннеры, refs, бизнес‑метрики.
   */
  async getAdPlansDay(q: StatisticsDayAdPlansDto): Promise<
    StatsDayResponse<{
      status?: string;
      name?: string;
      budget_limit_day?: string | number;
      ad_groups?: number[];
      banners?: number[];
      refs?: string[];
      dealsPrice?: number;
      makets?: number;
      drr?: number;
      maketPrice?: number;
      ad_group_count?: number;
      banners_count?: number;
    }>
  > {
    const url = `/api/v3/statistics/ad_plans/day.json`;

    try {
      // 1) Подготовка: список id кампаний + служебные мапы (кэшируемые)
      let idsParam: string | undefined;
      let adPlanStatuses: Record<number, string> | undefined;
      let adPlanNames: Record<number, string> | undefined;
      let budgetLimitDayById: Record<number, string | number> | undefined;
      let adGroupsById: Record<number, number[]> | undefined;
      let refsByPlan: Record<number, string[]> | undefined;

      // Auto-populate with all ad plan IDs and collect status when ids not provided
      if (!idsParam) {
        const adPlanStatusesFilter = this.parseStatusesFilter(q.status);
        const meta = await this.getAllAdPlanIdsCsv(adPlanStatusesFilter);
        idsParam = meta.idsCsv;
        adPlanStatuses = meta.statusById;
        adPlanNames = meta.nameById;
        budgetLimitDayById = meta.budgetLimitDayById;
        adGroupsById = meta.adGroupsById;
        refsByPlan = meta.refsByPlan;
        if (!idsParam) {
          throw new HttpException(
            { code: 'ERR_WRONG_IDS', message: 'Рекламные кампании не найдены' },
            404,
          );
        }
      }

      // 2) Валидация диапазона дат
      this.ensureDateRange(q.date_from, q.date_to);

      // If URL risks being too long, or too many ids, fetch in chunks and aggregate
      const idsList = this.splitIdsCsv(idsParam);
      const needsAggregate =
        idsList.length > 200 || String(idsParam || '').length > 1500;
      let data: any;
      if (needsAggregate) {
        // 3а) Слишком много id — используем агрегатор с чанками
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
        // 3б) Немного id — запрашиваем напрямую v3
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

      // 4) Обогащение items: статусы/имена/лимиты, списки групп и refs
      if (Array.isArray((data as any)?.items)) {
        const itemsArr = (data as any).items as Array<{
          id: number | string;
          status?: string;
          name?: string;
          budget_limit_day?: string | number;
          ad_groups?: number[];
          banners?: number[];
          refs?: string[];
          dealsPrice?: number;
          makets?: number;
          drr?: number;
          maketPrice?: number;
        }>;
        for (const it of itemsArr) {
          const idNum = typeof it?.id === 'number' ? it.id : Number(it?.id);
          if (!Number.isNaN(idNum)) {
            if (adPlanStatuses && adPlanStatuses[idNum])
              it.status = adPlanStatuses[idNum];
            if (adPlanNames && adPlanNames[idNum]) it.name = adPlanNames[idNum];
            if (budgetLimitDayById && budgetLimitDayById[idNum] !== undefined)
              it.budget_limit_day = budgetLimitDayById[idNum];
            if (adGroupsById) it.ad_groups = adGroupsById[idNum] || [];
            if (refsByPlan) it.refs = refsByPlan[idNum] || [];
          }
        }
        // 5) Загружаем баннеры всех групп и раскладываем по планам
        const allGroupIds: number[] = [];
        for (const it of itemsArr) {
          const gids = Array.isArray(it.ad_groups) ? it.ad_groups : [];
          for (const gid of gids)
            if (Number.isFinite(gid)) allGroupIds.push(gid);
        }
        if (allGroupIds.length) {
          const bannersByGroup = await this.fetchBannersByGroupIds(
            Array.from(new Set(allGroupIds)),
            q.status && q.status !== 'all' ? q.status : undefined,
          );
          for (const it of itemsArr) {
            const gids = Array.isArray(it.ad_groups) ? it.ad_groups : [];
            const acc: number[] = [];
            for (const gid of gids) {
              const bs = bannersByGroup[gid] || [];
              if (bs.length) acc.push(...bs);
            }
            it.banners = Array.from(new Set(acc));
            if (!it.refs?.length) {
              it.refs = it.banners.map((b) => b.toString());
            }
          }
        } else {
          for (const it of itemsArr) {
            it.banners = [];
          }
        }

        // 6) Посчитать глобальные счетчики по всем планам
        const allGroups = new Set<number>();
        const allBanners = new Set<number>();
        for (const it of itemsArr) {
          const gids = Array.isArray(it.ad_groups) ? it.ad_groups : [];
          for (const gid of gids) if (Number.isFinite(gid)) allGroups.add(gid);
          const bs = Array.isArray(it.banners) ? it.banners : [];
          for (const b of bs) if (Number.isFinite(b)) allBanners.add(b);
        }
        (data as any).ad_group_count = allGroups.size;
        (data as any).banners_count = allBanners.size;

        // 7) Посчитать бизнес‑метрики per plan по refs и датам
        const metrics = await Promise.all(
          itemsArr.map((it) =>
            this.computePlanMetricsForRefs(
              it.refs || [],
              q.date_from,
              q.date_to,
            ),
          ),
        );
        itemsArr.forEach((it, idx) => {
          const m = metrics[idx];
          it.dealsPrice = m.dealsPrice;
          it.makets = m.makets;
          // Compute spent_nds from v3 totals (spent * 1.2)
          let spentNds = 0;
          try {
            const rawSpent =
              Number(
                (it as any)?.total?.base?.spent ??
                  (it as any)?.total?.base?.spend ??
                  0,
              ) || 0;
            spentNds = rawSpent * 1.2;
          } catch {}
          it.maketPrice = it.makets
            ? Number((spentNds / it.makets).toFixed(2))
            : 0;
          it.drr = it.dealsPrice
            ? Number(((spentNds / it.dealsPrice) * 100).toFixed(2))
            : 0;
        });
      }
      return data as StatsDayResponse<{
        status?: string;
        name?: string;
        budget_limit_day?: string | number;
        ad_groups?: number[];
        banners?: number[];
        refs?: string[];
        dealsPrice?: number;
        makets?: number;
        drr?: number;
        maketPrice?: number;
      }> & { ad_group_count: number; banners_count: number };
    } catch (e) {
      this.handleError(e);
    }
  }

  // Get ad_groups stats for a given ad_plan id: fetch groups, then delegate to v3 stats with explicit ids
  /**
   * Статистика по дням для групп конкретной кампании.
   * Шаги: получить группы кампании (v2), собрать мета, посчитать бизнес‑метрики,
   * запросить v3 по этим группам, обогатить результат.
   */
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
    }> & { ad_groups: number[] }
  > {
    try {
      // 1) Получение групп по кампании (v2) с учетом статуса
      // console.log(q);
      // Fetch the ad plan with groups list; try both 'groups' and 'ad_groups'
      // Treat status=all as all statuses
      const statusForGroups =
        q.status && q.status !== 'all' ? q.status : undefined;
      const adPlan = await this.getAdPlanGroupsData(adPlanId, statusForGroups);
      // console.log(adPlan);
      // console.log(adPlan.ad_groups);
      const groupsRaw: any = (adPlan as any)?.items;
      if (!Array.isArray(groupsRaw) || groupsRaw.length === 0) {
        return {
          items: [],
          count: 0,
          limit: (q as any)?.limit ?? 20,
          offset: (q as any)?.offset ?? 0,
          ad_groups: [],
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
          ad_groups: [],
        };
      }

      // 2) Собрать мета по группам: name, budget_limit_day, ref
      const nameById: Record<number, string | undefined> = {};
      const budgetLimitDayById: Record<number, string | number | undefined> =
        {};
      const refById: Record<number, string[]> = {};
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
        refById[idNum] = ref ? [ref] : [];
        if (ref) uniqueRefs.add(ref);
      }

      // 3) dealsPrice по ref (deal.price + Σdop.price) в пределах дат
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

      // 4) makets (клиенты) по ref с фильтрами по статусам и датам
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
              Prisma.sql`to_date(c."firstContactDate", 'YYYY-MM-DD') >= ${q.date_from}::date`,
            );
          if (q?.date_to)
            conds.push(
              Prisma.sql`to_date(c."firstContactDate", 'YYYY-MM-DD') <= ${q.date_to}::date`,
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

      // 5) Запросить статистику v3 по выбранным группам (агрегатор/прямой)
      const idsCsv = groupIds.join(',');
      const url = `/api/v3/statistics/ad_groups/day.json`;
      const needsAggregate = groupIds.length > 200 || idsCsv.length > 1500;
      let data: any;
      const adGroupStatusParam =
        q.status && q.status !== 'all' ? q.status : undefined;
      if (needsAggregate) {
        const q2: any = {
          date_from: q.date_from,
          date_to: q.date_to,
          fields: 'base',
          attribution: 'conversion',
          sort_by: 'base.shows',
          d: q.d || 'desc',
          ad_group_status: adGroupStatusParam,
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
          ad_group_status: adGroupStatusParam,
          sort_by: 'base.shows',
          d: q.d || 'desc',
          limit: q.limit || 250,
          offset: q.offset || 0,
        });
      }

      // console.log(data);

      // 6) Обогатить items: name/budget_limit_day/ref/dealsPrice/makets/spent_nds/maketPrice/DRR
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
            const refsArr = Array.isArray(refById[idNum]) ? refById[idNum] : [];
            if (refsArr.length) it.ref = refsArr[0];
            it.dealsPrice = refsArr.reduce(
              (sum, r) => sum + (dealsSumByRef[r] || 0),
              0,
            );
            it.makets = refsArr.reduce(
              (sum, r) => sum + (maketsByRef[r] || 0),
              0,
            );
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
            // DRR = spent_nds / dealsPrice * 100 (округление до сотых)
            const spentForDrr = Number(it.spent_nds || 0);
            it.drr = it.dealsPrice
              ? Number(((spentForDrr / it.dealsPrice) * 100).toFixed(2))
              : 0;
          }
        }
      }
      const resp = data as StatsDayResponse<{
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
      }> & { ad_groups: number[] };
      (resp as any).ad_groups = groupIds;
      return resp;
    } catch (e) {
      this.handleError(e);
    }
  }

  // Ad Groups statistics (day) with optional ids or all groups
  /**
   * Статистика по дням для групп (ad_groups) в целом:
   * если ids не переданы — собираем все группы по статусу; считаем
   * бизнес‑метрики, подтягиваем баннеры и нормализуем ответ как у планов.
   */
  async getAdGroupsDay(q: StatisticsDayGroupsDto): Promise<
    StatsDayResponse<{
      status?: string;
      name?: string;
      budget_limit_day?: string | number;
      dealsPrice?: number;
      ref?: string;
      refs?: string[];
      makets?: number;
      spent_nds?: number;
      maketPrice?: number;
      adExpenses?: number;
      drr?: number;
      banners_count?: number;
      banners?: number[];
    }>
  > {
    try {
      // 1) Валидация дат и разбор ids/status
      this.ensureDateRange(q.date_from, q.date_to);

      // Parse provided ids, else fetch all ids + meta by statuses
      let groupIds: number[] = [];
      const providedIdsCsv = (q as any)?.ids as string | undefined;
      if (providedIdsCsv && String(providedIdsCsv).trim().length) {
        groupIds = this.splitIdsCsv(providedIdsCsv);
      }

      const statusesFilter = this.parseStatusesFilter(q.status);
      let nameById: Record<number, string> = {};
      let budgetLimitDayById: Record<number, string | number> = {};
      let refById: Record<number, string[]> = {};
      let statusById: Record<number, string | undefined> = {};

      if (!groupIds.length) {
        // 2а) ids не заданы — собрать все группы (v2) и метаданные
        // Fetch all groups ids/meta when ids are not provided
        const meta = await this.getAllAdGroupIdsMeta(statusesFilter);

        groupIds = meta.ids.slice();
        nameById = meta.nameById;
        budgetLimitDayById = meta.budgetLimitDayById as any;
        refById = meta.refById;
        statusById = meta.statusById;
      } else {
        // 2б) ids заданы — все равно подгрузим метаданные для обогащения
        // For provided ids, still need meta for enrichment
        const meta = await this.getAllAdGroupIdsMeta(statusesFilter);
        nameById = meta.nameById;
        budgetLimitDayById = meta.budgetLimitDayById as any;
        refById = meta.refById;
        statusById = meta.statusById;
      }

      if (!groupIds.length) {
        return {
          items: [],
          count: 0,
          limit: (q as any)?.limit ?? 20,
          offset: (q as any)?.offset ?? 0,
          total: {},
        };
      }
      // 4) Запросить статистику v3 по группам; заранее получить баннеры по группам
      const idsCsv = groupIds.join(',');
      const url = `/api/v3/statistics/ad_groups/day.json`;
      const needsAggregate = groupIds.length > 200 || idsCsv.length > 1500;
      const adGroupStatusParam =
        q.status && q.status !== 'all' ? q.status : undefined;
      // Fetch banners per group to compute counts
      const bannersByGroup = await this.fetchBannersByGroupIds(
        Array.from(new Set(groupIds)),
        adGroupStatusParam,
      );

      // 3) Подготовить агрегаторы по ref: dealsPrice и makets
      const uniqueRefs = new Set<string>();
      for (const gid of groupIds) {
        const refs = refById[gid] || [];
        for (const ref of refs)
          if (ref && String(ref).length) uniqueRefs.add(String(ref));
      }
      // Fallback: when there are no refs, use banner IDs as refs
      if (uniqueRefs.size === 0) {
        for (const [gidStr, bs] of Object.entries(bannersByGroup)) {
          const list = Array.isArray(bs) ? bs : [];
          for (const b of list) uniqueRefs.add(String(b));
        }
      }

      const dealsSumByRef: Record<string, number> = {};
      const maketsByRef: Record<string, number> = {};
      if (uniqueRefs.size) { 
        // 3а) dealsPrice: сумма по сделкам и допам, сгруппировано по ref
        // Deals sum + makets per ref via DB
        const refs = Array.from(uniqueRefs);
        // Deals sum by ref
        const deals = await this.prisma.deal.findMany({
          where: {
            adTag: { in: refs },
            ...(q?.date_from || q?.date_to
              ? {
                  client: {
                    ...(q?.date_from
                      ? { firstContact: { gte: q.date_from } }
                      : {}),
                    ...(q?.date_to
                      ? {
                          firstContact: {
                            lte: q.date_to,
                            ...(q?.date_from ? { gte: q.date_from } : {}),
                          },
                        }
                      : {}),
                  },
                }
              : {}),
          },
          select: { id: true, adTag: true, price: true },
        });
        const dealIds = deals.map((d) => d.id);
        const dopSums = dealIds.length
          ? await this.prisma.dop.groupBy({
              by: ['dealId'],
              where: { dealId: { in: dealIds } },
              _sum: { price: true },
            })
          : [];
        const dopByDealId: Record<number, number> = {};
        for (const row of dopSums)
          dopByDealId[row.dealId] = Number(row._sum?.price || 0);
        for (const d of deals) {
          const totalForDeal = Number(d.price || 0) + (dopByDealId[d.id] || 0);
          dealsSumByRef[d.adTag] = (dealsSumByRef[d.adTag] || 0) + totalForDeal;
        }

        // 3б) makets: клиенты по ref с разрешенными статусами и датами
        const allowedStatusExternalIds = [
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
        const statusRows = await this.prisma.crmStatus.findMany({
          where: { name: { in: allowedStatusExternalIds } },
          select: { id: true },
        });
        const allowedStatusIds = statusRows.map((s) => s.id);
        if (allowedStatusIds.length) {
          const conds: Prisma.Sql[] = [
            Prisma.sql`t.name IN (${Prisma.join(refs)})`,
            Prisma.sql`c."crmStatusId" IN (${Prisma.join(allowedStatusIds)})`,
          ];
          if (q?.date_from)
            conds.push(
              Prisma.sql`to_date(c."firstContactDate", 'YYYY-MM-DD') >= ${q.date_from}::date`,
            );
          if (q?.date_to)
            conds.push(
              Prisma.sql`to_date(c."firstContactDate", 'YYYY-MM-DD') <= ${q.date_to}::date`,
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

      let data: any;
      if (needsAggregate) {
        const q2: any = {
          date_from: q.date_from,
          date_to: q.date_to,
          fields: 'base',
          attribution: 'conversion',
          sort_by: 'base.shows',
          d: q.d || 'desc',
          ad_group_status: adGroupStatusParam,
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
          ad_group_status: adGroupStatusParam,
          sort_by: 'base.shows',
          d: q.d || 'desc',
          limit: q.limit || 250,
          offset: q.offset || 0,
        });
      }

      // 5) Обогатить items и нормализовать counters как в getAdPlansDay
      if (Array.isArray((data as any)?.items)) {
        for (const it of (data as any).items as Array<{
          id: number | string;
          status?: string;
          name?: string;
          budget_limit_day?: string | number;
          dealsPrice?: number;
          ref?: string;
          refs?: string[];
          makets?: number;
          spent_nds?: number;
          maketPrice?: number;
          adExpenses?: number;
          drr?: number;
          banners_count?: number;
          banners?: number[]; 
        }>) {
          const idNum = typeof it?.id === 'number' ? it.id : Number(it?.id);
          if (!Number.isNaN(idNum)) {
            if (statusById[idNum] !== undefined) it.status = statusById[idNum];
            if (nameById[idNum] !== undefined) it.name = nameById[idNum];
            if (budgetLimitDayById[idNum] !== undefined)
              it.budget_limit_day = budgetLimitDayById[idNum];
            const refsArr = Array.isArray(refById[idNum]) ? refById[idNum] : [];
            if (refsArr.length) it.ref = refsArr[0];
            it.refs = refsArr.slice();
            // banners count per group
            try {
              const bs = bannersByGroup[idNum] || [];
              it.banners_count = Array.isArray(bs) ? bs.length : 0;
              it.banners = Array.isArray(bs) ? Array.from(new Set(bs)) : [];
              // Fallback: when refs are empty, use banner ids as refs
              if (!it.refs?.length) {
                it.refs = it.banners.map((b) => b.toString());
              }
            } catch {
              it.banners_count = 0;
              it.banners = [];
            }
            // Compute dealsPrice and makets AFTER refs fallback to banners
            const refsForMetrics = Array.isArray(it.refs) && it.refs.length
              ? it.refs
              : refsArr;
            it.dealsPrice = refsForMetrics.reduce(
              (sum, r) => sum + (dealsSumByRef[r] || 0),
              0,
            );
            it.makets = refsForMetrics.reduce(
              (sum, r) => sum + (maketsByRef[r] || 0),
              0,
            );
            // spent_nds (spent * 1.2), maketPrice and drr
            try {
              const rawSpent =
                Number(
                  (it as any)?.total?.base?.spent ??
                    (it as any)?.total?.base?.spend ??
                    0,
                ) || 0;
              it.spent_nds = Number((rawSpent * 1.2).toFixed(2));
            } catch {
              it.spent_nds = 0;
            }
            it.maketPrice = it.makets
              ? Number(((it.spent_nds || 0) / it.makets).toFixed(2))
              : 0;
            const spentForDrr = Number(it.spent_nds || 0);
            it.drr = it.dealsPrice
              ? Number(((spentForDrr / it.dealsPrice) * 100).toFixed(2))
              : 0;
          }
        }
        // Normalize top-level counts similar to getAdPlansDay
        const itemsArr = (data as any).items as Array<any>;
        let bannersTotal = 0;
        for (const it of itemsArr) {
          const bs = Array.isArray(it.banners) ? it.banners : [];
          bannersTotal += bs.length;
        }
        (data as any).ad_group_count = itemsArr.length; // число групп в выдаче
        (data as any).banners_count = bannersTotal; // сумма баннеров по всем группам
      }

      return data as StatsDayResponse<{
        status?: string;
        name?: string;
        budget_limit_day?: string | number;
        dealsPrice?: number;
        ref?: string;
        refs?: string[];
        makets?: number;
        spent_nds?: number;
        maketPrice?: number;
        adExpenses?: number;
        drr?: number;
        banners_count?: number;
        banners?: number[];
      }> & { ad_group_count: number; banners_count: number };
    } catch (e) {
      this.handleError(e);
    }
  }

  // Banners statistics (day) – entity fixed to banners
  /**
   * Статистика по дням для баннеров (banners) с обогащением:
   * статус/имя, связь с группой, refs от группы, бизнес‑метрики и расчетные поля.
   */
  async getBannersDay(q: StatisticsDayBannersDto): Promise<
    StatsDayResponse<{
      status?: string;
      name?: string;
      ad_group_id?: number;
      ref?: string;
      refs?: string[];
      dealsPrice?: number;
      makets?: number;
      spent_nds?: number;
      maketPrice?: number;
      drr?: number;
    }> & { ad_group_count: number; banners_count: number }
  > {
    try {
      this.ensureDateRange(q.date_from, q.date_to);

      // Resolve banner ids
      let bannerIds: number[] = [];
      const providedIds = (q as any)?.ids as string | undefined;
      if (providedIds && String(providedIds).trim().length)
        bannerIds = this.splitIdsCsv(providedIds);

      const statusesFilter = this.parseStatusesFilter(q.status);
      let statusByBannerId: Record<number, string | undefined> = {};
      let nameByBannerId: Record<number, string | undefined> = {};
      let adGroupByBannerId: Record<number, number | undefined> = {};

      if (!bannerIds.length) {
        // Enumerate all banners by status via v2
        const meta = await this.getAllBannerIdsMeta(statusesFilter);
        bannerIds = meta.ids.slice();
        statusByBannerId = meta.statusById;
        nameByBannerId = meta.nameById;
        adGroupByBannerId = meta.adGroupIdByBannerId;
      } else {
        // Even with explicit ids, fetch meta to enrich
        const meta = await this.getAllBannerIdsMeta(undefined);
        statusByBannerId = meta.statusById;
        nameByBannerId = meta.nameById;
        adGroupByBannerId = meta.adGroupIdByBannerId;
      }

      if (!bannerIds.length) {
        return {
          items: [],
          count: 0,
          limit: (q as any)?.limit ?? 20,
          offset: (q as any)?.offset ?? 0,
          total: {},
          ad_group_count: 0,
          banners_count: 0,
        };
      }

      // Prepare refs by group for banners enrichment
      const groupMeta = await this.getAllAdGroupIdsMeta(undefined);
      const refsByGroupId: Record<number, string[]> = groupMeta.refById || {};

      // Build refs set to pre-compute business metrics
      const uniqueRefs = new Set<string>();
      for (const bid of bannerIds) {
        const gid = adGroupByBannerId[bid];
        const refs = (gid && refsByGroupId[gid]) || [];
        for (const r of refs) if (r && String(r).length) uniqueRefs.add(String(r));
      }
      // Fallback: use banner IDs as refs when no refs available
      if (uniqueRefs.size === 0)
        for (const bid of bannerIds) uniqueRefs.add(String(bid));

      const dealsSumByRef: Record<string, number> = {};
      const maketsByRef: Record<string, number> = {};
      if (uniqueRefs.size) {
        const refs = Array.from(uniqueRefs);
        // Deals sum by ref
        const deals = await this.prisma.deal.findMany({
          where: {
            adTag: { in: refs },
            ...(q?.date_from || q?.date_to
              ? {
                  client: {
                    ...(q?.date_from
                      ? { firstContact: { gte: q.date_from } }
                      : {}),
                    ...(q?.date_to
                      ? {
                          firstContact: {
                            lte: q.date_to,
                            ...(q?.date_from ? { gte: q.date_from } : {}),
                          },
                        }
                      : {}),
                  },
                }
              : {}),
          },
          select: { id: true, adTag: true, price: true },
        });
        const dealIds = deals.map((d) => d.id);
        const dopSums = dealIds.length
          ? await this.prisma.dop.groupBy({
              by: ['dealId'],
              where: { dealId: { in: dealIds } },
              _sum: { price: true },
            })
          : [];
        const dopByDealId: Record<number, number> = {};
        for (const row of dopSums)
          dopByDealId[row.dealId] = Number(row._sum?.price || 0);
        for (const d of deals) {
          const totalForDeal = Number(d.price || 0) + (dopByDealId[d.id] || 0);
          dealsSumByRef[d.adTag] = (dealsSumByRef[d.adTag] || 0) + totalForDeal;
        }

        // Makets per ref
        const allowedStatusExternalIds = [
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
        const statusRows = await this.prisma.crmStatus.findMany({
          where: { name: { in: allowedStatusExternalIds } },
          select: { id: true },
        });
        const allowedStatusIds = statusRows.map((s) => s.id);
        if (allowedStatusIds.length) {
          const conds: Prisma.Sql[] = [
            Prisma.sql`t.name IN (${Prisma.join(refs)})`,
            Prisma.sql`c."crmStatusId" IN (${Prisma.join(allowedStatusIds)})`,
          ];
          if (q?.date_from)
            conds.push(
              Prisma.sql`to_date(c."firstContactDate", 'YYYY-MM-DD') >= ${q.date_from}::date`,
            );
          if (q?.date_to)
            conds.push(
              Prisma.sql`to_date(c."firstContactDate", 'YYYY-MM-DD') <= ${q.date_to}::date`,
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

      // Query v3 banners stats
      const idsCsv = bannerIds.join(',');
      const url = `/api/v3/statistics/banners/day.json`;
      const needsAggregate = bannerIds.length > 200 || idsCsv.length > 1500;
      const bannerStatusParam =
        q.status && q.status !== 'all' ? q.status : undefined;
      let data: any;
      if (needsAggregate) {
        const q2: any = {
          date_from: q.date_from,
          date_to: q.date_to,
          fields: 'base',
          attribution: 'conversion',
          sort_by: q.sort_by || 'base.shows',
          d: q.d || 'desc',
          banner_status: bannerStatusParam,
          limit: q.limit || 250,
          offset: q.offset || 0,
        };
        data = await this.fetchStatsAggregated('banners', bannerIds, q2);
      } else {
        data = await this.getWithRetry(url, {
          id: idsCsv,
          date_from: q.date_from,
          date_to: q.date_to,
          fields: 'base',
          attribution: 'conversion',
          banner_status: bannerStatusParam,
          sort_by: q.sort_by || 'base.shows',
          d: q.d || 'desc',
          limit: q.limit || 250,
          offset: q.offset || 0,
        });
      }

      // Enrich items
      if (Array.isArray((data as any)?.items)) {
        const items = (data as any).items as Array<{
          id: number | string;
          status?: string;
          name?: string;
          ad_group_id?: number;
          ref?: string;
          refs?: string[];
          dealsPrice?: number;
          makets?: number;
          spent_nds?: number;
          maketPrice?: number;
          drr?: number;
        }>;

        for (const it of items) {
          const idNum = typeof it?.id === 'number' ? it.id : Number(it?.id);
          if (!Number.isFinite(idNum)) continue;
          if (statusByBannerId[idNum] !== undefined)
            it.status = statusByBannerId[idNum];
          if (nameByBannerId[idNum] !== undefined)
            it.name = nameByBannerId[idNum];
          const gid = adGroupByBannerId[idNum];
          if (Number.isFinite(gid as any)) it.ad_group_id = gid as number;
          const refs = (gid && refsByGroupId[gid]) || [];
          if (refs.length) it.ref = refs[0];
          it.refs = refs.slice();

          // Fallback refs to banner id
          const refsForMetrics = it.refs && it.refs.length
            ? it.refs
            : [String(idNum)];

          it.dealsPrice = refsForMetrics.reduce(
            (sum, r) => sum + (dealsSumByRef[r] || 0),
            0,
          );
          it.makets = refsForMetrics.reduce(
            (sum, r) => sum + (maketsByRef[r] || 0),
            0,
          );

          // spent_nds from v3 totals
          try {
            const rawSpent =
              Number(
                (it as any)?.total?.base?.spent ??
                  (it as any)?.total?.base?.spend ??
                  0,
              ) || 0;
            it.spent_nds = Number((rawSpent * 1.2).toFixed(2));
          } catch {
            it.spent_nds = 0;
          }
          it.maketPrice = it.makets
            ? Number(((it.spent_nds || 0) / it.makets).toFixed(2))
            : 0;
          const spentForDrr = Number(it.spent_nds || 0);
          it.drr = it.dealsPrice
            ? Number(((spentForDrr / it.dealsPrice) * 100).toFixed(2))
            : 0;
        }

        // Top-level counters
        const adGroupSet = new Set<number>();
        for (const it of items) {
          const gid = Number((it as any)?.ad_group_id);
          if (Number.isFinite(gid)) adGroupSet.add(gid);
        }
        (data as any).ad_group_count = adGroupSet.size;
        (data as any).banners_count = items.length;
      }

      return data as StatsDayResponse<{
        status?: string;
        name?: string;
        ad_group_id?: number;
        ref?: string;
        refs?: string[];
        dealsPrice?: number;
        makets?: number;
        spent_nds?: number;
        maketPrice?: number;
        drr?: number;
      }> & { ad_group_count: number; banners_count: number };
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
          _status__in:
            status && status !== 'all' ? status : 'active,blocked,deleted',
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
