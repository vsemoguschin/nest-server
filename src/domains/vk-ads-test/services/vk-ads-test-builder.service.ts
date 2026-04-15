import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  VkAdsCreateIdResponse,
  VkAdsTestClientError,
  VkAdsTestClient,
  VkAdsUrl,
} from '../clients/vk-ads-test.client';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';

type PackageInfo = {
  id: number;
  status?: string;
  objective?: string[];
  url_types?: Record<string, string[][]>;
  [key: string]: unknown;
};

type BannerTemplate = {
  adGroupId: number;
  bannerId: number;
  banner: Record<string, unknown>;
};

type VideoSlotProfile = 'portrait_9_16' | 'portrait_4_5';

export class VkAdsTestBuildError extends Error {
  readonly stage: 'createAdGroup' | 'createBanner';
  readonly status?: number;
  readonly vkErrorBody?: unknown;
  readonly vkErrorCode?: string;
  readonly vkErrorMessage?: string;
  readonly adGroupPayload?: Record<string, unknown>;
  readonly bannerPayload?: Record<string, unknown>;
  readonly templateAdGroupId?: number;
  readonly templateBannerId?: number;

  constructor(params: {
    stage: 'createAdGroup' | 'createBanner';
    message: string;
    status?: number;
    vkErrorBody?: unknown;
    vkErrorCode?: string;
    vkErrorMessage?: string;
    adGroupPayload?: Record<string, unknown>;
    bannerPayload?: Record<string, unknown>;
    templateAdGroupId?: number;
    templateBannerId?: number;
  }) {
    super(params.message);
    this.name = 'VkAdsTestBuildError';
    this.stage = params.stage;
    this.status = params.status;
    this.vkErrorBody = params.vkErrorBody;
    this.vkErrorCode = params.vkErrorCode;
    this.vkErrorMessage = params.vkErrorMessage;
    this.adGroupPayload = params.adGroupPayload;
    this.bannerPayload = params.bannerPayload;
    this.templateAdGroupId = params.templateAdGroupId;
    this.templateBannerId = params.templateBannerId;
  }
}

export type VkAdsTestBuilderAudienceInput = {
  name: string;
  vkSegmentId?: number;
  includeSegmentIds?: number[];
  excludeSegmentIds?: number[];
  sex?: string;
  ageFrom?: number;
  ageTo?: number;
  geoJson?: Prisma.InputJsonValue;
  geoKey?: string;
  interestsJson?: Prisma.InputJsonValue;
  searchPhraseListId?: number;
  audienceSize?: number;
  vkTargetings?: Record<string, unknown>;
};

export type VkAdsTestBuilderCreativeInput = {
  name: string;
  title: string;
  text: string;
  videoSourceUrl?: string;
  vkContentId?: number | string;
  videoAssetId?: number;
  videoAssetVkContentId?: number;
  videoAssetWidth?: number;
  videoAssetHeight?: number;
  videoContentId?: number;
  imageContentId?: number;
  iconContentId?: number;
  leadFormId?: number;
};

export type VkAdsTestBuildOneVariantInput = {
  integrationId: number;
  accountId: number;
  projectId?: number;
  testName: string;
  packageId?: number;
  landingUrl: string;
  campaignName: string;
  adGroupName: string;
  bannerName: string;
  objective?: string;
  sharedUrlId?: number;
  budgetDay?: number | string;
  targetCpl?: number | string;
  scaleStepPercent?: number;
  firstCheckAfterHours?: number;
  minAudienceSize?: number;
  maxAudienceSize?: number;
  urlCheckTimeoutMs?: number;
  urlCheckIntervalMs?: number;
  audience: VkAdsTestBuilderAudienceInput;
  creative: VkAdsTestBuilderCreativeInput;
  ref?: string;
  persistResult?: boolean;
  existingIds?: {
    testId: number;
    audienceId: number;
    creativeId: number;
    variantId: number;
    variantKey: string;
    campaignId?: number;
    adGroupId?: number;
  };
};

export type VkAdsTestBuildOneVariantResult = {
  testId: number;
  audienceId: number;
  creativeId: number;
  variantId: number;
  variantKey: string;
  vkIds: {
    urlId: number;
    campaignId: number;
    adGroupId: number;
    bannerId: number;
    ref?: string;
    templateAdGroupId?: number;
    templateBannerId?: number;
  };
};

const DEFAULT_PACKAGE_ID = 3127;
const DEFAULT_URL_CHECK_TIMEOUT_MS = 120_000;
const DEFAULT_URL_CHECK_INTERVAL_MS = 5_000;
const DEFAULT_CTA_CODE = 'getPrice';
const DEFAULT_RUSSIA_REGION_ID = 188;
const DEFAULT_FULLTIME_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const VK_ADS_TEST_PADS = [1265106, 2243453];

@Injectable()
export class VkAdsTestBuilderService {
  private readonly logger = new Logger(VkAdsTestBuilderService.name);

  constructor(
    private readonly client: VkAdsTestClient,
    private readonly repository: VkAdsTestRepository,
  ) {}

  async buildOneVariant(
    input: VkAdsTestBuildOneVariantInput,
  ): Promise<VkAdsTestBuildOneVariantResult> {
    return this.buildPlacement(input);
  }

  async buildPlacement(
    input: VkAdsTestBuildOneVariantInput,
  ): Promise<VkAdsTestBuildOneVariantResult> {
    const packageId = input.packageId ?? DEFAULT_PACKAGE_ID;
    const pkg = await this.resolvePackage(input.integrationId, packageId);
    const objective = this.resolveObjective(input.objective, pkg);
    const variantRef = input.ref ?? this.buildVariantRef(input);
    const url = input.sharedUrlId
      ? { id: input.sharedUrlId }
      : await this.createUrlAndWait(input.integrationId, {
          landingUrl: input.landingUrl,
          timeoutMs: input.urlCheckTimeoutMs ?? DEFAULT_URL_CHECK_TIMEOUT_MS,
          intervalMs: input.urlCheckIntervalMs ?? DEFAULT_URL_CHECK_INTERVAL_MS,
          pkg,
        });
    const adGroupPayload = this.buildAdGroupPayload(input, packageId, -1);
    this.logAdGroupPayload({
      variantKey: input.existingIds?.variantKey ?? variantRef,
      budgetDay: input.budgetDay,
      autobiddingMode: 'max_goals',
      targetings: (adGroupPayload.targetings ?? {}) as Record<string, unknown>,
    });

    let campaignId: number;
    let adGroupId: number;

    if (input.existingIds?.campaignId !== undefined) {
      campaignId = input.existingIds.campaignId;
      if (input.existingIds.adGroupId !== undefined) {
        adGroupId = input.existingIds.adGroupId;
      } else {
        let adGroup;
        try {
          adGroup = await this.client.createAdGroup(input.integrationId, {
            ...adGroupPayload,
            ad_plan_id: campaignId,
          });
        } catch (error) {
          throw this.wrapBuildError('createAdGroup', error, {
            adGroupPayload: {
              ...adGroupPayload,
              ad_plan_id: campaignId,
            },
          });
        }
        adGroupId = this.requireNumber(
          adGroup.id,
          'VK Ads createAdGroup response does not contain numeric id',
        );
      }
    } else {
      const adPlan = await this.client.createAdPlan(
        input.integrationId,
        this.buildCampaignPayload(input, packageId, objective),
        url.id,
      );
      campaignId = this.requireNumber(
        adPlan.id,
        'VK Ads createAdPlan response does not contain numeric id',
      );
      adGroupId = this.requireNumber(
        adPlan.ad_groups?.[0]?.id,
        'VK Ads createAdPlan response does not contain numeric ad_groups[0].id',
      );
    }
    const template = await this.resolveBannerTemplate(
      input.integrationId,
      packageId,
    );
    const videoAsset = await this.resolveVideoAsset(input);
    const bannerPayload = this.buildBannerPayload({
      name: input.bannerName,
      primaryUrlId: url.id,
      creative: input.creative,
      template,
      videoContentId: videoAsset.videoContentId,
      videoSlotProfile: videoAsset.profile,
    });
    this.logBannerPayload({
      variantKey: input.existingIds?.variantKey ?? variantRef,
      payload: bannerPayload,
      templateBannerId: template.bannerId,
    });

    let banner;
    try {
      banner = await this.client.createBanner(
        input.integrationId,
        adGroupId,
        bannerPayload,
      );
    } catch (error) {
      throw this.wrapBuildError('createBanner', error, {
        adGroupPayload,
        bannerPayload,
        templateAdGroupId: template.adGroupId,
        templateBannerId: template.bannerId,
      });
    }
    const bannerId = this.extractCreatedBannerId(banner);

    if (input.persistResult === false) {
      if (!input.existingIds) {
        throw new Error(
          'existingIds are required when buildOneVariant persistResult is false',
        );
      }

      return {
        testId: input.existingIds.testId,
        audienceId: input.existingIds.audienceId,
        creativeId: input.existingIds.creativeId,
        variantId: input.existingIds.variantId,
        variantKey: input.existingIds.variantKey,
        vkIds: {
          urlId: url.id,
          campaignId,
          adGroupId,
          bannerId,
          ref: variantRef,
          templateAdGroupId: template.adGroupId,
          templateBannerId: template.bannerId,
        },
      };
    }

    const test = await this.repository.createTest({
      account: { connect: { id: input.accountId } },
      integration: { connect: { id: input.integrationId } },
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      name: input.testName,
      status: 'active',
      type: 'mixed',
      objective,
      packageId,
      ...(input.targetCpl !== undefined ? { targetCpl: input.targetCpl } : {}),
      ...(input.budgetDay !== undefined
        ? { startBudget: input.budgetDay }
        : {}),
      ...(input.scaleStepPercent !== undefined
        ? { scaleStepPercent: input.scaleStepPercent }
        : {}),
      ...(input.firstCheckAfterHours !== undefined
        ? { firstCheckAfterHours: input.firstCheckAfterHours }
        : {}),
      ...(input.minAudienceSize !== undefined
        ? { minAudienceSize: input.minAudienceSize }
        : {}),
      ...(input.maxAudienceSize !== undefined
        ? { maxAudienceSize: input.maxAudienceSize }
        : {}),
    });

    const audience = await this.repository.createAudience({
      test: { connect: { id: test.id } },
      name: input.audience.name,
      vkSegmentId: input.audience.vkSegmentId,
      includeSegmentIds: input.audience.includeSegmentIds,
      excludeSegmentIds: input.audience.excludeSegmentIds,
      status: 'active',
      vkAdGroupId: adGroupId,
      ...(input.audience.sex !== undefined ? { sex: input.audience.sex } : {}),
      ...(input.audience.ageFrom !== undefined
        ? { ageFrom: input.audience.ageFrom }
        : {}),
      ...(input.audience.ageTo !== undefined
        ? { ageTo: input.audience.ageTo }
        : {}),
      ...(input.audience.geoJson !== undefined
        ? { geoJson: input.audience.geoJson }
        : {}),
      ...(input.audience.geoKey !== undefined
        ? { geoKey: input.audience.geoKey }
        : {}),
      ...(input.audience.interestsJson !== undefined
        ? { interestsJson: input.audience.interestsJson }
        : {}),
      ...(input.audience.searchPhraseListId !== undefined
        ? { searchPhraseListId: input.audience.searchPhraseListId }
        : {}),
      ...(input.audience.audienceSize !== undefined
        ? { audienceSize: input.audience.audienceSize }
        : {}),
    });

    const creative = await this.repository.createCreative({
      test: { connect: { id: test.id } },
      name: input.creative.name,
      title: input.creative.title,
      text: input.creative.text,
      status: 'active',
      ...(input.creative.videoAssetId !== undefined
        ? { videoAssetId: input.creative.videoAssetId }
        : {}),
      ...(input.creative.videoContentId !== undefined
        ? { videoContentId: input.creative.videoContentId }
        : {}),
      ...(input.creative.imageContentId !== undefined
        ? { imageContentId: input.creative.imageContentId }
        : {}),
      ...(input.creative.iconContentId !== undefined
        ? { iconContentId: input.creative.iconContentId }
        : {}),
      ...(input.creative.leadFormId !== undefined
        ? { leadFormId: input.creative.leadFormId }
        : {}),
    });

    const variantKey = `vkads-test-${test.id}-${audience.id}-${creative.id}`;
    const variant = await this.repository.createVariant({
      test: { connect: { id: test.id } },
      audience: { connect: { id: audience.id } },
      creative: { connect: { id: creative.id } },
      variantKey,
      ref: variantRef,
      vkCampaignId: campaignId,
      vkAdGroupId: adGroupId,
      vkBannerId: bannerId,
      vkPrimaryUrlId: url.id,
      launchDate: new Date(),
      ...(input.budgetDay !== undefined
        ? { currentBudgetDay: input.budgetDay }
        : {}),
      status: 'active',
    });

    await this.repository.logAction({
      test: { connect: { id: test.id } },
      variant: { connect: { id: variant.id } },
      action: 'launched',
      reason: 'MVP one-variant builder flow',
      payloadJson: {
        integrationId: input.integrationId,
        packageId,
        urlId: url.id,
        campaignId,
        adGroupId,
        bannerId,
        ref: variantRef,
      },
    });

    return {
      testId: test.id,
      audienceId: audience.id,
      creativeId: creative.id,
      variantId: variant.id,
      variantKey,
      vkIds: {
        urlId: url.id,
        campaignId,
        adGroupId,
        bannerId,
        ref: variantRef,
      },
    };
  }

  async prepareLandingUrl(
    integrationId: number,
    landingUrl: string,
    packageId?: number,
    urlCheckTimeoutMs = DEFAULT_URL_CHECK_TIMEOUT_MS,
    urlCheckIntervalMs = DEFAULT_URL_CHECK_INTERVAL_MS,
  ): Promise<VkAdsUrl> {
    const resolvedPackageId = packageId ?? DEFAULT_PACKAGE_ID;
    const pkg = await this.resolvePackage(integrationId, resolvedPackageId);

    return this.createUrlAndWait(integrationId, {
      landingUrl,
      timeoutMs: urlCheckTimeoutMs,
      intervalMs: urlCheckIntervalMs,
      pkg,
    });
  }

  private async resolvePackage(
    integrationId: number,
    packageId: number,
  ): Promise<PackageInfo> {
    const packages = await this.client.getPackages(integrationId);
    const pkg = (packages.items || [])
      .map((item) => item as PackageInfo)
      .find((item) => Number(item.id) === packageId);

    if (!pkg) {
      throw new Error(`Package ${packageId} was not found via VK Ads API`);
    }

    if (pkg.status && pkg.status !== 'active') {
      throw new Error(`Package ${packageId} has status=${pkg.status}`);
    }

    return pkg;
  }

  private resolveObjective(
    inputObjective: string | undefined,
    pkg: PackageInfo,
  ): string {
    if (inputObjective) {
      return inputObjective;
    }

    const packageObjectives = this.asStringArray(pkg.objective);
    if (packageObjectives.length === 1) {
      return packageObjectives[0];
    }

    throw new Error(
      `Objective is required because package ${pkg.id} does not expose exactly one objective`,
    );
  }

  private async createUrlAndWait(
    integrationId: number,
    params: {
      landingUrl: string;
      timeoutMs: number;
      intervalMs: number;
      pkg: PackageInfo;
    },
  ): Promise<VkAdsUrl> {
    const created = await this.client.createUrl(integrationId, {
      url: params.landingUrl,
    });
    const urlId = this.requireNumber(
      created.id,
      'VK Ads createUrl response does not contain numeric id',
    );
    const startedAt = Date.now();

    for (;;) {
      const url = await this.client.getUrl(integrationId, urlId);
      if (Array.isArray(url.url_types) && url.url_types.length > 0) {
        this.validateUrlAgainstPackage(url, params.pkg);
        return url;
      }

      if (Date.now() - startedAt >= params.timeoutMs) {
        throw new Error(
          `URL ${urlId} did not finish url_types check within ${params.timeoutMs}ms`,
        );
      }

      await this.sleep(params.intervalMs);
    }
  }

  private buildCampaignPayload(
    input: VkAdsTestBuildOneVariantInput,
    packageId: number,
    objective: string,
  ): Record<string, unknown> {
    return {
      name: input.campaignName,
      status: 'blocked',
      objective,
      ad_groups: [this.buildAdGroupCorePayload(input, packageId)],
    };
  }

  private buildAdGroupPayload(
    input: VkAdsTestBuildOneVariantInput,
    packageId: number,
    campaignId: number,
  ): Record<string, unknown> {
    return {
      ad_plan_id: campaignId,
      ...this.buildAdGroupCorePayload(input, packageId),
    };
  }

  private buildBannerPayload(params: {
    name: string;
    primaryUrlId: number;
    creative: VkAdsTestBuildOneVariantInput['creative'];
    template: BannerTemplate;
    videoContentId: number;
    videoSlotProfile: VideoSlotProfile;
  }): Record<string, unknown> {
    const templateBanner = this.requireRecord(
      params.template.banner,
      'VK Ads banner template must be an object',
    );
    const templateUrls = this.requireRecord(
      templateBanner.urls,
      'VK Ads banner template is missing urls',
    );
    this.requireRecord(
      templateUrls.primary,
      'VK Ads banner template is missing urls.primary',
    );
    const templateContent = this.requireRecord(
      templateBanner.content,
      'VK Ads banner template is missing content',
    );
    const templateTextblocks = this.requireRecord(
      templateBanner.textblocks,
      'VK Ads banner template is missing textblocks',
    );

    const content = this.buildBannerContentFromTemplate(
      templateContent,
      params.videoContentId,
      params.videoSlotProfile,
    );
    const textblocks = this.buildBannerTextblocksFromTemplate(
      templateTextblocks,
      params.creative,
    );

    return {
      name: params.name,
      status: 'blocked',
      urls: {
        primary: {
          id: params.primaryUrlId,
        },
      },
      content,
      textblocks,
    };
  }

  private buildAdGroupCorePayload(
    input: VkAdsTestBuildOneVariantInput,
    packageId: number,
  ): Record<string, unknown> {
    const targetings =
      input.audience.vkTargetings ?? this.buildTargetings(input.audience);

    return {
      name: input.adGroupName,
      package_id: packageId,
      status: 'blocked',
      // UI: "Минимальная цена" -> VK Ads API: "max_goals"
      autobidding_mode: 'max_goals',
      budget_limit_day: input.budgetDay,
      enable_utm: true,
      utm: this.buildAdGroupUtm(input),
      targetings,
      banners: [],
    };
  }

  private buildTargetings(
    audience: VkAdsTestBuilderAudienceInput,
  ): Record<string, unknown> {
    const targetings: Record<string, unknown> = {
      geo: {
        regions: this.normalizeRegionIds(audience.geoJson, audience.geoKey),
      },
      fulltime: this.buildDefaultFulltimeTargeting(),
      pads: [...VK_ADS_TEST_PADS],
    };

    if (audience.sex) {
      targetings.sex = [audience.sex];
    }

    const ageList = this.buildAgeList(audience.ageFrom, audience.ageTo);
    if (ageList.length) {
      targetings.age = { age_list: ageList };
    }

    const segments = this.normalizeSegmentTargetings(audience);
    if (segments.length) {
      targetings.segments = segments;
    }

    return targetings;
  }

  private buildDefaultFulltimeTargeting(): Record<string, unknown> {
    return {
      flags: ['cross_timezone', 'use_holidays_moving'],
      mon: [...DEFAULT_FULLTIME_HOURS],
      tue: [...DEFAULT_FULLTIME_HOURS],
      wed: [...DEFAULT_FULLTIME_HOURS],
      thu: [...DEFAULT_FULLTIME_HOURS],
      fri: [...DEFAULT_FULLTIME_HOURS],
      sat: [...DEFAULT_FULLTIME_HOURS],
      sun: [...DEFAULT_FULLTIME_HOURS],
    };
  }

  private buildVariantRef(input: {
    existingIds?: { testId: number; audienceId: number; creativeId: number };
    testName: string;
    audience: { name: string };
    creative: { name: string };
  }): string {
    const testId = input.existingIds?.testId;
    const audienceId = input.existingIds?.audienceId;
    const creativeId = input.existingIds?.creativeId;

    if (testId && audienceId && creativeId) {
      return `vat_${testId}_${audienceId}_${creativeId}`;
    }

    return `vat_${this.normalizeRefPart(input.testName)}_${this.normalizeRefPart(
      input.audience.name,
    )}_${this.normalizeRefPart(input.creative.name)}`;
  }

  private buildAdGroupUtm(input: VkAdsTestBuildOneVariantInput): string {
    const ref =
      input.existingIds?.variantKey ?? input.ref ?? this.buildVariantRef(input);
    return `ref=${encodeURIComponent(ref)}`;
  }

  private normalizeRefPart(value: string): string {
    return (
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9а-яё]+/giu, '_')
        .replace(/^_+|_+$/g, '') || 'x'
    );
  }

  private asInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isInteger(parsed) ? parsed : null;
    }

    return null;
  }

  private normalizeRegionIds(
    geoJson?: Prisma.InputJsonValue,
    geoKey?: string,
  ): number[] {
    const candidates: unknown[] = [];

    if (geoKey) {
      candidates.push(geoKey);
    }

    if (Array.isArray(geoJson)) {
      candidates.push(...geoJson);
    } else if (
      geoJson &&
      typeof geoJson === 'object' &&
      !Array.isArray(geoJson)
    ) {
      const record = geoJson as Record<string, unknown>;
      candidates.push(
        ...(Array.isArray(record.geo) ? record.geo : []),
        ...(Array.isArray(record.countries) ? record.countries : []),
        ...(Array.isArray(record.values) ? record.values : []),
      );
    }

    const geo = candidates
      .map((item) => {
        if (typeof item === 'string') {
          const normalized = item.trim();
          if (!normalized) {
            return null;
          }

          if (normalized === 'RU' || normalized === 'Россия') {
            return DEFAULT_RUSSIA_REGION_ID;
          }

          const parsed = Number(normalized);
          return Number.isFinite(parsed) ? parsed : null;
        }

        if (typeof item === 'number' && Number.isFinite(item)) {
          return item;
        }

        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          const possibleValue =
            record.code ??
            record.key ??
            record.id ??
            record.name ??
            record.value;
          if (
            typeof possibleValue === 'number' &&
            Number.isFinite(possibleValue)
          ) {
            return possibleValue;
          }
          if (typeof possibleValue === 'string') {
            const normalized = possibleValue.trim();
            if (normalized === 'RU' || normalized === 'Россия') {
              return DEFAULT_RUSSIA_REGION_ID;
            }
            const parsed = Number(normalized);
            return Number.isFinite(parsed) ? parsed : null;
          }
        }

        return null;
      })
      .filter(
        (item): item is number =>
          typeof item === 'number' && Number.isInteger(item) && item > 0,
      );

    return geo.length ? Array.from(new Set(geo)) : [DEFAULT_RUSSIA_REGION_ID];
  }

  private buildAgeList(
    ageFrom?: number | null,
    ageTo?: number | null,
  ): number[] {
    const from = this.asInteger(ageFrom);
    const to = this.asInteger(ageTo);

    if (from === null && to === null) {
      return [];
    }

    if (from !== null && to !== null) {
      const start = Math.min(from, to);
      const end = Math.max(from, to);
      const ages: number[] = [];
      for (let age = start; age <= end; age += 1) {
        ages.push(age);
      }
      return ages;
    }

    const single = from ?? to;
    return single === null ? [] : [single];
  }

  private normalizeSegmentTargetings(
    audience: VkAdsTestBuilderAudienceInput,
  ): number[] {
    const includeSegmentIds = this.normalizeSegmentIds(
      audience.includeSegmentIds,
    );
    const excludeSegmentIds = this.normalizeSegmentIds(
      audience.excludeSegmentIds,
    );
    const legacySegmentId = audience.vkSegmentId;

    if (includeSegmentIds.length || excludeSegmentIds.length) {
      return [
        ...includeSegmentIds,
        ...excludeSegmentIds.map((id) => -Math.abs(id)),
      ];
    }

    if (legacySegmentId !== undefined && legacySegmentId !== null) {
      return [legacySegmentId];
    }

    return [];
  }

  private normalizeSegmentIds(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);
  }

  private logAdGroupPayload(params: {
    variantKey: string;
    budgetDay?: number | string;
    autobiddingMode: string;
    targetings: Record<string, unknown>;
  }) {
    this.logger.warn(
      JSON.stringify({
        scope: 'vk-ads-test-builder',
        event: 'createAdGroup.payload',
        variantKey: params.variantKey,
        budget_limit_day: params.budgetDay,
        autobidding_mode: params.autobiddingMode,
        targetings: params.targetings,
      }),
    );
  }

  private logBannerPayload(params: {
    variantKey: string;
    payload: Record<string, unknown>;
    templateBannerId?: number;
  }) {
    const content = params.payload.content as
      | Record<string, unknown>
      | undefined;
    const textblocks = params.payload.textblocks as
      | Record<string, unknown>
      | undefined;
    const urls = params.payload.urls as Record<string, unknown> | undefined;
    const primary = urls?.primary as Record<string, unknown> | undefined;

    this.logger.warn(
      JSON.stringify({
        scope: 'vk-ads-test-builder',
        event: 'createBanner.payload',
        variantKey: params.variantKey,
        templateBannerId: params.templateBannerId,
        payload: {
          rootKeys: Object.keys(params.payload),
          urls: {
            primaryKeys: primary ? Object.keys(primary) : [],
          },
          content: content
            ? Object.fromEntries(
                Object.entries(content).map(([key, value]) => [
                  key,
                  value && typeof value === 'object' && !Array.isArray(value)
                    ? Object.keys(value as Record<string, unknown>)
                    : [],
                ]),
              )
            : {},
          textblocks: textblocks ? Object.keys(textblocks) : [],
        },
      }),
    );
  }

  private logBannerContentGap(params: { variantKey: string; reason: string }) {
    this.logger.warn(
      JSON.stringify({
        scope: 'vk-ads-test-builder',
        event: 'createBanner.content.videoAssetMissing',
        variantKey: params.variantKey,
        reason: params.reason,
      }),
    );
  }

  private async resolveVideoAsset(
    input: VkAdsTestBuildOneVariantInput,
  ): Promise<{
    videoContentId: number;
    profile: VideoSlotProfile;
  }> {
    const videoAssetId = this.asNumber(input.creative.videoAssetId);
    const videoContentId = this.asNumber(input.creative.videoAssetVkContentId);
    const width = this.asNumber(input.creative.videoAssetWidth);
    const height = this.asNumber(input.creative.videoAssetHeight);

    if (
      videoAssetId === null ||
      videoContentId === null ||
      width === null ||
      height === null
    ) {
      this.logBannerContentGap({
        variantKey:
          input.existingIds?.variantKey ??
          input.ref ??
          this.buildVariantRef(input),
        reason: 'creative_video_asset_not_selected',
      });

      throw new Error(
        'VK Ads creative videoAssetId is required to build video banner',
      );
    }

    return {
      videoContentId,
      profile: this.resolveVideoSlotProfile(width, height),
    };
  }

  private async resolveBannerTemplate(
    integrationId: number,
    packageId: number,
  ): Promise<BannerTemplate> {
    const adGroups = await this.loadAdGroupsForPackage(
      integrationId,
      packageId,
    );

    for (const adGroup of adGroups) {
      const bannerIds = await this.loadBannerIdsForAdGroup(
        integrationId,
        adGroup.id,
      );

      for (const bannerId of bannerIds) {
        const banner = await this.client.getBanner(integrationId, bannerId, {
          fields:
            'id,ad_group_id,name,status,moderation_status,content,textblocks,urls',
        });

        if (this.isUsableBannerTemplate(banner)) {
          return {
            adGroupId: adGroup.id,
            bannerId,
            banner,
          };
        }
      }
    }

    throw new Error(
      `VK Ads runtime banner template was not found for package_id=${packageId}`,
    );
  }

  private async loadAdGroupsForPackage(
    integrationId: number,
    packageId: number,
  ): Promise<Array<{ id: number }>> {
    const limit = 100;
    const result: Array<{ id: number }> = [];

    for (let offset = 0; ; offset += limit) {
      const response = await this.client.getAdGroups(integrationId, {
        fields: 'id,package_id,name,status',
        limit,
        offset,
        sorting: '-id',
      });

      const pageItems = (response.items ?? [])
        .map((item) => {
          const record = this.asRecord(item);
          const id = this.asNumber(record?.id);
          const currentPackageId = this.asNumber(record?.package_id);

          if (id === null || currentPackageId !== packageId) {
            return null;
          }

          return { id };
        })
        .filter((item): item is { id: number } => item !== null);

      result.push(...pageItems);

      if ((response.items?.length ?? 0) < limit) {
        break;
      }
    }

    return result;
  }

  private async loadBannerIdsForAdGroup(
    integrationId: number,
    adGroupId: number,
  ): Promise<number[]> {
    const limit = 100;
    const ids: number[] = [];

    for (let offset = 0; ; offset += limit) {
      const response = await this.client.getBanners(integrationId, {
        _ad_group_id: adGroupId,
        _status__in: 'active,blocked',
        fields: 'id,ad_group_id,status,moderation_status',
        limit,
        offset,
        sorting: '-id',
      });

      ids.push(
        ...(response.items ?? [])
          .map((item) => {
            const record = this.asRecord(item);
            const id = this.asNumber(record?.id);
            return id === null ? null : id;
          })
          .filter((item): item is number => item !== null),
      );

      if ((response.items?.length ?? 0) < limit) {
        break;
      }
    }

    return ids;
  }

  private isUsableBannerTemplate(banner: Record<string, unknown>): boolean {
    if (!banner) {
      return false;
    }

    const moderationStatus =
      typeof banner.moderation_status === 'string'
        ? banner.moderation_status
        : undefined;
    if (moderationStatus && moderationStatus !== 'allowed') {
      return false;
    }

    const urls = this.asRecord(banner.urls);
    const primary = this.asRecord(urls?.primary);
    const content = this.asRecord(banner.content);
    const textblocks = this.asRecord(banner.textblocks);

    return (
      this.asNumber(primary?.id) !== null &&
      content !== undefined &&
      Object.keys(content).length > 0 &&
      textblocks !== undefined &&
      this.asRecord(textblocks.title_40_vkads) !== undefined &&
      this.asRecord(textblocks.text_2000) !== undefined &&
      this.asRecord(textblocks.about_company_115) !== undefined &&
      this.asRecord(textblocks.cta_community_vk) !== undefined
    );
  }

  private requireRecord(
    value: unknown,
    message: string,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(message);
    }

    return value as Record<string, unknown>;
  }

  private wrapBuildError(
    stage: 'createAdGroup' | 'createBanner',
    error: unknown,
    context: {
      adGroupPayload?: Record<string, unknown>;
      bannerPayload?: Record<string, unknown>;
      templateAdGroupId?: number;
      templateBannerId?: number;
    },
  ): Error {
    if (error instanceof VkAdsTestClientError) {
      return new VkAdsTestBuildError({
        stage,
        message: this.toShortErrorMessage(error),
        status: error.status,
        vkErrorBody: error.rawError,
        vkErrorCode: error.vkErrorCode,
        vkErrorMessage: error.vkErrorMessage,
        adGroupPayload: context.adGroupPayload,
        bannerPayload: context.bannerPayload,
        templateAdGroupId: context.templateAdGroupId,
        templateBannerId: context.templateBannerId,
      });
    }

    return error instanceof Error ? error : new Error(String(error));
  }

  private toShortErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 500);
  }

  private buildBannerContentFromTemplate(
    templateContent: Record<string, unknown>,
    videoContentId: number,
    videoSlotProfile: VideoSlotProfile,
  ): Record<string, { id: number }> {
    const content: Record<string, { id: number }> = {};

    for (const [key, value] of Object.entries(templateContent)) {
      const record = this.requireRecord(
        value,
        `VK Ads banner template content.${key} must be an object`,
      );
      const id = this.asNumber(record.id);
      if (id === null) {
        throw new Error(
          `VK Ads banner template content.${key} is missing numeric id`,
        );
      }

      const type = typeof record.type === 'string' ? record.type : undefined;
      const isVideoSlot = type === 'video' || key.startsWith('video_');

      if (!isVideoSlot) {
        content[key] = { id };
        continue;
      }

      if (!this.isCompatibleVideoContentKey(key, videoSlotProfile)) {
        continue;
      }

      content[key] = { id: videoContentId };
    }

    return content;
  }

  private resolveVideoSlotProfile(
    width: number,
    height: number,
  ): VideoSlotProfile {
    const ratio = width / height;
    const candidates: Array<{ profile: VideoSlotProfile; ratio: number }> = [
      { profile: 'portrait_9_16', ratio: 9 / 16 },
      { profile: 'portrait_4_5', ratio: 4 / 5 },
    ];
    const closest = [...candidates].sort(
      (left, right) =>
        Math.abs(ratio - left.ratio) - Math.abs(ratio - right.ratio),
    )[0];

    if (Math.abs(ratio - closest.ratio) > 0.08) {
      throw new Error(
        `VK Ads video asset aspect ratio is not supported: ${width}x${height}`,
      );
    }

    return closest.profile;
  }

  private isCompatibleVideoContentKey(
    key: string,
    profile: VideoSlotProfile,
  ): boolean {
    if (profile === 'portrait_9_16') {
      return (
        key === 'video_portrait_9_16_30s' ||
        key === 'video_portrait_9_16_180s'
      );
    }

    return (
      key === 'video_portrait_4_5_30s' || key === 'video_portrait_4_5_180s'
    );
  }

  private buildBannerTextblocksFromTemplate(
    templateTextblocks: Record<string, unknown>,
    creative: VkAdsTestBuildOneVariantInput['creative'],
  ): Record<string, Record<string, string>> {
    const aboutCompany = this.requireRecord(
      templateTextblocks.about_company_115,
      'VK Ads banner template is missing textblocks.about_company_115',
    );
    const cta = this.requireRecord(
      templateTextblocks.cta_community_vk,
      'VK Ads banner template is missing textblocks.cta_community_vk',
    );
    const title = this.requireRecord(
      templateTextblocks.title_40_vkads,
      'VK Ads banner template is missing textblocks.title_40_vkads',
    );
    const text = this.requireRecord(
      templateTextblocks.text_2000,
      'VK Ads banner template is missing textblocks.text_2000',
    );

    return {
      about_company_115: {
        text: this.toTextblockTitle(aboutCompany.text),
        ...(aboutCompany.title !== undefined
          ? { title: this.toTextblockTitle(aboutCompany.title) }
          : {}),
      },
      cta_community_vk: {
        text: DEFAULT_CTA_CODE,
        ...(cta.title !== undefined
          ? { title: this.toTextblockTitle(cta.title) }
          : {}),
      },
      title_40_vkads: {
        text: creative.title,
        ...(title.title !== undefined
          ? { title: this.toTextblockTitle(title.title) }
          : {}),
      },
      text_2000: {
        text: creative.text,
        ...(text.title !== undefined
          ? { title: this.toTextblockTitle(text.title) }
          : {}),
      },
    };
  }

  private toTextblockTitle(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    return '';
  }

  private extractCreatedBannerId(response: VkAdsCreateIdResponse): number {
    return this.requireNumber(
      response.id ?? response.banners?.[0]?.id,
      'VK Ads createBanner response does not contain numeric id',
    );
  }

  private validateUrlAgainstPackage(url: VkAdsUrl, pkg: PackageInfo): void {
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

  private requireNumber(value: unknown, message: string): number {
    const parsed = this.asNumber(value);
    if (parsed === null) {
      throw new Error(message);
    }

    return parsed;
  }

  private asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
