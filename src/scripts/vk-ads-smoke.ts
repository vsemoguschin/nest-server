import 'dotenv/config';

import axios, { AxiosError, AxiosInstance } from 'axios';

type SmokeConfig = {
  enabled: boolean;
  token: string;
  baseUrl: string;
  packageId: number;
  objective?: string;
  landingUrl: string;
  campaignNamePrefix: string;
  adGroupNamePrefix: string;
  urlCheckTimeoutMs: number;
  urlCheckIntervalMs: number;
  cleanupEnabled: boolean;
};

type PackageInfo = {
  id: number;
  status?: string;
  objective: string[];
  url_types?: Record<string, string[][]>;
};

type AdGroupListItem = {
  id: number;
  name?: string;
  package_id?: number;
  status?: string;
  objective?: string;
};

type BannerListItem = {
  id: number;
  ad_group_id?: number;
  status?: string;
};

type BannerFieldValue = {
  id?: number;
  text?: string;
  [key: string]: unknown;
};

type BannerDetails = {
  id: number;
  name?: string;
  status?: string;
  content?: Record<string, BannerFieldValue>;
  textblocks?: Record<string, BannerFieldValue>;
  urls?: Record<string, BannerFieldValue>;
};

type UrlInfo = {
  id: number;
  url?: string;
  url_types?: string[];
};

type FieldError = {
  code?: string;
  message?: string;
};

type VkAdsApiError = {
  code?: string;
  message?: string;
  fields?: Record<string, FieldError>;
};

type KnownUrlConstraintCode =
  | 'persistent_urls'
  | 'one_url_object_id'
  | 'ad_group_one_url'
  | 'campaign_one_url';

type BannerTemplateSource =
  | 'runtime_existing_banner'
  | 'runtime_package_metadata'
  | 'docs_minimal_payload'
  | 'unknown';

type CleanupResult = {
  enabled: boolean;
  attempted: boolean;
  banner1Deleted: boolean;
  banner2Deleted: boolean;
  adGroupDeleted: boolean;
  campaignBlocked: boolean;
  details: {
    bannerDeletes: Array<{ id: number; ok: boolean; message?: string }>;
    adGroupDelete?: { id: number; ok: boolean; message?: string };
    adPlanBlock?: { id: number; ok: boolean; message?: string };
  };
};

type SmokeOutcome = {
  ok: boolean;
  scriptSucceeded: boolean;
  packageId: number;
  objectiveUsed?: string;
  packageStatus?: string;
  templateAdGroupId?: number;
  templateBannerId?: number;
  bannerTemplateSource: BannerTemplateSource;
  bannerTemplateSourceReason?: string;
  campaignId?: number;
  adGroupId?: number;
  urlIds: number[];
  urlTypes: {
    first: string[];
    second: string[];
  };
  bannerIds: number[];
  firstBannerCreated: boolean;
  secondBannerCreated: boolean;
  differentUrlsInSameGroupAllowed: boolean;
  productVerdict: 'allowed' | 'not_allowed' | 'unknown';
  errorCode?: string;
  errorMessage?: string;
  fieldErrors?: Record<string, FieldError>;
  rawError?: unknown;
  cleanup?: CleanupResult;
  gaps?: string[];
};

const KNOWN_URL_CONSTRAINT_CODES = new Set<KnownUrlConstraintCode>([
  'persistent_urls',
  'one_url_object_id',
  'ad_group_one_url',
  'campaign_one_url',
]);

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return defaultValue;
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function parseRequiredString(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Env ${name} is required`);
  }
  return value;
}

function parseOptionalString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseRequiredPositiveInteger(name: string): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    throw new Error(`Env ${name} is required`);
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Env ${name} must be a positive integer`);
  }
  return parsed;
}

function parsePositiveInteger(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Env ${name} must be a positive integer`);
  }
  return parsed;
}

function readConfig(): SmokeConfig {
  const landingUrl = parseRequiredString('VK_ADS_SMOKE_LANDING_URL');

  try {
    new URL(landingUrl);
  } catch {
    throw new Error('Env VK_ADS_SMOKE_LANDING_URL must be a valid URL');
  }

  return {
    enabled: parseBoolean(process.env.VK_ADS_SMOKE_ENABLED, false),
    token: parseRequiredString('VK_ADS_SMOKE_TOKEN'),
    baseUrl:
      parseOptionalString('VK_ADS_SMOKE_BASE_URL') || 'https://ads.vk.com',
    packageId: parseRequiredPositiveInteger('VK_ADS_SMOKE_PACKAGE_ID'),
    objective: parseOptionalString('VK_ADS_SMOKE_OBJECTIVE'),
    landingUrl,
    campaignNamePrefix:
      parseOptionalString('VK_ADS_SMOKE_CAMPAIGN_NAME_PREFIX') ||
      'vk-ads-smoke-campaign',
    adGroupNamePrefix:
      parseOptionalString('VK_ADS_SMOKE_AD_GROUP_NAME_PREFIX') ||
      'vk-ads-smoke-group',
    urlCheckTimeoutMs: parsePositiveInteger(
      'VK_ADS_SMOKE_URL_CHECK_TIMEOUT_MS',
      120000,
    ),
    urlCheckIntervalMs: parsePositiveInteger(
      'VK_ADS_SMOKE_URL_CHECK_INTERVAL_MS',
      5000,
    ),
    cleanupEnabled: parseBoolean(process.env.VK_ADS_SMOKE_CLEANUP_ENABLED, true),
  };
}

function nowSlug(): string {
  return new Date().toISOString().replace(/[^\d]/g, '').slice(0, 14);
}

function buildRefUrl(baseUrl: string, refValue: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('ref', refValue);
  return url.toString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizePayload(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => summarizePayload(item));
  }
  if (typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (key === 'content' && raw && typeof raw === 'object') {
      out[key] = Object.keys(raw as Record<string, unknown>);
      continue;
    }
    if (key === 'textblocks' && raw && typeof raw === 'object') {
      out[key] = Object.keys(raw as Record<string, unknown>);
      continue;
    }
    if (key === 'urls' && raw && typeof raw === 'object') {
      const urlsSummary: Record<string, unknown> = {};
      for (const [urlKey, urlValue] of Object.entries(
        raw as Record<string, unknown>,
      )) {
        if (urlValue && typeof urlValue === 'object') {
          urlsSummary[urlKey] = {
            id: (urlValue as Record<string, unknown>).id ?? null,
          };
        } else {
          urlsSummary[urlKey] = urlValue;
        }
      }
      out[key] = urlsSummary;
      continue;
    }
    out[key] = raw;
  }
  return out;
}

function extractApiError(error: unknown): VkAdsApiError {
  if (!axios.isAxiosError(error)) {
    return {
      code: undefined,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  const data = error.response?.data as
    | { error?: VkAdsApiError; code?: string; message?: string }
    | undefined;

  if (data?.error) {
    return {
      code: data.error.code,
      message: data.error.message,
      fields: data.error.fields,
    };
  }

  if (data?.code || data?.message) {
    return {
      code: data.code,
      message: data.message,
    };
  }

  return {
    code: error.code,
    message: error.message,
  };
}

function pickKnownConstraintCode(
  apiError: VkAdsApiError,
): KnownUrlConstraintCode | undefined {
  if (apiError.code && KNOWN_URL_CONSTRAINT_CODES.has(apiError.code as any)) {
    return apiError.code as KnownUrlConstraintCode;
  }

  for (const fieldError of Object.values(apiError.fields || {})) {
    if (
      fieldError.code &&
      KNOWN_URL_CONSTRAINT_CODES.has(fieldError.code as KnownUrlConstraintCode)
    ) {
      return fieldError.code as KnownUrlConstraintCode;
    }
  }

  return undefined;
}

class VkAdsSmokeClient {
  private readonly http: AxiosInstance;

  constructor(private readonly config: SmokeConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  async post<T>(
    path: string,
    data?: Record<string, unknown> | unknown[],
  ): Promise<T> {
    return this.request<T>('POST', path, data);
  }

  async delete(path: string): Promise<void> {
    await this.request('DELETE', path);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    data?: Record<string, unknown> | unknown[],
    params?: Record<string, unknown>,
  ): Promise<T> {
    try {
      const response = await this.http.request<T>({
        method,
        url: path,
        data,
        params,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
}

function logStep(
  step: string,
  message: string,
  payload?: {
    request?: unknown;
    response?: unknown;
    error?: VkAdsApiError;
    status?: number;
    ids?: Record<string, unknown>;
  },
) {
  const body = payload
    ? {
        request: summarizePayload(payload.request),
        response: summarizePayload(payload.response),
        error: payload.error,
        status: payload.status,
        ids: payload.ids,
      }
    : undefined;
  console.info(`[vk-ads-smoke] STEP ${step} ${message}`);
  if (body) {
    console.info(
      `[vk-ads-smoke] STEP ${step} details ${JSON.stringify(body, null, 2)}`,
    );
  }
}

function assertEnabled(config: SmokeConfig) {
  if (!config.enabled) {
    throw new Error(
      'VK_ADS_SMOKE_ENABLED is false. Refusing to run real VK Ads smoke test.',
    );
  }
}

async function readPackageInfo(
  client: VkAdsSmokeClient,
  packageId: number,
): Promise<PackageInfo | null> {
  const response = await client.get<{ items?: PackageInfo[] }>(
    '/api/v2/packages.json',
  );
  const item = (response.items || []).find((pkg) => Number(pkg.id) === packageId);
  return item || null;
}

function resolveBannerTemplateStrategy(): {
  source: BannerTemplateSource;
  reason: string;
} {
  return {
    source: 'runtime_existing_banner',
    reason:
      'Локальные docs описывают общие Package/BannerField/Banner rules, но не дают надёжного package_id -> required roles contract. Поэтому используется подтверждённый runtime template существующего banner того же package_id.',
  };
}

async function findTemplateBanner(
  client: VkAdsSmokeClient,
  packageId: number,
): Promise<{ adGroup: AdGroupListItem; banner: BannerDetails } | null> {
  const limit = 50;

  for (let offset = 0; ; offset += limit) {
    const groupList = await client.get<{
      count?: number;
      items?: AdGroupListItem[];
    }>('/api/v2/ad_groups.json', {
      fields: 'id,name,package_id,status,objective',
      limit,
      offset,
      _status__in: 'active,blocked',
    });

    const groups = (groupList.items || []).filter(
      (group) =>
        Number(group.package_id) === packageId && group.status !== 'deleted',
    );

    for (const group of groups) {
      const banners = await client.get<{
        items?: BannerListItem[];
      }>('/api/v2/banners.json', {
        fields: 'id,status,ad_group_id',
        _ad_group_id: group.id,
        _status__in: 'active,blocked',
        limit: 50,
        offset: 0,
      });

      for (const banner of banners.items || []) {
        const bannerDetails = await client.get<BannerDetails>(
          `/api/v2/banners/${banner.id}.json`,
          {
            fields: 'id,name,status,content,textblocks,urls',
          },
        );

        if (
          bannerDetails.content &&
          bannerDetails.textblocks &&
          bannerDetails.urls &&
          bannerDetails.urls.primary &&
          typeof bannerDetails.urls.primary.id === 'number'
        ) {
          return { adGroup: group, banner: bannerDetails };
        }
      }
    }

    const count = Number(groupList.count || 0);
    if (!count || offset + limit >= count) {
      break;
    }
  }

  return null;
}

function sanitizeContent(
  content: Record<string, BannerFieldValue> | undefined,
): Record<string, { id: number }> {
  const out: Record<string, { id: number }> = {};
  for (const [key, value] of Object.entries(content || {})) {
    if (typeof value?.id === 'number') {
      out[key] = { id: value.id };
    }
  }
  return out;
}

function sanitizeTextblocks(
  textblocks: Record<string, BannerFieldValue> | undefined,
): Record<string, { text: string }> {
  const out: Record<string, { text: string }> = {};
  for (const [key, value] of Object.entries(textblocks || {})) {
    if (typeof value?.text === 'string' && value.text.length) {
      out[key] = { text: value.text };
    }
  }
  return out;
}

function sanitizeUrls(
  urls: Record<string, BannerFieldValue> | undefined,
  primaryUrlId: number,
): Record<string, { id: number }> {
  const out: Record<string, { id: number }> = {};
  for (const [key, value] of Object.entries(urls || {})) {
    if (key === 'primary') {
      out[key] = { id: primaryUrlId };
      continue;
    }
    if (typeof value?.id === 'number') {
      out[key] = { id: value.id };
    }
  }
  if (!out.primary) {
    out.primary = { id: primaryUrlId };
  }
  return out;
}

function buildBannerPayload(params: {
  template: BannerDetails;
  name: string;
  primaryUrlId: number;
}): Record<string, unknown> {
  return {
    name: params.name,
    status: 'blocked',
    urls: sanitizeUrls(params.template.urls, params.primaryUrlId),
    content: sanitizeContent(params.template.content),
    textblocks: sanitizeTextblocks(params.template.textblocks),
  };
}

async function createUrlAndWaitReady(params: {
  client: VkAdsSmokeClient;
  url: string;
  createStep: string;
  waitStep: string;
  timeoutMs: number;
  intervalMs: number;
  packageInfo: PackageInfo | null;
}): Promise<UrlInfo> {
  const requestPayload = { url: params.url };
  logStep(params.createStep, 'request', { request: requestPayload });
  const created = await params.client.post<{ id: number }>('/api/v2/urls.json', {
    url: params.url,
  });
  logStep(params.createStep, 'response', {
    response: created,
    ids: { urlId: created.id },
  });

  const startedAt = Date.now();
  logStep(params.waitStep, 'polling-started', {
    ids: { urlId: created.id },
  });
  for (;;) {
    const urlInfo = await params.client.get<UrlInfo>(
      `/api/v2/urls/${created.id}.json`,
    );
    const ready = Array.isArray(urlInfo.url_types) && urlInfo.url_types.length > 0;

    if (ready) {
      if (params.packageInfo?.url_types?.primary?.length) {
        const matchesPrimaryRole = params.packageInfo.url_types.primary.some(
          (requiredTypes) =>
            requiredTypes.every((requiredType) =>
              (urlInfo.url_types || []).includes(requiredType),
            ),
        );
        if (!matchesPrimaryRole) {
          throw new Error(
            `URL ${created.id} is checked but does not satisfy package primary url_types`,
          );
        }
      }

      logStep(params.waitStep, 'ready', {
        response: urlInfo,
        ids: { urlId: created.id },
      });
      return urlInfo;
    }

    if (Date.now() - startedAt >= params.timeoutMs) {
      throw new Error(
        `URL ${created.id} did not finish url_types check within ${params.timeoutMs}ms`,
      );
    }

    await sleep(params.intervalMs);
  }
}

function buildCampaignPayload(params: {
  config: SmokeConfig;
  objective?: string;
  suffix: string;
}): Record<string, unknown> {
  return {
    name: `${params.config.campaignNamePrefix}-${params.suffix}`,
    status: 'blocked',
    ...(params.objective ? { objective: params.objective } : {}),
    ad_groups: [],
  };
}

function buildAdGroupPayload(params: {
  config: SmokeConfig;
  adPlanId: number;
  objective?: string;
  suffix: string;
}): Record<string, unknown> {
  return {
    name: `${params.config.adGroupNamePrefix}-${params.suffix}`,
    status: 'blocked',
    ad_plan_id: params.adPlanId,
    package_id: params.config.packageId,
    ...(params.objective ? { objective: params.objective } : {}),
  };
}

async function cleanupEntities(params: {
  client: VkAdsSmokeClient;
  bannerIds: number[];
  adGroupId?: number;
  campaignId?: number;
  enabled: boolean;
}): Promise<CleanupResult> {
  const cleanup: CleanupResult = {
    enabled: params.enabled,
    attempted: true,
    banner1Deleted: false,
    banner2Deleted: false,
    adGroupDeleted: false,
    campaignBlocked: false,
    details: {
      bannerDeletes: [],
    },
  };

  logStep('cleanup', 'started', {
    ids: {
      bannerIds: params.bannerIds,
      adGroupId: params.adGroupId,
      campaignId: params.campaignId,
    },
  });

  for (const bannerId of params.bannerIds.slice().reverse()) {
    try {
      await params.client.delete(`/api/v2/banners/${bannerId}.json`);
      cleanup.details.bannerDeletes.push({ id: bannerId, ok: true });
    } catch (error) {
      const apiError = extractApiError(error);
      cleanup.details.bannerDeletes.push({
        id: bannerId,
        ok: false,
        message: apiError.message || 'Delete banner failed',
      });
    }
  }

  cleanup.banner1Deleted = Boolean(
    params.bannerIds[0] &&
      cleanup.details.bannerDeletes.find((item) => item.id === params.bannerIds[0])?.ok,
  );
  cleanup.banner2Deleted = Boolean(
    params.bannerIds[1] &&
      cleanup.details.bannerDeletes.find((item) => item.id === params.bannerIds[1])?.ok,
  );

  if (params.adGroupId) {
    try {
      await params.client.delete(`/api/v2/ad_groups/${params.adGroupId}.json`);
      cleanup.details.adGroupDelete = { id: params.adGroupId, ok: true };
      cleanup.adGroupDeleted = true;
    } catch (error) {
      const apiError = extractApiError(error);
      cleanup.details.adGroupDelete = {
        id: params.adGroupId,
        ok: false,
        message: apiError.message || 'Delete ad group failed',
      };
    }
  }

  if (params.campaignId) {
    try {
      await params.client.post(`/api/v2/ad_plans/${params.campaignId}.json`, {
        status: 'blocked',
      });
      cleanup.details.adPlanBlock = { id: params.campaignId, ok: true };
      cleanup.campaignBlocked = true;
    } catch (error) {
      const apiError = extractApiError(error);
      cleanup.details.adPlanBlock = {
        id: params.campaignId,
        ok: false,
        message: apiError.message || 'Block ad plan failed',
      };
    }
  }

  logStep('cleanup', 'finished', {
    response: cleanup,
  });

  return cleanup;
}

async function main() {
  const config = readConfig();
  assertEnabled(config);

  const client = new VkAdsSmokeClient(config);
  const suffix = nowSlug();
  const outcome: SmokeOutcome = {
    ok: false,
    scriptSucceeded: false,
    packageId: config.packageId,
    bannerTemplateSource: 'unknown',
    urlIds: [],
    urlTypes: {
      first: [],
      second: [],
    },
    bannerIds: [],
    firstBannerCreated: false,
    secondBannerCreated: false,
    differentUrlsInSameGroupAllowed: false,
    productVerdict: 'unknown',
    gaps: [],
  };

  try {
    logStep('discoverPackage', 'request');
    const packageInfo = await readPackageInfo(client, config.packageId);
    if (!packageInfo) {
      outcome.errorMessage = `Package ${config.packageId} not found via /api/v2/packages.json`;
      outcome.gaps?.push('Пакет не найден через локально задокументированный /api/v2/packages.json');
      process.exitCode = 1;
      return;
    }

    outcome.packageStatus = packageInfo.status;
    logStep('discoverPackage', 'response', { response: packageInfo });

    if (packageInfo.status && packageInfo.status !== 'active') {
      throw new Error(
        `Package ${config.packageId} has status=${packageInfo.status}. Docs say campaigns can be created only with active package.`,
      );
    }

    const objectiveUsed =
      config.objective ||
      (packageInfo.objective.length === 1 ? packageInfo.objective[0] : undefined);
    outcome.objectiveUsed = objectiveUsed;

    const templateStrategy = resolveBannerTemplateStrategy();
    outcome.bannerTemplateSource = templateStrategy.source;
    outcome.bannerTemplateSourceReason = templateStrategy.reason;
    logStep('discoverTemplateBanner', 'request', {
      request: {
        packageId: config.packageId,
        preferredSourceOrder: [
          'docs_minimal_payload',
          'runtime_package_metadata',
          'runtime_existing_banner',
        ],
        selectedSource: templateStrategy.source,
      },
    });
    const template = await findTemplateBanner(client, config.packageId);
    if (!template) {
      outcome.errorMessage =
        'No existing banner template was found for selected package_id';
      outcome.gaps?.push(
        'В локальных docs нет универсального package->banner pattern; runtime-discovery не нашёл существующий banner-template для этого package_id.',
      );
      process.exitCode = 1;
      return;
    }

    outcome.templateAdGroupId = template.adGroup.id;
    outcome.templateBannerId = template.banner.id;
    logStep('discoverTemplateBanner', 'response', {
      response: {
        adGroupId: template.adGroup.id,
        bannerId: template.banner.id,
        templateSource: outcome.bannerTemplateSource,
        banner: {
          name: template.banner.name,
          contentRoles: Object.keys(template.banner.content || {}),
          textblockRoles: Object.keys(template.banner.textblocks || {}),
          urlRoles: Object.keys(template.banner.urls || {}),
        },
      },
    });

    if (!template.banner.urls?.primary?.id) {
      outcome.errorMessage =
        'Discovered template banner does not contain urls.primary.id';
      outcome.gaps?.push(
        'Runtime-discovery нашёл banner, но у него нет urls.primary.id; по локальным docs этого недостаточно для безопасного smoke-test сценария.',
      );
      process.exitCode = 1;
      return;
    }

    const url1 = await createUrlAndWaitReady({
      client,
      url: buildRefUrl(config.landingUrl, `${suffix}_a`),
      createStep: 'createUrl1',
      waitStep: 'waitUrl1Checked',
      timeoutMs: config.urlCheckTimeoutMs,
      intervalMs: config.urlCheckIntervalMs,
      packageInfo,
    });
    const url2 = await createUrlAndWaitReady({
      client,
      url: buildRefUrl(config.landingUrl, `${suffix}_b`),
      createStep: 'createUrl2',
      waitStep: 'waitUrl2Checked',
      timeoutMs: config.urlCheckTimeoutMs,
      intervalMs: config.urlCheckIntervalMs,
      packageInfo,
    });
    outcome.urlIds.push(url1.id, url2.id);
    outcome.urlTypes.first = Array.isArray(url1.url_types) ? url1.url_types : [];
    outcome.urlTypes.second = Array.isArray(url2.url_types) ? url2.url_types : [];

    const campaignPayload = buildCampaignPayload({
      config,
      objective: objectiveUsed,
      suffix,
    });
    logStep('createAdPlan', 'request', { request: campaignPayload });
    const createdCampaign = await client.post<{ id: number }>(
      '/api/v2/ad_plans.json',
      campaignPayload,
    );
    outcome.campaignId = createdCampaign.id;
    logStep('createAdPlan', 'response', {
      response: createdCampaign,
      ids: { campaignId: createdCampaign.id },
    });

    const adGroupPayload = buildAdGroupPayload({
      config,
      adPlanId: createdCampaign.id,
      objective: objectiveUsed,
      suffix,
    });
    logStep('createAdGroup', 'request', { request: adGroupPayload });
    const createdAdGroup = await client.post<{ id: number }>(
      '/api/v2/ad_groups.json',
      adGroupPayload,
    );
    outcome.adGroupId = createdAdGroup.id;
    logStep('createAdGroup', 'response', {
      response: createdAdGroup,
      ids: { adGroupId: createdAdGroup.id, campaignId: createdCampaign.id },
    });

    const banner1Payload = buildBannerPayload({
      template: template.banner,
      name: `${config.adGroupNamePrefix}-${suffix}-banner-1`,
      primaryUrlId: url1.id,
    });
    logStep('createBanner1', 'request', { request: banner1Payload });
    const createdBanner1 = await client.post<{ id: number }>(
      `/api/v2/ad_groups/${createdAdGroup.id}/banners.json`,
      banner1Payload,
    );
    outcome.bannerIds.push(createdBanner1.id);
    outcome.firstBannerCreated = true;
    logStep('createBanner1', 'response', {
      response: createdBanner1,
      ids: { banner1Id: createdBanner1.id, url1Id: url1.id },
    });

    const banner2Payload = buildBannerPayload({
      template: template.banner,
      name: `${config.adGroupNamePrefix}-${suffix}-banner-2`,
      primaryUrlId: url2.id,
    });
    logStep('createBanner2', 'request', { request: banner2Payload });

    try {
      const createdBanner2 = await client.post<{ id: number }>(
        `/api/v2/ad_groups/${createdAdGroup.id}/banners.json`,
        banner2Payload,
      );
      outcome.bannerIds.push(createdBanner2.id);
      outcome.secondBannerCreated = true;
      outcome.scriptSucceeded = true;
      outcome.ok = true;
      outcome.differentUrlsInSameGroupAllowed = true;
      outcome.productVerdict = 'allowed';
      logStep('createBanner2', 'response', {
        response: createdBanner2,
        ids: { banner2Id: createdBanner2.id, url2Id: url2.id },
      });
    } catch (error) {
      const apiError = extractApiError(error);
      const knownConstraintCode = pickKnownConstraintCode(apiError);
      outcome.scriptSucceeded = Boolean(knownConstraintCode);
      outcome.ok = outcome.scriptSucceeded;
      outcome.secondBannerCreated = false;
      outcome.differentUrlsInSameGroupAllowed = false;
      outcome.productVerdict = knownConstraintCode ? 'not_allowed' : 'unknown';
      outcome.errorCode = knownConstraintCode || apiError.code;
      outcome.errorMessage = apiError.message;
      outcome.fieldErrors = apiError.fields;
      outcome.rawError = axios.isAxiosError(error)
        ? error.response?.data || {
            message: error.message,
            code: error.code,
          }
        : error;
      logStep('createBanner2', 'error', {
        error: apiError,
        status: (error as AxiosError)?.response?.status,
      });
    }
  } catch (error) {
    const apiError = extractApiError(error);
    outcome.scriptSucceeded = false;
    outcome.ok = false;
    outcome.errorCode = pickKnownConstraintCode(apiError) || apiError.code;
    outcome.errorMessage = apiError.message;
    outcome.fieldErrors = apiError.fields;
    outcome.rawError = axios.isAxiosError(error)
      ? error.response?.data || {
          message: error.message,
          code: error.code,
        }
      : error;
  } finally {
    if (config.cleanupEnabled) {
      outcome.cleanup = await cleanupEntities({
        client,
        bannerIds: outcome.bannerIds,
        adGroupId: outcome.adGroupId,
        campaignId: outcome.campaignId,
        enabled: config.cleanupEnabled,
      });
    } else {
      logStep('cleanup', 'skipped', {
        response: { enabled: false },
      });
      outcome.cleanup = {
        enabled: false,
        attempted: false,
        banner1Deleted: false,
        banner2Deleted: false,
        adGroupDeleted: false,
        campaignBlocked: false,
        details: {
          bannerDeletes: [],
        },
      };
    }

    console.log(JSON.stringify(outcome, null, 2));
    if (!outcome.scriptSucceeded) {
      process.exitCode = 1;
    }
  }
}

void main();
