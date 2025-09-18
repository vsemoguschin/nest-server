import axios, { AxiosInstance } from 'axios';
import { Injectable, HttpException } from '@nestjs/common';
import { StatsDayResponse } from './dto/statistics-day.dto';
import { AdPlan, AdPlansListResponse } from './dto/ad-plans.dto';
import { AdGroupsListResponse } from './dto/ad-groups.dto';

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

  constructor() {
    this.http = axios.create({
      baseURL: this.VK_ADS_API_HOST,
      headers: { Authorization: `Bearer ${this.VK_ADS_TOKEN}` },
      timeout: 20000,
    });
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

  private async getWithRetry<T = any>(url: string, params: any, retries = 4): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        const { data } = await this.http.get(url, { params });
        return data as T;
      } catch (e: any) {
        const status = e?.response?.status;
        const retryAfter = this.parseRetryAfter(e?.response?.headers?.['retry-after'] || e?.response?.headers?.['Retry-After']);
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

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      let offset = 0;
      while (true) {
        const data = await this.getWithRetry(url, {
          ...baseParams,
          id: chunk.join(','),
          limit: perPage,
          offset,
        });
        const items = (data as any)?.items ?? [];
        allItems.push(...items);
        if (!items.length || items.length < perPage) break;
        offset += items.length;
      }
    }

    return { count: allItems.length, offset: 0, items: allItems } as StatsDayResponse;
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

  private ensureIdLimit(ids?: string) {
    if (!ids) return;
    const list = String(ids)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 200) {
      throw new HttpException(
        { code: 'ERR_LIMIT_EXCEEDED', message: 'Too many ids: max 200' },
        400,
      );
    }
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

  async getV3Day(q: any): Promise<StatsDayResponse<{ status?: string; name?: string }>> {
    const url = `/api/v3/statistics/${q.entity}/day.json`;
    try {
      let idsParam = q.ids as string | undefined;
      let adPlanStatuses: Record<number, string> | undefined;
      let adPlanNames: Record<number, string> | undefined;
      let bannerStatuses: Record<number, string> | undefined;
      let adGroupStatuses: Record<number, string> | undefined;
      let adGroupNames: Record<number, string> | undefined;
      if (q.entity === 'ad_plans') {
        // Auto-populate with all ad plan IDs and collect status
        const meta = await this.getAllAdPlanIdsCsv();
        idsParam = meta.idsCsv;
        adPlanStatuses = meta.statusById;
        adPlanNames = meta.nameById;
        if (!idsParam) {
          throw new HttpException(
            { code: 'ERR_WRONG_IDS', message: 'Рекламные кампании не найдены' },
            404,
          );
        }
      } else if (q.entity === 'banners') {
        const meta = await this.getAllBannerIdsCsv(q.limit);
        idsParam = meta.idsCsv;
        bannerStatuses = meta.statusById;
        if (!idsParam) {
          throw new HttpException(
            { code: 'ERR_WRONG_IDS', message: 'Объявления не найдены' },
            404,
          );
        }
      } else if (q.entity === 'ad_groups') {
        const meta = await this.getAllAdGroupIdsCsv(q.limit);
        idsParam = meta.idsCsv;
        adGroupStatuses = meta.statusById;
        adGroupNames = meta.nameById;
        if (!idsParam) {
          throw new HttpException(
            { code: 'ERR_WRONG_IDS', message: 'Группы объявлений не найдены' },
            404,
          );
        }
      } else {
        this.ensureIdLimit(idsParam);
      }
      this.ensureDateRange(q.date_from, q.date_to);
      // If URL risks being too long, or too many ids, fetch in chunks and aggregate
      const idsList = this.splitIdsCsv(idsParam);
      const needsAggregate = idsList.length > 200 || String(idsParam || '').length > 1500;
      let data: any;
      if (needsAggregate) {
        data = await this.fetchStatsAggregated(q.entity, idsList, q);
      } else {
        data = await this.getWithRetry(url, {
          id: idsParam,
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
          limit: q.limit || 250,
          offset: q.offset || 0,
        });
      }
      // Enrich each item with ad plan status and name when applicable
      if (q.entity === 'ad_plans' && Array.isArray((data as any)?.items)) {
        for (const it of (data as any).items as Array<{ id: number | string; status?: string; name?: string }>) {
          const idNum = typeof it?.id === 'number' ? it.id : Number(it?.id);
          if (!Number.isNaN(idNum)) {
            if (adPlanStatuses && adPlanStatuses[idNum]) it.status = adPlanStatuses[idNum];
            if (adPlanNames && adPlanNames[idNum]) it.name = adPlanNames[idNum];
          }
        }
      }
      // Enrich with banner status when applicable
      if (q.entity === 'banners' && Array.isArray((data as any)?.items) && bannerStatuses) {
        for (const it of (data as any).items as Array<{ id: number | string; status?: string }>) {
          const idNum = typeof it?.id === 'number' ? it.id : Number(it?.id);
          if (!Number.isNaN(idNum) && bannerStatuses[idNum]) {
            it.status = bannerStatuses[idNum];
          }
        }
      }
      // Enrich ad_groups with status and name
      if (q.entity === 'ad_groups' && Array.isArray((data as any)?.items)) {
        for (const it of (data as any).items as Array<{ id: number | string; status?: string; name?: string }>) {
          const idNum = typeof it?.id === 'number' ? it.id : Number(it?.id);
          if (!Number.isNaN(idNum)) {
            if (adGroupStatuses && adGroupStatuses[idNum]) it.status = adGroupStatuses[idNum];
            if (adGroupNames && adGroupNames[idNum]) it.name = adGroupNames[idNum];
          }
        }
      }
      return data as StatsDayResponse<{ status?: string; name?: string }>;
    } catch (e) {
      this.handleError(e);
    }
  }

  private async getAllAdPlanIdsCsv(): Promise<{ idsCsv: string; statusById: Record<number, string>; nameById: Record<number, string> }> {
    const limit = 250;
    const statuses = ['active', 'blocked', 'deleted'];
    const ids: number[] = [];
    const statusById: Record<number, string> = {};
    const nameById: Record<number, string> = {};
    try {
      for (const st of statuses) {
        let offset = 0;
        let total = Infinity;
        while (offset < total) {
          const data = await this.getWithRetry(`/api/v2/ad_plans.json`, { limit, offset, _status: st });
          const items: any[] = (data as any)?.items ?? [];
          const count: number = typeof (data as any)?.count === 'number' ? (data as any).count : items.length + offset;
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
      return { idsCsv: ids.join(','), statusById, nameById };
    } catch (e) {
      this.handleError(e);
    }
  }

  private async getAllBannerIdsCsv(totalLimit?: number): Promise<{ idsCsv: string; statusById: Record<number, string> }> {
    const limit = 250;
    const statuses = ['active', 'blocked', 'deleted'];
    const ids: number[] = [];
    const statusById: Record<number, string> = {};
    try {
      const target = Number.isFinite(totalLimit as any) && (totalLimit as number) > 0 ? (totalLimit as number) : Infinity;
      for (const st of statuses) {
        let offset = 0;
        let total = Infinity;
        while (offset < total) {
          const pageSize = Math.min(limit, Math.max(1, target - ids.length));
          const data = await this.getWithRetry(`/api/v2/banners.json`, { limit: pageSize, offset, _status: st });
          const items: any[] = (data as any)?.items ?? [];
          const count: number = typeof (data as any)?.count === 'number' ? (data as any).count : items.length + offset;
          total = count;
          for (const it of items) {
            if (it && typeof it.id === 'number') {
              ids.push(it.id);
              statusById[it.id] = st;
            }
          }
          if (!items.length) break;
          offset += items.length;
          if (ids.length >= target) break;
        }
        if (ids.length >= target) break;
      }
      return { idsCsv: ids.join(','), statusById };
    } catch (e) {
      this.handleError(e);
    }
  }

  private async getAllAdGroupIdsCsv(totalLimit?: number): Promise<{ idsCsv: string; statusById: Record<number, string>; nameById: Record<number, string> }> {
    const limit = 250;
    const statuses = ['active', 'blocked', 'deleted'];
    const ids: number[] = [];
    const statusById: Record<number, string> = {};
    const nameById: Record<number, string> = {};
    try {
      const target = Number.isFinite(totalLimit as any) && (totalLimit as number) > 0 ? (totalLimit as number) : Infinity;
      for (const st of statuses) {
        let offset = 0;
        let total = Infinity;
        while (offset < total) {
          const pageSize = Math.min(limit, Math.max(1, target - ids.length));
          const data = await this.getWithRetry(`/api/v2/ad_groups.json`, { limit: pageSize, offset, _status: st });
          const items: any[] = (data as any)?.items ?? [];
          const count: number = typeof (data as any)?.count === 'number' ? (data as any).count : items.length + offset;
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
          if (ids.length >= target) break;
        }
        if (ids.length >= target) break;
      }
      return { idsCsv: ids.join(','), statusById, nameById };
    } catch (e) {
      this.handleError(e);
    }
  }

  async getGoals(q: any) {
    const url = `/api/v2/statistics/goals/${q.entity}/day.json`;
    try {
      this.ensureIdLimit(q.ids);
      this.ensureDateRange(q.date_from, q.date_to);
      const { data } = await this.http.get(url, {
        params: {
          id: q.ids,
          date_from: q.date_from,
          date_to: q.date_to,
          attribution: q.attribution || 'conversion',
          conversion_type: q.conversion_type || 'postclick',
        },
      });
      return data;
    } catch (e) {
      this.handleError(e);
    }
  }

  async getAdGroups(q: any): Promise<AdGroupsListResponse> {
    const url = `/api/v2/ad_groups.json`;
    try {
      const { data } = await this.http.get(url, {
        params: {
          limit: q.limit ?? 20,
          offset: q.offset ?? 0,
          _id: q._id,
          _id__in: q._id__in,
          _status: q._status,
          _status__ne: q._status__ne,
          _status__in: q._status__in,
          _last_updated__gt: q._last_updated__gt,
          _last_updated__gte: q._last_updated__gte,
          _last_updated__lt: q._last_updated__lt,
          _last_updated__lte: q._last_updated__lte,
          sorting: q.sorting,
        },
      });
      return data as AdGroupsListResponse;
    } catch (e) {
      this.handleError(e);
    }
  }

  async getInapp(q: any) {
    const url = `/api/v2/statistics/inapp/${q.entity}/day.json`;
    try {
      this.ensureIdLimit(q.ids);
      this.ensureDateRange(q.date_from, q.date_to);
      const { data } = await this.http.get(url, {
        params: {
          id: q.ids,
          date_from: q.date_from,
          date_to: q.date_to,
          attribution: q.attribution || 'conversion',
          conversion_type: q.conversion_type || 'postclick',
        },
      });
      return data;
    } catch (e) {
      this.handleError(e);
    }
  }

  async getFaststat(q: any) {
    const url = `/api/v3/statistics/faststat/${q.entity}.json`;
    try {
      this.ensureIdLimit(q.ids);
      const { data } = await this.http.get(url, { params: { id: q.ids } });
      return data;
    } catch (e) {
      this.handleError(e);
    }
  }

  async getOfflineConversions(q: any) {
    const url = `/api/v2/statistics/offline_conversions/${q.entity}/${q.mode}.json`;
    try {
      this.ensureIdLimit(q.ids);
      this.ensureDateRange(q.date_from, q.date_to);
      const { data } = await this.http.get(url, {
        params: {
          id: q.ids,
          date_from: q.date_from,
          date_to: q.date_to,
        },
      });
      return data;
    } catch (e) {
      this.handleError(e);
    }
  }

  async getBanners(q: any) {
    const url = `/api/v2/banners.json`;
    try {
      const { data } = await this.http.get(url, {
        params: {
          limit: 250,
          offset: q.offset ?? 0,
          _id: q._id,
          _id__in: q._id__in,
          _ad_group_id: q._ad_group_id,
          _ad_group_id__in: q._ad_group_id__in,
          _ad_group_status: 'active',
          // _ad_group_status__ne: q._ad_group_status__ne,
          // _ad_group_status__in: q._ad_group_status__in,
          _status: 'active',
          // _status__ne: q._status__ne,
          // _status__in: q._status__in,
          _updated__gt: q._updated__gt,
          _updated__gte: q._updated__gte,
          _updated__lt: q._updated__lt,
          _updated__lte: q._updated__lte,
          _url: q._url,
          _textblock: q._textblock,
        },
      });
      // const { data: b } = await this.http.get('/api/v2/ad_groups/187590465.json?fields=utm', {

      // });
      // console.log(b);
      return data;
    } catch (e) {
      this.handleError(e);
    }
  }

  async getAdPlans(q: any): Promise<AdPlansListResponse> {
    const url = `/api/v2/ad_plans.json`;
    try {
      const { data } = await this.http.get(url, {
        params: {
          limit: q.limit ?? 20,
          offset: q.offset ?? 0,
          _id: q._id,
          _id__in: q._id__in,
          _status: q._status,
          _status__ne: q._status__ne,
          _status__in: q._status__in,
          sorting: q.sorting,
        },
      });
      return data as AdPlansListResponse;
    } catch (e) {
      this.handleError(e);
    }
  }

  async createAdPlan(body: any) {
    const url = `/api/v2/ad_plans.json`;
    try {
      const { data } = await this.http.post(url, body);
      return data;
    } catch (e) {
      this.handleError(e);
    }
  }

  async getAdPlan(id: number, q?: { fields?: string }): Promise<AdPlan> {
    const url = `/api/v2/ad_plans/${id}.json`;
    try {
      const { data } = await this.http.get(url, {
        params: { fields: q?.fields },
      });
      return data as AdPlan;
    } catch (e) {
      this.handleError(e);
    }
  }
}
