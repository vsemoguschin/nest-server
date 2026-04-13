import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  VkAdsCreateIdResponse,
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

type BannerFieldValue = {
  id?: number;
  text?: string;
  [key: string]: unknown;
};

type BannerDetails = {
  id: number;
  content?: Record<string, BannerFieldValue>;
  textblocks?: Record<string, BannerFieldValue>;
  urls?: Record<string, BannerFieldValue>;
};

type TemplateSource = {
  adGroupId: number;
  banner: BannerDetails;
};

export type VkAdsTestBuilderAudienceInput = {
  name: string;
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
  persistResult?: boolean;
  existingIds?: {
    testId: number;
    audienceId: number;
    creativeId: number;
    variantId: number;
    variantKey: string;
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
    templateAdGroupId: number;
    templateBannerId: number;
  };
};

const DEFAULT_PACKAGE_ID = 3127;
const DEFAULT_URL_CHECK_TIMEOUT_MS = 120_000;
const DEFAULT_URL_CHECK_INTERVAL_MS = 5_000;
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

@Injectable()
export class VkAdsTestBuilderService {
  constructor(
    private readonly client: VkAdsTestClient,
    private readonly repository: VkAdsTestRepository,
  ) {}

  async buildOneVariant(
    input: VkAdsTestBuildOneVariantInput,
  ): Promise<VkAdsTestBuildOneVariantResult> {
    const packageId = input.packageId ?? DEFAULT_PACKAGE_ID;
    const pkg = await this.resolvePackage(input.integrationId, packageId);
    const objective = this.resolveObjective(input.objective, pkg);
    const url = await this.createUrlAndWait(input.integrationId, {
      landingUrl: input.landingUrl,
      timeoutMs: input.urlCheckTimeoutMs ?? DEFAULT_URL_CHECK_TIMEOUT_MS,
      intervalMs: input.urlCheckIntervalMs ?? DEFAULT_URL_CHECK_INTERVAL_MS,
      pkg,
    });

    const adPlan = await this.client.createAdPlan(
      input.integrationId,
      this.buildCampaignPayload(input, packageId, objective),
      url.id,
    );
    const campaignId = this.requireNumber(
      adPlan.id,
      'VK Ads createAdPlan response does not contain numeric id',
    );
    const adGroupId = this.requireNumber(
      adPlan.ad_groups?.[0]?.id,
      'VK Ads createAdPlan response does not contain numeric ad_groups[0].id',
    );

    const template = await this.findTemplateBanner(input.integrationId, packageId);
    if (!template) {
      throw new Error(
        `Runtime banner template was not found for package_id=${packageId}`,
      );
    }

    const banner = await this.client.createBanner(
      input.integrationId,
      adGroupId,
      this.buildBannerPayload({
        template: template.banner,
        name: input.bannerName,
        primaryUrlId: url.id,
      }),
    );
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
          templateAdGroupId: template.adGroupId,
          templateBannerId: template.banner.id,
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
      ...(input.budgetDay !== undefined ? { startBudget: input.budgetDay } : {}),
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
        templateAdGroupId: template.adGroupId,
        templateBannerId: template.banner.id,
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
        templateAdGroupId: template.adGroupId,
        templateBannerId: template.banner.id,
      },
    };
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

  private resolveObjective(inputObjective: string | undefined, pkg: PackageInfo): string {
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
      ad_groups: [
        {
          name: input.adGroupName,
          package_id: packageId,
          ...(input.budgetDay !== undefined
            ? { budget_limit_day: input.budgetDay }
            : {}),
          ...(input.audience.vkTargetings
            ? { targetings: input.audience.vkTargetings }
            : {}),
          banners: [],
        },
      ],
    };
  }

  private async findTemplateBanner(
    integrationId: number,
    packageId: number,
  ): Promise<TemplateSource | null> {
    const pageSize = 50;

    for (let offset = 0; ; offset += pageSize) {
      const adGroups = await this.client.getAdGroups(integrationId, {
        fields: 'id,package_id,status',
        limit: pageSize,
        offset,
        _status__in: 'active,blocked',
      });

      for (const item of adGroups.items || []) {
        const adGroupId = this.asNumber((item as Record<string, unknown>).id);
        const adGroupPackageId = this.asNumber(
          (item as Record<string, unknown>).package_id,
        );
        const adGroupStatus =
          typeof (item as Record<string, unknown>).status === 'string'
            ? ((item as Record<string, unknown>).status as string)
            : undefined;

        if (
          adGroupId === null ||
          adGroupPackageId === null ||
          adGroupPackageId !== packageId ||
          adGroupStatus === 'deleted'
        ) {
          continue;
        }

        const banners = await this.client.getBanners(integrationId, {
          fields: 'id,status,ad_group_id',
          _ad_group_id: adGroupId,
          _status__in: 'active,blocked',
          limit: pageSize,
          offset: 0,
        });

        for (const bannerItem of banners.items || []) {
          const bannerId = this.asNumber(
            (bannerItem as Record<string, unknown>).id,
          );
          if (bannerId === null) {
            continue;
          }

          const rawBanner = await this.client.getBanner(integrationId, bannerId, {
            fields: 'id,status,content,textblocks,urls',
          });
          const banner = this.toBannerDetails(rawBanner, bannerId);
          if (this.isUsableTemplateBanner(banner)) {
            return {
              adGroupId,
              banner,
            };
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

  private buildBannerPayload(params: {
    template: BannerDetails;
    name: string;
    primaryUrlId: number;
  }): Record<string, unknown> {
    return {
      name: params.name,
      status: 'blocked',
      urls: this.pickPrimaryUrl(params.template.urls, params.primaryUrlId),
      content: this.pickContent(params.template.content),
      textblocks: this.pickTextblocks(params.template.textblocks),
    };
  }

  private extractCreatedBannerId(response: VkAdsCreateIdResponse): number {
    return this.requireNumber(
      response.id ?? response.banners?.[0]?.id,
      'VK Ads createBanner response does not contain numeric id',
    );
  }

  private toBannerDetails(rawBanner: Record<string, unknown>, fallbackId: number): BannerDetails {
    return {
      id: this.asNumber(rawBanner.id) ?? fallbackId,
      content: this.asRecord(rawBanner.content) as
        | Record<string, BannerFieldValue>
        | undefined,
      textblocks: this.asRecord(rawBanner.textblocks) as
        | Record<string, BannerFieldValue>
        | undefined,
      urls: this.asRecord(rawBanner.urls) as
        | Record<string, BannerFieldValue>
        | undefined,
    };
  }

  private isUsableTemplateBanner(banner: BannerDetails): boolean {
    const primaryUrlId = this.asNumber(banner.urls?.primary?.id);

    return (
      primaryUrlId !== null &&
      REQUIRED_TEMPLATE_CONTENT_KEYS.every((key) =>
        Boolean(this.asNumber(banner.content?.[key]?.id)),
      ) &&
      REQUIRED_TEMPLATE_TEXTBLOCK_KEYS.every((key) =>
        Boolean(banner.textblocks?.[key]?.text),
      )
    );
  }

  private pickContent(
    content: Record<string, BannerFieldValue> | undefined,
  ): Record<string, { id: number }> {
    const out: Record<string, { id: number }> = {};
    for (const key of REQUIRED_TEMPLATE_CONTENT_KEYS) {
      const id = this.asNumber(content?.[key]?.id);
      if (id === null) {
        throw new Error(`Runtime banner template is missing content.${key}.id`);
      }

      out[key] = { id };
    }

    return out;
  }

  private pickTextblocks(
    textblocks: Record<string, BannerFieldValue> | undefined,
  ): Record<string, { text: string }> {
    const out: Record<string, { text: string }> = {};
    for (const key of REQUIRED_TEMPLATE_TEXTBLOCK_KEYS) {
      const text = textblocks?.[key]?.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error(`Runtime banner template is missing textblocks.${key}.text`);
      }

      out[key] = { text };
    }

    return out;
  }

  private pickPrimaryUrl(
    urls: Record<string, BannerFieldValue> | undefined,
    primaryUrlId: number,
  ): Record<string, { id: number }> {
    const id = this.asNumber(urls?.primary?.id);
    if (id === null) {
      throw new Error('Runtime banner template is missing urls.primary.id');
    }

    return {
      primary: { id: primaryUrlId },
    };
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
