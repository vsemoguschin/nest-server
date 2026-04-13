import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import {
  VkAdsTestAuthContext,
  VkAdsTestAuthService,
} from '../services/vk-ads-test-auth.service';

type Primitive = string | number | boolean;
type QueryValue =
  | Primitive
  | null
  | undefined
  | Array<string | number | boolean>;
type QueryParams = Record<string, QueryValue>;
type JsonObject = Record<string, unknown>;

export type VkAdsEntityWritePayload = Record<string, unknown>;

export type VkAdsPackagesParams = QueryParams;
export type VkAdsLeadFormsParams = QueryParams;
export type VkAdsAdGroupsParams = QueryParams;
export type VkAdsBannersParams = QueryParams;

export type VkAdsStatsDayParams = {
  date_from: string;
  date_to?: string;
  id?: number | string | Array<number | string>;
  id_ne?: number | string | Array<number | string>;
  fields?: string | string[];
  attribution?: 'conversion' | 'impression';
  banner_status?: string | string[];
  banner_status_ne?: string | string[];
  ad_group_status?: string | string[];
  ad_group_status_ne?: string | string[];
  ad_group_id?: number | string | Array<number | string>;
  ad_group_id_ne?: number | string | Array<number | string>;
  package_id?: number | string | Array<number | string>;
  package_id_ne?: number | string | Array<number | string>;
  sort_by?: string;
  d?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
} & QueryParams;

export type VkAdsUrl = {
  id: number;
  url?: string;
  url_types?: string[];
  counters?: string[];
  has_goals?: boolean;
  preview_link?: string;
};

export type VkAdsEntityRef = {
  id: number;
  [key: string]: unknown;
};

export type VkAdsListResponse<T> = {
  count?: number;
  offset?: number;
  limit?: number;
  items: T[];
  total?: unknown;
};

export type VkAdsCreateUrlPayload = {
  url: string;
};

export type VkAdsCreateIdResponse = {
  id: number | string;
  ad_groups?: Array<{ id: number | string }>;
  banners?: Array<{ id: number | string }>;
  [key: string]: unknown;
};

export type VkAdsFieldError = {
  code?: string;
  message?: string;
};

export class VkAdsTestClientError extends Error {
  readonly status?: number;
  readonly method: string;
  readonly endpoint: string;
  readonly vkErrorCode?: string;
  readonly vkErrorMessage?: string;
  readonly fieldErrors?: Record<string, VkAdsFieldError>;
  readonly rawError?: unknown;

  constructor(params: {
    message: string;
    status?: number;
    method: string;
    endpoint: string;
    vkErrorCode?: string;
    vkErrorMessage?: string;
    fieldErrors?: Record<string, VkAdsFieldError>;
    rawError?: unknown;
  }) {
    super(params.message);
    this.name = 'VkAdsTestClientError';
    this.status = params.status;
    this.method = params.method;
    this.endpoint = params.endpoint;
    this.vkErrorCode = params.vkErrorCode;
    this.vkErrorMessage = params.vkErrorMessage;
    this.fieldErrors = params.fieldErrors;
    this.rawError = params.rawError;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 4;

@Injectable()
export class VkAdsTestClient {
  private readonly logger = new Logger(VkAdsTestClient.name);
  private readonly clients = new Map<string, AxiosInstance>();

  constructor(private readonly authService: VkAdsTestAuthService) {}

  async getPackages(
    integrationId: number,
    params?: VkAdsPackagesParams,
  ): Promise<VkAdsListResponse<JsonObject>> {
    return this.get<VkAdsListResponse<JsonObject>>(
      integrationId,
      '/api/v2/packages.json',
      params,
    );
  }

  async createUrl(
    integrationId: number,
    payload: VkAdsCreateUrlPayload,
  ): Promise<VkAdsCreateIdResponse> {
    return this.post<VkAdsCreateIdResponse>(
      integrationId,
      '/api/v2/urls.json',
      payload,
    );
  }

  async getUrl(integrationId: number, urlId: number | string): Promise<VkAdsUrl> {
    return this.get<VkAdsUrl>(integrationId, `/api/v2/urls/${urlId}.json`);
  }

  async createAdPlan(
    integrationId: number,
    payload: VkAdsEntityWritePayload,
    urlId: number | string,
  ): Promise<VkAdsCreateIdResponse> {
    // Runtime contract for POST /api/v2/ad_plans.json expects a single campaign object.
    // The promoted URL is passed through ad_object_id/ad_object_type; package_id belongs to nested ad_groups.
    const requestBody = {
      ...payload,
      ad_object_id: urlId,
      ad_object_type: 'url',
    };
    this.logger.warn(
      JSON.stringify({
        scope: 'vk-ads-test-client',
        event: 'createAdPlan.request.debug',
        integrationId,
        endpoint: '/api/v2/ad_plans.json',
        requestBody,
      }),
    );

    const response = await this.post<VkAdsCreateIdResponse>(
      integrationId,
      '/api/v2/ad_plans.json',
      requestBody,
    );
    this.logger.warn(
      JSON.stringify({
        scope: 'vk-ads-test-client',
        event: 'createAdPlan.response.debug',
        integrationId,
        endpoint: '/api/v2/ad_plans.json',
        response,
      }),
    );

    return this.normalizeCreateAdPlanResponse(integrationId, response);
  }

  async updateAdPlan(
    integrationId: number,
    adPlanId: number | string,
    payload: VkAdsEntityWritePayload,
  ): Promise<void> {
    await this.post<void>(
      integrationId,
      `/api/v2/ad_plans/${adPlanId}.json`,
      payload,
    );
  }

  async updateCampaignStatus(
    integrationId: number,
    campaignId: number | string,
    status: 'active' | 'blocked',
  ): Promise<void> {
    await this.updateAdPlan(integrationId, campaignId, { status });
  }

  async getAdPlan(
    integrationId: number,
    adPlanId: number | string,
    params?: QueryParams,
  ): Promise<JsonObject> {
    return this.get<JsonObject>(
      integrationId,
      `/api/v2/ad_plans/${adPlanId}.json`,
      params,
    );
  }

  async createAdGroup(
    integrationId: number,
    payload: VkAdsEntityWritePayload,
  ): Promise<VkAdsCreateIdResponse> {
    return this.post<VkAdsCreateIdResponse>(
      integrationId,
      '/api/v2/ad_groups.json',
      payload,
    );
  }

  async updateAdGroup(
    integrationId: number,
    adGroupId: number | string,
    payload: VkAdsEntityWritePayload,
  ): Promise<void> {
    await this.post<void>(
      integrationId,
      `/api/v2/ad_groups/${adGroupId}.json`,
      payload,
    );
  }

  async updateAdGroupBudget(
    integrationId: number,
    adGroupId: number | string,
    budgetLimitDay: number | string,
  ): Promise<void> {
    await this.updateAdGroup(integrationId, adGroupId, {
      budget_limit_day: budgetLimitDay,
    });
  }

  async getAdGroup(
    integrationId: number,
    adGroupId: number | string,
    params?: QueryParams,
  ): Promise<JsonObject> {
    return this.get<JsonObject>(
      integrationId,
      `/api/v2/ad_groups/${adGroupId}.json`,
      params,
    );
  }

  async createBanner(
    integrationId: number,
    adGroupId: number | string,
    payload: VkAdsEntityWritePayload,
  ): Promise<VkAdsCreateIdResponse> {
    return this.post<VkAdsCreateIdResponse>(
      integrationId,
      `/api/v2/ad_groups/${adGroupId}/banners.json`,
      payload,
    );
  }

  async updateBanner(
    integrationId: number,
    bannerId: number | string,
    payload: VkAdsEntityWritePayload,
  ): Promise<void> {
    // VK Ads fully replaces urls/content/textblocks on banner update.
    await this.post<void>(
      integrationId,
      `/api/v2/banners/${bannerId}.json`,
      payload,
    );
  }

  async getBanner(
    integrationId: number,
    bannerId: number | string,
    params?: QueryParams,
  ): Promise<JsonObject> {
    return this.get<JsonObject>(
      integrationId,
      `/api/v2/banners/${bannerId}.json`,
      params,
    );
  }

  async getLeadForms(
    integrationId: number,
    params?: VkAdsLeadFormsParams,
  ): Promise<VkAdsListResponse<JsonObject>> {
    return this.get<VkAdsListResponse<JsonObject>>(
      integrationId,
      '/api/v1/lead_ads/lead_forms.json',
      params,
    );
  }

  async getAdGroups(
    integrationId: number,
    params?: VkAdsAdGroupsParams,
  ): Promise<VkAdsListResponse<JsonObject>> {
    return this.get<VkAdsListResponse<JsonObject>>(
      integrationId,
      '/api/v2/ad_groups.json',
      params,
    );
  }

  async getBanners(
    integrationId: number,
    params?: VkAdsBannersParams,
  ): Promise<VkAdsListResponse<JsonObject>> {
    return this.get<VkAdsListResponse<JsonObject>>(
      integrationId,
      '/api/v2/banners.json',
      params,
    );
  }

  async deleteBanner(
    integrationId: number,
    bannerId: number | string,
  ): Promise<void> {
    await this.delete(integrationId, `/api/v2/banners/${bannerId}.json`);
  }

  async deleteAdGroup(
    integrationId: number,
    adGroupId: number | string,
  ): Promise<void> {
    await this.delete(integrationId, `/api/v2/ad_groups/${adGroupId}.json`);
  }

  async getStatsByBannersDay(
    integrationId: number,
    params: VkAdsStatsDayParams,
  ): Promise<VkAdsListResponse<JsonObject>> {
    return this.get<VkAdsListResponse<JsonObject>>(
      integrationId,
      '/api/v3/statistics/banners/day.json',
      params,
    );
  }

  async getStatsByAdGroupsDay(
    integrationId: number,
    params: VkAdsStatsDayParams,
  ): Promise<VkAdsListResponse<JsonObject>> {
    return this.get<VkAdsListResponse<JsonObject>>(
      integrationId,
      '/api/v3/statistics/ad_groups/day.json',
      params,
    );
  }

  async getStatsByAdPlansDay(
    integrationId: number,
    params: VkAdsStatsDayParams,
  ): Promise<VkAdsListResponse<JsonObject>> {
    return this.get<VkAdsListResponse<JsonObject>>(
      integrationId,
      '/api/v3/statistics/ad_plans/day.json',
      params,
    );
  }

  private async get<T>(
    integrationId: number,
    endpoint: string,
    params?: QueryParams,
  ): Promise<T> {
    return this.request<T>(integrationId, 'GET', endpoint, { params });
  }

  private async post<T>(
    integrationId: number,
    endpoint: string,
    data?: JsonObject,
  ): Promise<T> {
    return this.request<T>(integrationId, 'POST', endpoint, { data });
  }

  private async delete(
    integrationId: number,
    endpoint: string,
  ): Promise<void> {
    await this.request<void>(integrationId, 'DELETE', endpoint);
  }

  private async normalizeCreateAdPlanResponse(
    integrationId: number,
    response: VkAdsCreateIdResponse,
  ): Promise<VkAdsCreateIdResponse> {
    const adGroups = this.extractAdGroupRefs(response);
    if (adGroups.length > 0) {
      return {
        ...response,
        ad_groups: adGroups,
      };
    }

    const adPlanId = this.asId(response.id);
    if (adPlanId === undefined) {
      return response;
    }

    // Some runtime responses return only campaign id; read back the groups created with the campaign.
    const discoveredAdGroups = await this.getAdGroups(integrationId, {
      fields: 'id,ad_plan_id,name,package_id,status',
      _ad_plan_id: adPlanId,
      _status__in: 'active,blocked,deleted',
      limit: 10,
      offset: 0,
      sorting: '-id',
    });
    const normalizedAdGroups = this.extractAdGroupRefs(discoveredAdGroups.items);

    this.logger.warn(
      JSON.stringify({
        scope: 'vk-ads-test-client',
        event: 'createAdPlan.response.normalized.debug',
        integrationId,
        endpoint: '/api/v2/ad_plans.json',
        adPlanId,
        adGroups: normalizedAdGroups,
      }),
    );

    return {
      ...response,
      ...(normalizedAdGroups.length > 0
        ? { ad_groups: normalizedAdGroups }
        : {}),
    };
  }

  private extractAdGroupRefs(value: unknown): Array<{ id: number | string }> {
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          const record = this.asRecord(item);
          const id = this.asId(record?.id);
          return id === undefined ? null : { id };
        })
        .filter((item): item is { id: number | string } => item !== null);
    }

    const record = this.asRecord(value);
    if (!record) {
      return [];
    }

    const candidateKeys = ['ad_groups', 'adGroups'];
    for (const key of candidateKeys) {
      const refs = this.extractAdGroupRefs(record[key]);
      if (refs.length > 0) {
        return refs;
      }
    }

    for (const key of ['campaign', 'ad_plan', 'adPlan']) {
      const refs = this.extractAdGroupRefs(record[key]);
      if (refs.length > 0) {
        return refs;
      }
    }

    return [];
  }

  private async request<T>(
    integrationId: number,
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    options: {
      params?: QueryParams;
      data?: JsonObject;
    } = {},
  ): Promise<T> {
    const context = await this.authService.resolveAuthContext(integrationId);
    const http = this.getHttp(context);
    const config: AxiosRequestConfig = {
      method,
      url: endpoint,
      params: this.normalizeParams(options.params),
      data: options.data,
    };

    return this.requestWithRetry<T>(http, config, context);
  }

  private getHttp(context: VkAdsTestAuthContext): AxiosInstance {
    const key = `${context.baseUrl}|${context.accessToken}`;
    const cached = this.clients.get(key);
    if (cached) {
      return cached;
    }

    const http = axios.create({
      baseURL: context.baseUrl,
      timeout: DEFAULT_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    this.clients.set(key, http);
    return http;
  }

  private async requestWithRetry<T>(
    http: AxiosInstance,
    config: AxiosRequestConfig,
    context: VkAdsTestAuthContext,
  ): Promise<T> {
    const method = String(config.method || 'GET').toUpperCase();
    const endpoint = String(config.url || '');

    for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt += 1) {
      try {
        const response = await http.request<T>(config);
        return response.data;
      } catch (error) {
        const parsed = this.parseError(error, method, endpoint);
        if (method === 'POST' && endpoint === '/api/v2/ad_plans.json') {
          this.logger.error(
            JSON.stringify({
              scope: 'vk-ads-test-client',
              event: 'createAdPlan.error.debug',
              integrationId: context.integrationId,
              endpoint,
              requestBody: config.data ?? null,
              status: parsed.status ?? null,
              responseBody: parsed.rawError ?? null,
            }),
          );
        }

        const retryAfterMs = this.parseRetryAfter(error);
        const shouldRetry = this.isRetryableError(error);
        const isLastAttempt = attempt >= DEFAULT_MAX_RETRIES;

        if (!shouldRetry || isLastAttempt) {
          throw parsed;
        }

        const baseDelayMs = parsed.status === 429 ? 1000 : 300;
        const backoffMs = Math.min(baseDelayMs * 2 ** attempt, 10_000);
        const delayMs = retryAfterMs ?? backoffMs;

        this.logger.warn(
          JSON.stringify({
            scope: 'vk-ads-test-client',
            event: 'request.retry',
            integrationId: context.integrationId,
            method,
            endpoint,
            attempt: attempt + 1,
            retryInMs: delayMs,
            status: parsed.status ?? null,
            vkErrorCode: parsed.vkErrorCode ?? null,
            message: parsed.vkErrorMessage ?? parsed.message,
          }),
        );

        await this.sleep(delayMs);
      }
    }

    throw new VkAdsTestClientError({
      message: `Unexpected retry loop exit for ${method} ${endpoint}`,
      method,
      endpoint,
    });
  }

  private normalizeParams(params?: QueryParams): Record<string, Primitive> | undefined {
    if (!params) return undefined;

    const normalized: Record<string, Primitive> = {};

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        normalized[key] = value.join(',');
        continue;
      }

      normalized[key] = value;
    }

    return normalized;
  }

  private parseError(
    error: unknown,
    method: string,
    endpoint: string,
  ): VkAdsTestClientError {
    if (!axios.isAxiosError(error)) {
      return new VkAdsTestClientError({
        message: `VK Ads request failed: ${method} ${endpoint}`,
        method,
        endpoint,
        rawError: error,
      });
    }

    const status = error.response?.status;
    const payload = this.asRecord(error.response?.data);
    const nestedError = this.asRecord(payload?.error);
    const topLevelCode = this.asString(payload?.code);
    const topLevelMessage = this.asString(payload?.message);
    const vkErrorCode = this.asString(nestedError?.code) || topLevelCode || undefined;
    const vkErrorMessage =
      this.asString(nestedError?.message) || topLevelMessage || undefined;
    const fieldErrors = this.parseFieldErrors(nestedError?.fields);

    const message =
      vkErrorMessage ||
      error.message ||
      `VK Ads request failed: ${method} ${endpoint}`;

    return new VkAdsTestClientError({
      message,
      status,
      method,
      endpoint,
      vkErrorCode,
      vkErrorMessage,
      fieldErrors,
      rawError: error.response?.data ?? error.toJSON?.() ?? error.message,
    });
  }

  private parseFieldErrors(
    value: unknown,
  ): Record<string, VkAdsFieldError> | undefined {
    const fields = this.asRecord(value);
    if (!fields) return undefined;

    const parsed: Record<string, VkAdsFieldError> = {};

    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      const entry = this.asRecord(fieldValue);
      parsed[fieldName] = {
        code: this.asString(entry?.code) || undefined,
        message: this.asString(entry?.message) || undefined,
      };
    }

    return Object.keys(parsed).length > 0 ? parsed : undefined;
  }

  private parseRetryAfter(error: unknown): number | undefined {
    if (!axios.isAxiosError(error)) return undefined;

    const rawHeader =
      error.response?.headers?.['retry-after'] ??
      error.response?.headers?.['Retry-After'];

    const retryAfter =
      Array.isArray(rawHeader) && rawHeader.length > 0 ? rawHeader[0] : rawHeader;

    if (typeof retryAfter === 'number' && Number.isFinite(retryAfter)) {
      return retryAfter * 1000;
    }

    if (typeof retryAfter === 'string') {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) {
        return seconds * 1000;
      }

      const timestamp = Date.parse(retryAfter);
      if (Number.isFinite(timestamp)) {
        return Math.max(0, timestamp - Date.now());
      }
    }

    return undefined;
  }

  private isRetryableError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;

    const status = error.response?.status;
    const isTimeout = error.code === 'ECONNABORTED';
    const isNetworkWithoutResponse = !error.response && Boolean(error.request);

    return (
      status === 429 ||
      (typeof status === 'number' && status >= 500 && status < 600) ||
      isTimeout ||
      isNetworkWithoutResponse
    );
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private asId(value: unknown): number | string | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) return value;
    return undefined;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
