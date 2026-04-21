import 'dotenv/config';

import { PrismaService } from '../prisma/prisma.service';
import {
  VkAdsFieldError,
  VkAdsTestClient,
  VkAdsTestClientError,
  VkAdsUrl,
} from '../domains/vk-ads-test/clients/vk-ads-test.client';
import { VkAdsTestRepository } from '../domains/vk-ads-test/repositories/vk-ads-test.repository';
import { VkAdsTestAuthService } from '../domains/vk-ads-test/services/vk-ads-test-auth.service';

type SmokeConfig = {
  enabled: boolean;
  integrationId: number;
  landingUrl: string;
  packageId: number;
  campaignNamePrefix: string;
  adGroupNamePrefix: string;
  urlCheckTimeoutMs: number;
  urlCheckIntervalMs: number;
  cleanupEnabled: boolean;
};

type PackageInfo = {
  id: number;
  status?: string;
  objective?: string[];
  url_types?: Record<string, string[][]>;
  [key: string]: unknown;
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

type CleanupItemResult = {
  ok: boolean;
  status?: string;
  message?: string;
};

type SmokeCleanupResult = {
  enabled: boolean;
  attempted: boolean;
  banners?: CleanupItemResult[];
  adGroups?: CleanupItemResult[];
  adPlan?: CleanupItemResult;
};

type SmokeErrorResult = {
  message: string;
  code?: string;
  status?: number;
  fieldErrors?: Record<string, VkAdsFieldError>;
  raw?: unknown;
};

type ResolvedAdGroup = {
  id: number;
  name?: string;
  package_id: number;
  status?: string;
  objective?: string;
};

type ResolvedBanner = {
  id: number;
  ad_group_id: number;
  status?: string;
};

type SmokeTechnicalVerdict = 'passed' | 'failed' | 'gap';
type SmokeProductVerdict = 'passed' | 'failed' | 'gap' | 'unknown';
type BannerTemplateSource = 'runtime_existing_banner' | 'gap_missing_template';

const CONFIRMED_SMOKE_PACKAGE_ID = 3127;
const REQUIRED_TEMPLATE_CONTENT_KEYS = [
  'icon_256x256',
  'video_portrait_9_16_180s',
  'video_portrait_9_16_30s',
] as const;
const REQUIRED_TEMPLATE_TEXTBLOCK_KEYS = [
  'about_company_115',
  'cta_community_vk',
  'text_2000',
  'title_40_vkads',
] as const;

type SmokeResult = {
  scriptSucceeded: boolean;
  technicalVerdict: SmokeTechnicalVerdict;
  productVerdict: SmokeProductVerdict;
  integrationId: number;
  packageId: number | null;
  packageSource: 'confirmed_mvp';
  authResolved: boolean;
  urlCreated: boolean;
  urlChecked: boolean;
  campaignCreated: boolean;
  adGroupCreated: boolean;
  bannerCreated: boolean;
  reuseAdGroupCreated: boolean;
  reuseBannerCreated: boolean;
  bannerChecked: boolean;
  bannerTemplateSource: BannerTemplateSource | null;
  bannerTemplateSourceReason: string | null;
  createdIds: {
    urlId: number | null;
    adPlanId: number | null;
    adGroupId: number | null;
    bannerId: number | null;
    reuseAdGroupId: number | null;
    reuseBannerId: number | null;
    templateAdGroupId: number | null;
    templateBannerId: number | null;
  };
  cleanup: SmokeCleanupResult;
  error?: SmokeErrorResult;
  gaps: string[];
};

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
  return value || undefined;
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
  const landingUrl = parseRequiredString('VK_ADS_TEST_SMOKE_LANDING_URL');
  try {
    new URL(landingUrl);
  } catch {
    throw new Error(
      'Env VK_ADS_TEST_SMOKE_LANDING_URL must be a valid absolute URL',
    );
  }

  return {
    enabled: parseBoolean(process.env.VK_ADS_TEST_SMOKE_ENABLED, false),
    integrationId: parseRequiredPositiveInteger(
      'VK_ADS_TEST_SMOKE_INTEGRATION_ID',
    ),
    landingUrl,
    packageId: CONFIRMED_SMOKE_PACKAGE_ID,
    campaignNamePrefix:
      parseOptionalString('VK_ADS_TEST_SMOKE_CAMPAIGN_NAME_PREFIX') ||
      'vk-ads-test-smoke-campaign',
    adGroupNamePrefix:
      parseOptionalString('VK_ADS_TEST_SMOKE_AD_GROUP_NAME_PREFIX') ||
      'vk-ads-test-smoke-group',
    urlCheckTimeoutMs: parsePositiveInteger(
      'VK_ADS_TEST_SMOKE_URL_CHECK_TIMEOUT_MS',
      120_000,
    ),
    urlCheckIntervalMs: parsePositiveInteger(
      'VK_ADS_TEST_SMOKE_URL_CHECK_INTERVAL_MS',
      5_000,
    ),
    cleanupEnabled: parseBoolean(
      process.env.VK_ADS_TEST_SMOKE_CLEANUP_ENABLED,
      true,
    ),
  };
}

function assertEnabled(config: SmokeConfig): void {
  if (!config.enabled) {
    throw new Error(
      'VK_ADS_TEST_SMOKE_ENABLED is false. Refusing to run real VK Ads smoke path.',
    );
  }
}

function nowSlug(): string {
  return new Date().toISOString().replace(/[^\d]/g, '').slice(0, 14);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function buildLandingUrl(baseUrl: string, suffix: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('smoke_ref', suffix);
  return url.toString();
}

function buildCampaignPayload(params: {
  prefix: string;
  adGroupNamePrefix: string;
  suffix: string;
  packageId: number;
  objective?: string;
}): Record<string, unknown> {
  return {
    name: `${params.prefix}-${params.suffix}`,
    status: 'blocked',
    ...(params.objective ? { objective: params.objective } : {}),
    ad_groups: [
      {
        name: `${params.adGroupNamePrefix}-${params.suffix}`,
        package_id: params.packageId,
        banners: [],
      },
    ],
  };
}

function pickContent(
  content: Record<string, BannerFieldValue> | undefined,
): Record<string, { id: number }> {
  const out: Record<string, { id: number }> = {};
  for (const key of REQUIRED_TEMPLATE_CONTENT_KEYS) {
    const value = content?.[key];
    const id = asNumber(value?.id);
    if (id !== null) {
      out[key] = { id };
      continue;
    }

    throw new Error(
      `Runtime banner template is missing required content.${key}.id for package_id=${CONFIRMED_SMOKE_PACKAGE_ID}`,
    );
  }
  return out;
}

function pickTextblocks(
  textblocks: Record<string, BannerFieldValue> | undefined,
): Record<string, { text: string }> {
  const out: Record<string, { text: string }> = {};
  for (const key of REQUIRED_TEMPLATE_TEXTBLOCK_KEYS) {
    const value = textblocks?.[key];
    if (typeof value?.text === 'string' && value.text.trim()) {
      out[key] = { text: value.text };
      continue;
    }

    throw new Error(
      `Runtime banner template is missing required textblocks.${key}.text for package_id=${CONFIRMED_SMOKE_PACKAGE_ID}`,
    );
  }
  return out;
}

function pickPrimaryUrl(
  urls: Record<string, BannerFieldValue> | undefined,
  primaryUrlId: number,
): Record<string, { id: number }> {
  const primary = urls?.primary;
  if (!primary || asNumber(primary.id) === null) {
    throw new Error(
      `Runtime banner template is missing required urls.primary.id for package_id=${CONFIRMED_SMOKE_PACKAGE_ID}`,
    );
  }

  return {
    primary: { id: primaryUrlId },
  };
}

function buildBannerPayload(params: {
  template: BannerDetails;
  name: string;
  primaryUrlId: number;
}): Record<string, unknown> {
  return {
    name: params.name,
    status: 'blocked',
    urls: pickPrimaryUrl(params.template.urls, params.primaryUrlId),
    content: pickContent(params.template.content),
    textblocks: pickTextblocks(params.template.textblocks),
  };
}

function mapClientError(error: unknown): SmokeErrorResult {
  if (error instanceof VkAdsTestClientError) {
    return {
      message: error.vkErrorMessage || error.message,
      code: error.vkErrorCode,
      status: error.status,
      fieldErrors: error.fieldErrors,
      raw: error.rawError,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
    };
  }

  return {
    message: 'Unknown smoke script error',
    raw: error,
  };
}

function validateUrlAgainstPackage(url: VkAdsUrl, pkg: PackageInfo): void {
  const primaryRoles = pkg.url_types?.primary;
  if (!primaryRoles?.length) {
    return;
  }

  const urlTypes = Array.isArray(url.url_types) ? url.url_types : [];
  const isAllowed = primaryRoles.some((requiredTypes) =>
    requiredTypes.every((requiredType) => urlTypes.includes(requiredType)),
  );

  if (!isAllowed) {
    throw new Error(
      `Created URL ${url.id} was checked but does not satisfy package primary url_types`,
    );
  }
}

async function createUrlAndWait(params: {
  client: VkAdsTestClient;
  integrationId: number;
  landingUrl: string;
  timeoutMs: number;
  intervalMs: number;
  pkg: PackageInfo;
}): Promise<VkAdsUrl> {
  const created = await params.client.createUrl(params.integrationId, {
    url: params.landingUrl,
  });

  const urlId = asNumber(created.id);
  if (urlId === null) {
    throw new Error('VK Ads createUrl response does not contain numeric id');
  }

  const startedAt = Date.now();

  for (;;) {
    const url = await params.client.getUrl(params.integrationId, urlId);
    if (Array.isArray(url.url_types) && url.url_types.length > 0) {
      validateUrlAgainstPackage(url, params.pkg);
      return url;
    }

    if (Date.now() - startedAt >= params.timeoutMs) {
      throw new Error(
        `URL ${urlId} did not finish url_types check within ${params.timeoutMs}ms`,
      );
    }

    await sleep(params.intervalMs);
  }
}

async function findTemplateBanner(params: {
  client: VkAdsTestClient;
  integrationId: number;
  packageId: number;
}): Promise<{ adGroup: ResolvedAdGroup; banner: BannerDetails } | null> {
  const pageSize = 50;

  for (let offset = 0; ; offset += pageSize) {
    const adGroups = await params.client.getAdGroups(params.integrationId, {
      fields: 'id,name,package_id,status,objective',
      limit: pageSize,
      offset,
      _status__in: 'active,blocked',
    });

    for (const item of adGroups.items || []) {
      const adGroupId = asNumber(item.id);
      const adGroupPackageId = asNumber(item.package_id);
      const adGroupStatus =
        typeof item.status === 'string' ? item.status : undefined;

      if (
        adGroupId === null ||
        adGroupPackageId === null ||
        adGroupPackageId !== params.packageId ||
        adGroupStatus === 'deleted'
      ) {
        continue;
      }

      const adGroup: ResolvedAdGroup = {
        id: adGroupId,
        name: typeof item.name === 'string' ? item.name : undefined,
        package_id: adGroupPackageId,
        status: adGroupStatus,
        objective: typeof item.objective === 'string' ? item.objective : undefined,
      };

      const banners = await params.client.getBanners(params.integrationId, {
        fields:
          'id,status,ad_group_id,name,moderation_status,content,textblocks,urls',
        _ad_group_id: adGroup.id,
        _status__in: 'active,blocked',
        limit: pageSize,
        offset: 0,
      });

      for (const item of banners.items || []) {
        const bannerId = asNumber(item.id);
        const bannerAdGroupId = asNumber(item.ad_group_id);
        if (bannerId === null || bannerAdGroupId === null) {
          continue;
        }

        const banner: ResolvedBanner = {
          id: bannerId,
          ad_group_id: bannerAdGroupId,
          status: typeof item.status === 'string' ? item.status : undefined,
        };

        const bannerDetails: BannerDetails = {
          id: banner.id,
          name: typeof item.name === 'string' ? item.name : undefined,
          status: typeof item.status === 'string' ? item.status : undefined,
          content: asRecord(item.content) as
            | Record<string, BannerFieldValue>
            | undefined,
          textblocks: asRecord(item.textblocks) as
            | Record<string, BannerFieldValue>
            | undefined,
          urls: asRecord(item.urls) as
            | Record<string, BannerFieldValue>
            | undefined,
        };

        const primaryUrlId = asNumber(bannerDetails.urls?.primary?.id);
        if (
          primaryUrlId !== null &&
          REQUIRED_TEMPLATE_CONTENT_KEYS.every((key) =>
            Boolean(asNumber(bannerDetails.content?.[key]?.id)),
          ) &&
          REQUIRED_TEMPLATE_TEXTBLOCK_KEYS.every((key) =>
            Boolean(bannerDetails.textblocks?.[key]?.text),
          )
        ) {
          return { adGroup, banner: bannerDetails };
        }

        const rawBanner = await params.client.getBanner(
          params.integrationId,
          banner.id,
          {
            fields: 'id,name,status,content,textblocks,urls',
          },
        );
        const rawBannerId = asNumber(rawBanner.id);
        const rawBannerDetails: BannerDetails = {
          id: rawBannerId ?? banner.id,
          name: typeof rawBanner.name === 'string' ? rawBanner.name : undefined,
          status:
            typeof rawBanner.status === 'string' ? rawBanner.status : undefined,
          content: asRecord(rawBanner.content) as
            | Record<string, BannerFieldValue>
            | undefined,
          textblocks: asRecord(rawBanner.textblocks) as
            | Record<string, BannerFieldValue>
            | undefined,
          urls: asRecord(rawBanner.urls) as
            | Record<string, BannerFieldValue>
            | undefined,
        };

        const rawPrimaryUrlId = asNumber(rawBannerDetails.urls?.primary?.id);
        if (
          rawPrimaryUrlId !== null &&
          REQUIRED_TEMPLATE_CONTENT_KEYS.every((key) =>
            Boolean(asNumber(rawBannerDetails.content?.[key]?.id)),
          ) &&
          REQUIRED_TEMPLATE_TEXTBLOCK_KEYS.every((key) =>
            Boolean(rawBannerDetails.textblocks?.[key]?.text),
          )
        ) {
          return { adGroup, banner: rawBannerDetails };
        }
      }
    }

    const count = Number(adGroups.count || 0);
    if (!count || offset + pageSize >= count) {
      break;
    }
  }

  return null;
}

async function cleanupEntities(params: {
  client: VkAdsTestClient;
  integrationId: number;
  bannerIds: Array<number | null>;
  adGroupIds: Array<number | null>;
  adPlanId: number | null;
  enabled: boolean;
}): Promise<SmokeCleanupResult> {
  if (!params.enabled) {
    return {
      enabled: false,
      attempted: false,
    };
  }

  const cleanup: SmokeCleanupResult = {
    enabled: true,
    attempted: true,
  };

  cleanup.banners = [];
  for (const bannerId of params.bannerIds.filter(
    (value): value is number => value !== null,
  )) {
    try {
      await params.client.deleteBanner(params.integrationId, bannerId);
      const deletedBanner = await params.client.getBanner(
        params.integrationId,
        bannerId,
        {
          fields: 'id,status',
        },
      );
      const status =
        typeof deletedBanner.status === 'string'
          ? deletedBanner.status
          : undefined;

      cleanup.banners.push({
        ok: status === 'deleted',
        status,
        ...(status === 'deleted'
          ? {}
          : {
              message:
                'DELETE banner completed, but follow-up GET did not return status=deleted',
            }),
      });
    } catch (error) {
      cleanup.banners.push({
        ok: false,
        message: mapClientError(error).message,
      });
    }
  }

  cleanup.adGroups = [];
  for (const adGroupId of params.adGroupIds.filter(
    (value): value is number => value !== null,
  )) {
    try {
      await params.client.deleteAdGroup(params.integrationId, adGroupId);
      cleanup.adGroups.push({ ok: true });
    } catch (error) {
      cleanup.adGroups.push({
        ok: false,
        message: mapClientError(error).message,
      });
    }
  }

  if (params.adPlanId !== null) {
    try {
      await params.client.updateAdPlan(params.integrationId, params.adPlanId, {
        status: 'blocked',
      });
      cleanup.adPlan = { ok: true };
    } catch (error) {
      cleanup.adPlan = {
        ok: false,
        message: mapClientError(error).message,
      };
    }
  }

  return cleanup;
}

async function main(): Promise<void> {
  const config = readConfig();
  assertEnabled(config);

  const prisma = new PrismaService();
  await prisma.$connect();

  const repository = new VkAdsTestRepository(prisma);
  const authService = new VkAdsTestAuthService(repository);
  const client = new VkAdsTestClient(authService);

  const result: SmokeResult = {
    scriptSucceeded: false,
    technicalVerdict: 'failed',
    productVerdict: 'unknown',
    integrationId: config.integrationId,
    packageId: config.packageId,
    packageSource: 'confirmed_mvp',
    authResolved: false,
    urlCreated: false,
    urlChecked: false,
    campaignCreated: false,
    adGroupCreated: false,
    bannerCreated: false,
    reuseAdGroupCreated: false,
    reuseBannerCreated: false,
    bannerChecked: false,
    bannerTemplateSource: null,
    bannerTemplateSourceReason: null,
    createdIds: {
      urlId: null,
      adPlanId: null,
      adGroupId: null,
      bannerId: null,
      reuseAdGroupId: null,
      reuseBannerId: null,
      templateAdGroupId: null,
      templateBannerId: null,
    },
    cleanup: {
      enabled: config.cleanupEnabled,
      attempted: false,
    },
    gaps: [],
  };

  try {
    await authService.resolveAuthContext(config.integrationId);
    result.authResolved = true;

    const packages = await client.getPackages(config.integrationId);
    const packageItems = (packages.items || []).map((item) => item as PackageInfo);
    const selectedPackageId = CONFIRMED_SMOKE_PACKAGE_ID;

    const pkg = packageItems.find(
      (item) => Number(item.id) === Number(selectedPackageId),
    );

    if (!pkg) {
      throw new Error(
        `Package ${selectedPackageId} was not found via /api/v2/packages.json`,
      );
    }

    result.packageId = Number(pkg.id);

    if (pkg.status && pkg.status !== 'active') {
      throw new Error(
        `Package ${pkg.id} has status=${pkg.status}. VK Ads docs say create flow should use active package only.`,
      );
    }

    const objective = asStringArray(pkg.objective).length === 1
      ? asStringArray(pkg.objective)[0]
      : undefined;

    const suffix = nowSlug();
    const url = await createUrlAndWait({
      client,
      integrationId: config.integrationId,
      landingUrl: buildLandingUrl(config.landingUrl, suffix),
      timeoutMs: config.urlCheckTimeoutMs,
      intervalMs: config.urlCheckIntervalMs,
      pkg,
    });
    result.urlCreated = true;
    result.urlChecked = true;
    result.createdIds.urlId = url.id;

    const campaignPayload = buildCampaignPayload({
      prefix: config.campaignNamePrefix,
      adGroupNamePrefix: config.adGroupNamePrefix,
      suffix,
      packageId: Number(pkg.id),
      objective,
    });
    console.warn(
      JSON.stringify({
        scope: 'vk-ads-test-smoke',
        event: 'createAdPlan.payload.debug',
        integrationId: config.integrationId,
        campaignPayload,
      }),
    );

    const adPlan = await client.createAdPlan(
      config.integrationId,
      campaignPayload,
      url.id,
    );
    const adPlanId = asNumber(adPlan.id);
    if (adPlanId === null) {
      throw new Error('VK Ads createAdPlan response does not contain numeric id');
    }
    result.campaignCreated = true;
    result.createdIds.adPlanId = adPlanId;

    const adGroupId = asNumber(adPlan.ad_groups?.[0]?.id);
    if (adGroupId === null) {
      throw new Error(
        'VK Ads createAdPlan response does not contain numeric ad_groups[0].id',
      );
    }
    result.adGroupCreated = true;
    result.createdIds.adGroupId = adGroupId;

    const template = await findTemplateBanner({
      client,
      integrationId: config.integrationId,
      packageId: Number(pkg.id),
    });

    if (!template) {
      result.technicalVerdict = 'gap';
      result.productVerdict = 'gap';
      result.bannerTemplateSource = 'gap_missing_template';
      result.bannerTemplateSourceReason =
        'Runtime template banner for selected package_id was not found. Smoke script intentionally does not invent banner payload without confirmed template.';
      result.gaps.push(
        'No existing active/blocked banner template with urls/content/textblocks was found for selected package_id.',
      );
      return;
    }

    result.bannerTemplateSource = 'runtime_existing_banner';
    result.bannerTemplateSourceReason =
      'Used existing runtime banner of the same package_id as pragmatic payload template.';
    result.createdIds.templateAdGroupId = template.adGroup.id;
    result.createdIds.templateBannerId = template.banner.id;

    const banner = await client.createBanner(
      config.integrationId,
      adGroupId,
      buildBannerPayload({
        template: template.banner,
        name: `${config.adGroupNamePrefix}-${suffix}-banner`,
        primaryUrlId: url.id,
      }),
    );
    const bannerId =
      asNumber(banner.id) ??
      asNumber(Array.isArray(banner.banners) ? banner.banners[0]?.id : null);

    if (bannerId === null) {
      throw new Error('VK Ads createBanner response does not contain numeric id');
    }

    result.bannerCreated = true;
    result.createdIds.bannerId = bannerId;

    await client.getBanner(config.integrationId, bannerId, {
      fields: 'id,name,status,urls',
    });
    result.bannerChecked = true;

    const reuseAdGroup = await client.createAdGroup(
      config.integrationId,
      {
        ad_plan_id: adPlanId,
        name: `${config.adGroupNamePrefix}-${suffix}-reuse`,
        package_id: Number(pkg.id),
        status: 'blocked',
      },
    );
    const reuseAdGroupId = asNumber(reuseAdGroup.id);
    if (reuseAdGroupId === null) {
      throw new Error(
        'VK Ads createAdGroup response does not contain numeric id for reuse path',
      );
    }
    result.reuseAdGroupCreated = true;
    result.createdIds.reuseAdGroupId = reuseAdGroupId;

    const reuseBanner = await client.createBanner(
      config.integrationId,
      reuseAdGroupId,
      buildBannerPayload({
        template: template.banner,
        name: `${config.adGroupNamePrefix}-${suffix}-reuse-banner`,
        primaryUrlId: url.id,
      }),
    );
    const reuseBannerId =
      asNumber(reuseBanner.id) ??
      asNumber(Array.isArray(reuseBanner.banners) ? reuseBanner.banners[0]?.id : null);
    if (reuseBannerId === null) {
      throw new Error(
        'VK Ads createBanner response does not contain numeric id for reuse path',
      );
    }
    result.reuseBannerCreated = true;
    result.createdIds.reuseBannerId = reuseBannerId;

    await client.getBanner(config.integrationId, reuseBannerId, {
      fields: 'id,name,status,urls',
    });

    result.scriptSucceeded = true;
    result.technicalVerdict = 'passed';
    result.productVerdict = 'passed';

  } catch (error) {
    result.error = mapClientError(error);
    if (result.technicalVerdict !== 'gap') {
      result.technicalVerdict = 'failed';
    }
    if (result.productVerdict === 'unknown') {
      result.productVerdict = 'failed';
    }
  } finally {
    result.cleanup = await cleanupEntities({
      client,
      integrationId: config.integrationId,
      bannerIds: [result.createdIds.bannerId, result.createdIds.reuseBannerId],
      adGroupIds: [
        result.createdIds.adGroupId,
        result.createdIds.reuseAdGroupId,
      ],
      adPlanId: result.createdIds.adPlanId,
      enabled: config.cleanupEnabled,
    });

    console.log(JSON.stringify(result, null, 2));

    await prisma.$disconnect();

    if (!result.scriptSucceeded) {
      process.exitCode = 1;
    }
  }
}

void main();
