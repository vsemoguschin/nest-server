import axios, { AxiosInstance } from 'axios';
import { Injectable, HttpException } from '@nestjs/common';

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

  private handleError(e: any) {
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
    const diff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diff > 366) {
      throw new HttpException(
        { code: 'ERR_LIMIT_EXCEEDED', message: 'Date range must be <= 366 days' },
        400,
      );
    }
  }

  async getV3Day(q: any) {
    const url = `/api/v3/statistics/${q.entity}/day.json`;
    try {
      this.ensureIdLimit(q.ids);
      this.ensureDateRange(q.date_from, q.date_to);
      const { data } = await this.http.get(url, {
        params: {
          id: q.ids,
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
          limit: q.limit || 20,
          offset: q.offset || 0,
        },
      });
      return data;
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
          limit: q.limit ?? 20,
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
      return data;
    } catch (e) {
      this.handleError(e);
    }
  }
}
