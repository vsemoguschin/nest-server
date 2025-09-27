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

// Разрешенные CRM‑статусы для подсчета "макетов" (используются в нескольких местах)
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
  private readonly VK_ADS_BOOK_TOKEN = process.env.VK_ADS_BOOK_TOKEN;

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
      // Увеличенный таймаут для тяжелых агрегирующих запросов и сидов
      timeout: 60000,
    });
  }

  /** Получить токен по проекту (жестко требует project). Бросает 500, если env не настроен. */
  private getTokenForProject(project?: 'neon' | 'book'): string {
    if (!project) {
      throw new HttpException(
        { code: 'ERR_WRONG_PARAMETER', message: 'project is required' },
        400,
      );
    }
    const token =
      project === 'book' ? this.VK_ADS_BOOK_TOKEN : this.VK_ADS_TOKEN;
    if (!token) {
      throw new HttpException(
        {
          code: 'ERR_INTERNAL',
          message: `VK ADS token for project ${project} is not configured`,
        },
        500,
      );
    }
    return token;
  }
  /**
   * Возвращает список id всех рекламных кампаний (ad_plans) + служебные мапы.
   * Использует VK v2 ad_plans, пагинацию и кэширование.
   *
   * Вход: необязательный фильтр статусов.
   * Выход: CSV со всеми id и карты: статус/имя/лимиты/идентификаторы групп/refs по плану.
   */
  private async getAllAdPlanIdsCsv(
    project: 'neon' | 'book',
    statusesFilter?: string[],
    authToken?: string,
  ): Promise<{
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
      const cacheKey = ['ids', 'ad_plans', project, ...statuses].join('|');
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
            4,
            authToken,
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
      let refsByPlan: Record<number, string[]> = {};
      if (ids.length) {
        const { groupsByPlan, refsByPlan: rByPlan } =
          await this.fetchGroupIdsByAdPlanIds(project, ids, 'all', authToken);
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
  private async getAllAdGroupIdsMeta(
    _project: 'neon' | 'book',
    statusesFilter?: string[],
    authToken?: string,
  ): Promise<{
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
          authToken,
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
  private async getAllBannerIdsMeta(
    _project: 'neon' | 'book',
    statusesFilter?: string[],
    authToken?: string,
  ): Promise<{
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
          authToken,
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
    const { dealsByRef, maketsByRef } = await this.computeDealsAndMaketsByRefs(
      uniqRefs,
      dateFrom,
      dateTo,
    );
    const dealsPrice = uniqRefs.reduce(
      (sum, r) => sum + (dealsByRef[r] || 0),
      0,
    );
    const makets = uniqRefs.reduce((sum, r) => sum + (maketsByRef[r] || 0), 0);
    return { dealsPrice, makets };
  }

  /** Построить where для Prisma клиента по дате первого контакта */
  private buildClientDateWhere(dateFrom?: string, dateTo?: string) {
    if (!dateFrom && !dateTo) return undefined;
    const firstContact: any = {};
    if (dateFrom) firstContact.gte = dateFrom;
    if (dateTo) firstContact.lte = dateTo;
    return { firstContact };
  }

  /**
   * Единый расчет карт по refs: сумма сделок (+допы) и число макетов.
   * Используется для всех сущностей.
   */
  private async computeDealsAndMaketsByRefs(
    refs: string[],
    dateFrom?: string,
    dateTo?: string,
  ): Promise<{
    dealsByRef: Record<string, number>;
    maketsByRef: Record<string, number>;
  }> {
    const uniqRefs = Array.from(new Set(refs.map(String)));
    const dealsByRef: Record<string, number> = {};
    const maketsByRef: Record<string, number> = {};

    if (!uniqRefs.length) return { dealsByRef, maketsByRef };

    // Deals sum by ref
    const clientWhere = this.buildClientDateWhere(dateFrom, dateTo);
    const deals = await this.prisma.deal.findMany({
      where: {
        adTag: { in: uniqRefs },
        ...(clientWhere ? { client: clientWhere } : {}),
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
      dealsByRef[d.adTag] = (dealsByRef[d.adTag] || 0) + totalForDeal;
    }

    // Makets per ref: фильтр по статусам + датам
    const statusRows = await this.prisma.crmStatus.findMany({
      where: { name: { in: ALLOWED_CRM_STATUSES } },
      select: { id: true },
    });
    const allowedStatusIds = statusRows.map((s) => s.id);
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
      for (const ref of uniqRefs) maketsByRef[ref] = countByRef[ref] || 0;
    } else {
      for (const ref of uniqRefs) maketsByRef[ref] = 0;
    }

    return { dealsByRef, maketsByRef };
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
    authToken?: string,
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        const config: any = { params };
        if (authToken)
          config.headers = { Authorization: `Bearer ${authToken}` };
        const { data } = await this.http.get(url, config);
        // console.log(url, params);
        return data as T;
      } catch (e: any) {
        const status = e?.response?.status;
        const retryAfter = this.parseRetryAfter(
          e?.response?.headers?.['retry-after'] ||
            e?.response?.headers?.['Retry-After'],
        );
        // Ретрай также при сетевом таймауте Axios (ECONNABORTED)
        const isTimeout = e?.code === 'ECONNABORTED';
        const shouldRetry =
          status === 429 || (status >= 500 && status < 600) || isTimeout;
        if (!shouldRetry || attempt >= retries) throw e;
        // Для 429 используем более агрессивный backoff, если нет Retry-After
        const base = status === 429 ? 1000 : 300; // ms
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
    project: 'neon' | 'book',
    adPlanIds: number[],
    status?: string,
    authToken?: string,
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
    await this.mapPool(planIds, pool, async (planId) => {
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
          authToken,
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
      return null as any;
    });
    return { groupsByPlan, refsByPlan };
  }

  // Fetch banner ids for provided ad_group ids with pagination
  /**
   * Возвращает карту: groupId → массив id баннеров (через VK v2 banners, пагинация).
   */
  private async fetchBannersByGroupIds(
    project: 'neon' | 'book',
    groupIds: number[],
    status?: string,
    authToken?: string,
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
          authToken,
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
    project: 'neon' | 'book',
    entity: string,
    ids: number[],
    q: any,
    authToken?: string,
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
      project,
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
            authToken,
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
      const token = this.getTokenForProject(q.project);
      // 1) Подготовка: список id кампаний + служебные мапы (кэшируемые)
      let idsParam: string | undefined = ((q as any)?.ids && String((q as any).ids).trim()) || undefined;
      let adPlanStatuses: Record<number, string> | undefined;
      let adPlanNames: Record<number, string> | undefined;
      let budgetLimitDayById: Record<number, string | number> | undefined;
      let adGroupsById: Record<number, number[]> | undefined;
      let refsByPlan: Record<number, string[]> | undefined;

      // Auto-populate with all ad plan IDs and collect status when ids not provided
      if (!idsParam) {
        const adPlanStatusesFilter = this.parseStatusesFilter(q.status);
        const meta = await this.getAllAdPlanIdsCsv(
          q.project,
          adPlanStatusesFilter,
          token,
        );
        // console.log(meta);
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
      } else {
        // ids переданы извне — всё равно подтянем метаданные для обогащения (name/status/limits/groups/refs)
        const adPlanStatusesFilter = this.parseStatusesFilter(q.status);
        const meta = await this.getAllAdPlanIdsCsv(
          q.project,
          adPlanStatusesFilter,
          token,
        );
        adPlanStatuses = meta.statusById;
        adPlanNames = meta.nameById;
        budgetLimitDayById = meta.budgetLimitDayById;
        adGroupsById = meta.adGroupsById;
        refsByPlan = meta.refsByPlan;
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
          // ad_group_status: q.status,
        };
        data = await this.fetchStatsAggregated(
          q.project,
          'ad_plans',
          idsList,
          q2,
          token,
        );
      } else {
        // 3б) Немного id — запрашиваем напрямую v3
        data = await this.getWithRetry(
          url,
          {
            id: idsParam,
            date_from: q.date_from,
            date_to: q.date_to,
            fields: 'base',
            attribution: 'conversion',
            // ad_group_status: q.status,
            sort_by: 'base.shows',
            d: q.d || 'desc',
            limit: q.limit || 250,
            offset: q.offset || 0,
          },
          4,
          token,
        );
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
            q.project,
            Array.from(new Set(allGroupIds)),
            q.status && q.status !== 'all' ? q.status : undefined,
            token,
          );
          for (const it of itemsArr) {
            const gids = Array.isArray(it.ad_groups) ? it.ad_groups : [];
            const acc: number[] = [];
            for (const gid of gids) {
              const bs = bannersByGroup[gid] || [];
              if (bs.length) acc.push(...bs);
            }
            it.banners = Array.from(new Set(acc));
            const bannerRefs = it.banners.map((b) => String(b));
            const utmRefs = Array.isArray(it.refs) ? it.refs : [];
            const combined = Array.from(new Set([...utmRefs, ...bannerRefs]));
            it.refs = combined;
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
            spentNds = Number((rawSpent * 1.2).toFixed(2));
          } catch {}
          it.maketPrice = it.makets
            ? Number((spentNds / it.makets).toFixed(2))
            : 0;
          it.drr = it.dealsPrice
            ? Number(((spentNds / it.dealsPrice) * 100).toFixed(2))
            : 0;
          (it as any).spent_nds = spentNds;
        });
        try {
          const dealsPrice_total = itemsArr.reduce((s: number, x: any) => s + Number((x as any).dealsPrice || 0), 0);
          const makets_total = itemsArr.reduce((s: number, x: any) => s + Number((x as any).makets || 0), 0);
          const rawSpentTotal = Number(((data as any)?.total?.base?.spent ?? (data as any)?.total?.base?.spend ?? 0) as number) || 0;
          const spentNds_total = Number((rawSpentTotal * 1.2).toFixed(2));
          const maketPrice_total = makets_total ? Number((spentNds_total / makets_total).toFixed(2)) : 0;
          const drr_total = dealsPrice_total ? Number(((spentNds_total / dealsPrice_total) * 100).toFixed(2)) : 0;
          (data as any).dealsPrice_total = dealsPrice_total;
          (data as any).makets_total = makets_total;
          (data as any).maketPrice_total = maketPrice_total;
          (data as any).drr_total = drr_total;
        } catch {}
      }
      // no noisy logs in production
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
        spent_nds?: number;
      }> & { ad_group_count: number; banners_count: number };
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
      drr?: number;
      banners_count?: number;
      banners?: number[];
    }>
  > {
    try {
      const token = this.getTokenForProject(q.project);
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
        const meta = await this.getAllAdGroupIdsMeta(
          q.project,
          statusesFilter,
          token,
        );

        groupIds = meta.ids.slice();
        nameById = meta.nameById;
        budgetLimitDayById = meta.budgetLimitDayById as any;
        refById = meta.refById;
        statusById = meta.statusById;
      } else {
        // 2б) ids заданы — все равно подгрузим метаданные для обогащения
        // For provided ids, still need meta for enrichment
        const meta = await this.getAllAdGroupIdsMeta(
          q.project,
          statusesFilter,
          token,
        );
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
      // Fetch banners per group to compute counts
      const bannersByGroup = await this.fetchBannersByGroupIds(
        q.project,
        Array.from(new Set(groupIds)),
        undefined, // не фильтруем по статусу на этом слое
        token,
      );

      // 3) Подготовить агрегаторы по ref: utm группы + id всех баннеров этих групп
      const uniqueRefs = new Set<string>();
      for (const gid of groupIds) {
        const utmRefs = refById[gid] || [];
        for (const r of utmRefs) if (r && String(r).length) uniqueRefs.add(String(r));
        const bs = bannersByGroup[gid] || [];
        for (const b of bs) if (Number.isFinite(b)) uniqueRefs.add(String(b));
      }

      const dealsSumByRef: Record<string, number> = {};
      const maketsByRef: Record<string, number> = {};
      if (uniqueRefs.size) {
        const refs = Array.from(uniqueRefs);
        const maps = await this.computeDealsAndMaketsByRefs(
          refs,
          q.date_from,
          q.date_to,
        );
        Object.assign(dealsSumByRef, maps.dealsByRef);
        Object.assign(maketsByRef, maps.maketsByRef);
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
          // без фильтра статуса на v3
          limit: q.limit || 250,
          offset: q.offset || 0,
        };
        data = await this.fetchStatsAggregated(
          q.project,
          'ad_groups',
          groupIds,
          q2,
          token,
        );
      } else {
        data = await this.getWithRetry(
          url,
          {
            id: idsCsv,
            date_from: q.date_from,
            date_to: q.date_to,
            fields: 'base',
            attribution: 'conversion',
            // без фильтра статуса на v3
            sort_by: 'base.shows',
            d: q.d || 'desc',
            limit: q.limit || 250,
            offset: q.offset || 0,
          },
          4,
          token,
        );
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
            const utmRefsArr = Array.isArray(refById[idNum]) ? refById[idNum] : [];
            if (utmRefsArr.length) it.ref = utmRefsArr[0];
            it.refs = utmRefsArr.slice();
            // banners count per group
            try {
              const bs = bannersByGroup[idNum] || [];
              it.banners_count = Array.isArray(bs) ? bs.length : 0;
              it.banners = Array.isArray(bs) ? Array.from(new Set(bs)) : [];
              const bannerRefs = Array.isArray(it.banners)
                ? it.banners.map((b) => String(b))
                : [];
              const combined = Array.from(
                new Set([...(utmRefsArr || []), ...bannerRefs]),
              );
              it.refs = combined;
              if (utmRefsArr?.length) it.ref = utmRefsArr[0];
              else if (combined.length) it.ref = combined[0];
            } catch {
              it.banners_count = 0;
              it.banners = [];
            }
            // Compute dealsPrice and makets по объединенным refs
            const refsForMetrics = Array.isArray(it.refs) ? it.refs : [];
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
        // Normalize top-level counts: считаем уникальные
        const itemsArr = (data as any).items as Array<any>;
        const groupsSet = new Set<number>();
        const bannersSet = new Set<number>();
        for (const it of itemsArr) {
          const gid = Number(it.id);
          if (Number.isFinite(gid)) groupsSet.add(gid);
          const bs = Array.isArray(it.banners) ? it.banners : [];
          for (const b of bs) if (Number.isFinite(b)) bannersSet.add(b);
        }
        (data as any).ad_group_count = groupsSet.size;
        (data as any).banners_count = bannersSet.size;
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
      ad_groups?: number[];
      banners?: number[];
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
      const token =
        q.project === 'book' ? this.VK_ADS_BOOK_TOKEN : this.VK_ADS_TOKEN;
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
        const meta = await this.getAllBannerIdsMeta(
          q.project,
          statusesFilter,
          token,
        );
        bannerIds = meta.ids.slice();
        statusByBannerId = meta.statusById;
        nameByBannerId = meta.nameById;
        adGroupByBannerId = meta.adGroupIdByBannerId;
      } else {
        // Even with explicit ids, fetch meta to enrich
        const meta = await this.getAllBannerIdsMeta(
          q.project,
          undefined,
          token,
        );
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

      // Подсчет бизнес-метрик одним батчем для всех баннеров (adTag = id баннера)
      const idRefs = bannerIds.map((b) => String(b));
      const metricsMaps = await this.computeDealsAndMaketsByRefs(
        idRefs,
        q.date_from,
        q.date_to,
      );
      const dealsSumByRef = metricsMaps.dealsByRef || {};
      const maketsByRef = metricsMaps.maketsByRef || {};

      // Агрегированный путь (до оптимизаций): один v3-запрос по всем id (или через fetchStatsAggregated)
      {
        const url = `/api/v3/statistics/banners/day.json`;
        const idsCsv = bannerIds.join(',');
        const needsAggregate = bannerIds.length > 200 || idsCsv.length > 1500;
        let data: any;
        if (needsAggregate) {
          const q2: any = {
            date_from: q.date_from,
            date_to: q.date_to,
            fields: 'base',
            attribution: 'conversion',
            sort_by: q.sort_by || 'base.shows',
            d: q.d || 'desc',
            limit: q.limit || 250,
            offset: q.offset || 0,
          };
          data = await this.fetchStatsAggregated(q.project, 'banners', bannerIds, q2, token);
        } else {
          data = await this.getWithRetry(
            url,
            {
              id: idsCsv,
              date_from: q.date_from,
              date_to: q.date_to,
              fields: 'base',
              attribution: 'conversion',
              sort_by: q.sort_by || 'base.shows',
              d: q.d || 'desc',
              limit: q.limit || 250,
              offset: q.offset || 0,
            },
            4,
            token,
          );
        }

        if (Array.isArray((data as any)?.items)) {
          const items = (data as any).items as Array<{
            id: number | string;
            status?: string;
            name?: string;
            ad_group_id?: number;
            ad_groups?: number[];
            banners?: number[];
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
            if (statusByBannerId[idNum] !== undefined) it.status = statusByBannerId[idNum];
            if (nameByBannerId[idNum] !== undefined) it.name = nameByBannerId[idNum];
            const gid = adGroupByBannerId[idNum];
            if (Number.isFinite(gid as any)) it.ad_group_id = gid as number;
            // Требуемый формат: пустые массивы и refs строго по id баннера
            const idStr = String(idNum);
            it.ad_groups = [];
            it.banners = [];
            it.ref = idStr;
            it.refs = [idStr];
            // Метрики из батч-карт
            it.dealsPrice = dealsSumByRef[idStr] || 0;
            it.makets = maketsByRef[idStr] || 0;
            // spent_nds
            try {
              const rawSpent = Number((it as any)?.total?.base?.spent ?? (it as any)?.total?.base?.spend ?? 0) || 0;
              it.spent_nds = Number((rawSpent * 1.2).toFixed(2));
            } catch { it.spent_nds = 0; }
            it.maketPrice = it.makets ? Number(((it.spent_nds || 0) / it.makets).toFixed(2)) : 0;
            const spentForDrr = Number(it.spent_nds || 0);
            it.drr = it.dealsPrice ? Number(((spentForDrr / it.dealsPrice) * 100).toFixed(2)) : 0;
          }

          // Counters
          const adGroupSet = new Set<number>();
          for (const it of items) {
            const gid = Number((it as any)?.ad_group_id);
            if (Number.isFinite(gid)) adGroupSet.add(gid);
          }
          (data as any).ad_group_count = adGroupSet.size;
          (data as any).banners_count = new Set(items.map((i) => Number(i.id))).size;
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
      }

      // Метрики батчем + персонифицированный v3 с пулом параллелизма
      const url = `/api/v3/statistics/banners/day.json`;
      const pool = Math.max(1, Number(process.env.VK_ADS_BANNERS_POOL) || 1);
      const paceMs = Math.max(0, Number(process.env.VK_ADS_BANNERS_PACE_MS) || 500);
      const results = await this.mapPool(bannerIds, pool, async (bid) => {
        const resp = await this.getWithRetry(
          url,
          {
            id: String(bid),
            date_from: q.date_from,
            date_to: q.date_to,
            fields: 'base',
            attribution: 'conversion',
          },
          8,
          token,
        );
        const v3item =
          Array.isArray(resp?.items) && resp.items.length
            ? resp.items[0]
            : { id: bid, total: { base: {} } };
        const idNum =
          typeof v3item?.id === 'number'
            ? v3item.id
            : Number(v3item?.id ?? bid);
        if (!Number.isFinite(idNum)) return null;
        const idStr = String(idNum);
        const it: any = {
          id: idNum,
          status: statusByBannerId[idNum],
          name: nameByBannerId[idNum],
          ad_group_id: adGroupByBannerId[idNum],
          ad_groups: [],
          banners: [],
          ref: idStr,
          refs: [idStr],
          total: v3item?.total || { base: {} },
        };
        it.dealsPrice = dealsSumByRef[idStr] || 0;
        it.makets = maketsByRef[idStr] || 0;
        try {
          const rawSpent =
            Number(it?.total?.base?.spent ?? it?.total?.base?.spend ?? 0) || 0;
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
        if (pool === 1 && paceMs) await this.wait(paceMs);
        return it;
      });

      const items = results.filter((x) => !!x) as any[];

      // Батчевый upsert в одну транзакцию
      const upserts: Prisma.PrismaPromise<any>[] = [];
      for (const it of items) {
        const idStr = String(it.id);
        upserts.push(
          this.prisma.vkAdsDailyStat.upsert({
            where: {
              project_entity_entityId_date: {
                project: q.project,
                entity: 'banners',
                entityId: Number(it.id),
                date: q.date_from,
              },
            },
            create: {
              project: q.project,
              entity: 'banners',
              entityId: Number(it.id),
              date: q.date_from,
              total: it.total,
              status: it.status ?? null,
              name: it.name ?? null,
              budgetLimitDay: null,
              adGroupId: it.ad_group_id ?? null,
              adGroups: [],
              banners: [],
              refs: [idStr],
              dealsPrice: it.dealsPrice || 0,
              makets: it.makets || 0,
              spentNds: it.spent_nds || 0,
              maketPrice: it.maketPrice || 0,
              drr: it.drr || 0,
            },
            update: {
              total: it.total,
              status: it.status ?? null,
              name: it.name ?? null,
              adGroupId: it.ad_group_id ?? null,
              refs: [idStr],
              dealsPrice: it.dealsPrice || 0,
              makets: it.makets || 0,
              spentNds: it.spent_nds || 0,
              maketPrice: it.maketPrice || 0,
              drr: it.drr || 0,
            },
          }),
        );
      }
      if (upserts.length) await this.prisma.$transaction(upserts);

      const adGroupSet = new Set<number>();
      for (const it of items) {
        const gid = Number((it as any)?.ad_group_id);
        if (Number.isFinite(gid)) adGroupSet.add(gid);
      }
      const data = {
        items,
        ad_group_count: adGroupSet.size,
        banners_count: new Set(items.map((i) => Number(i.id))).size,
        count: items.length,
        limit: q.limit || 250,
        offset: q.offset || 0,
        total: {},
      } as any;

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

  async getAdPlanGroupsData(
    id: number,
    status: string | undefined,
    authToken?: string,
  ) {
    const url = '/api/v2/ad_groups.json';
    try {
      const data = await this.getWithRetry(
        url,
        {
          fields: 'ad_plan_id,id,name,utm,budget_limit_day', // utm — ref=...
          _ad_plan_id: id,
          _status__in:
            status && status !== 'all' ? status : 'active,blocked,deleted',
        },
        4,
        authToken,
      );
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
