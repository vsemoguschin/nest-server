import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LaunchCitiesDto } from '../dto/launch-cities.dto';
import { VkAdsTestClient, VkAdsTestClientError } from '../clients/vk-ads-test.client';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';
import { VkAdsTestBuilderService } from './vk-ads-test-builder.service';
import { VkAdsTestVideoAssetsService } from './vk-ads-test-video-assets.service';
import { VkAdsTestRuntimeStatusService } from './vk-ads-test-runtime-status.service';

type LaunchCityRecord = LaunchCitiesDto['cities'][number];

const VK_ADS_TEST_OBJECTIVE = 'socialengagement';
const VK_ADS_TEST_PACKAGE_ID = 3127;
const DEFAULT_RUSSIA_REGION_ID = 188;
const VK_ADS_TEST_PADS = [1265106, 2243453];
const CITIES_FLOW_ACTION = 'cities_flow_created';
const CITIES_AD_GROUP_THROTTLE_MIN_MS = 300;
const CITIES_AD_GROUP_THROTTLE_MAX_MS = 500;

@Injectable()
export class VkAdsTestCitiesLaunchService {
  private readonly logger = new Logger(VkAdsTestCitiesLaunchService.name);

  constructor(
    private readonly repository: VkAdsTestRepository,
    private readonly client: VkAdsTestClient,
    private readonly builder: VkAdsTestBuilderService,
    private readonly videoAssetsService: VkAdsTestVideoAssetsService,
    private readonly runtimeStatusService: VkAdsTestRuntimeStatusService,
  ) {}

  async launchCities(dto: LaunchCitiesDto) {
    const cities = this.normalizeLaunchCities(dto.cities);
    if (!cities.length) {
      throw new BadRequestException('At least one city is required');
    }

    const integration = await this.repository.findIntegrationById(
      dto.accountIntegrationId,
    );
    if (!integration) {
      throw new NotFoundException(
        `VK Ads integration not found: id=${dto.accountIntegrationId}`,
      );
    }

    const existingTest =
      dto.testId !== undefined
        ? await this.repository.findTestById(dto.testId)
        : null;

    if (
      existingTest &&
      existingTest.accountIntegrationId !== dto.accountIntegrationId
    ) {
      throw new BadRequestException(
        `VK Ads test ${dto.testId} belongs to another integration`,
      );
    }

    const test = existingTest
      ? await this.repository.updateTest(existingTest.id, {
          name: dto.name,
          flowType: 'cities',
          status: 'draft',
          landingUrl: dto.landingUrl,
          startBudget: dto.startBudget,
        })
      : await this.repository.createTest({
          accountIntegration: { connect: { id: dto.accountIntegrationId } },
          flowType: 'cities',
          name: dto.name,
          status: 'draft',
          objective: VK_ADS_TEST_OBJECTIVE,
          packageId: VK_ADS_TEST_PACKAGE_ID,
          startBudget: dto.startBudget,
          landingUrl: dto.landingUrl,
        });

    await this.repository.logAction({
      test: { connect: { id: test.id } },
      action: CITIES_FLOW_ACTION,
      payloadJson: {
        accountIntegrationId: dto.accountIntegrationId,
        testId: test.id,
        expectedCitiesCount: cities.length,
        reusedDraftTestId: existingTest ? existingTest.id : null,
        startBudget: dto.startBudget,
        landingUrl: dto.landingUrl,
        sex: dto.sex ?? null,
        ageFrom: dto.ageFrom ?? null,
        ageTo: dto.ageTo ?? null,
      },
    });

    const videoAsset = dto.videoAssetId
      ? await this.videoAssetsService.ensureVideoAssetForCreative(
          test.id,
          dto.videoAssetId,
        )
      : null;

    if (!videoAsset) {
      throw new BadRequestException('videoAssetId is required for cities launch');
    }

    const launchProgress = {
      processedCities: 0,
      lastSuccessfulCityId: null as number | null,
      lastSuccessfulCityName: null as string | null,
      lastSuccessfulIndex: null as number | null,
      campaignId: null as number | null,
    };

    void this.runCitiesLaunch({
      testId: test.id,
      testName: test.name,
      accountIntegrationId: dto.accountIntegrationId,
      landingUrl: dto.landingUrl,
      startBudget: dto.startBudget,
      adTitleTemplate: dto.adTitle ?? null,
      adTextTemplate: dto.adText ?? null,
      sex: dto.sex ?? null,
      ageFrom: dto.ageFrom ?? null,
      ageTo: dto.ageTo ?? null,
      videoAsset: {
        id: videoAsset.id,
        vkContentId: videoAsset.vkContentId,
        width: videoAsset.width ?? undefined,
        height: videoAsset.height ?? undefined,
      },
      cities,
      progress: launchProgress,
    }).catch((error: unknown) => {
      this.logger.error(
        JSON.stringify({
          scope: 'vk-ads-test-cities-launch',
          event: 'launch.failed',
          testId: test.id,
          processedCities: launchProgress.processedCities,
          lastSuccessfulCityId: launchProgress.lastSuccessfulCityId,
          lastSuccessfulCityName: launchProgress.lastSuccessfulCityName,
          lastSuccessfulIndex: launchProgress.lastSuccessfulIndex,
          message: error instanceof Error ? error.message : String(error),
        }),
        error instanceof Error ? error.stack : String(error),
      );
      if (launchProgress.campaignId !== null) {
        this.runtimeStatusService.invalidateCache(
          dto.accountIntegrationId,
          launchProgress.campaignId,
        );
      }
    });

    const refreshedTest = await this.repository.getTestCard(test.id);

    return {
      test: refreshedTest,
      testId: test.id,
      launchState: 'launching',
      expectedCitiesCount: cities.length,
    };
  }

  private async runCitiesLaunch(params: {
    testId: number;
    testName: string;
    accountIntegrationId: number;
    landingUrl: string;
    startBudget: number;
    adTitleTemplate: string | null;
    adTextTemplate: string | null;
    sex: 'male' | 'female' | null;
    ageFrom: number | null;
    ageTo: number | null;
    videoAsset: {
      id: number;
      vkContentId: number;
      width?: number;
      height?: number;
    };
    cities: LaunchCityRecord[];
    progress: {
      processedCities: number;
      lastSuccessfulCityId: number | null;
      lastSuccessfulCityName: string | null;
      lastSuccessfulIndex: number | null;
      campaignId: number | null;
    };
  }) {
    const sharedUrl = await this.builder.prepareLandingUrl(
      params.accountIntegrationId,
      params.landingUrl,
      VK_ADS_TEST_PACKAGE_ID,
    );
    const bannerTemplate = await this.builder.prepareBannerTemplate(
      params.accountIntegrationId,
      VK_ADS_TEST_PACKAGE_ID,
    );

    const runtimeCityIds: Array<{
      cityId: number;
      audienceId: number;
      creativeId: number;
      adGroupId: number;
      bannerId: number;
      variantId: number;
    }> = [];

    let campaignId: number | null = null;
    const totalCities = params.cities.length;

    for (const [index, city] of params.cities.entries()) {
      const creativeCopy = this.buildCityCreativeCopy(city.label, params.adTitleTemplate, params.adTextTemplate);
      const targetings = this.buildAudienceTargetings([city.id], {
        sex: params.sex,
        ageFrom: params.ageFrom,
        ageTo: params.ageTo,
      });
      this.logger.warn(
        JSON.stringify({
          scope: 'vk-ads-test-cities-launch',
          event:
            index === 0
              ? 'createAdPlan.payload'
              : 'createAdGroup.payload',
          cityId: city.id,
          cityName: city.label,
          targetings,
        }),
      );

      if (index > 0 && index % 25 === 0) {
        this.logger.log(
          JSON.stringify({
            scope: 'vk-ads-test-cities-launch',
            event: 'progress',
            testId: params.testId,
            processed: index,
            total: totalCities,
            percent: Math.round((index / totalCities) * 100),
          }),
        );
      }

      const creative = await this.repository.createCreative({
        test: { connect: { id: params.testId } },
        name: creativeCopy.title,
        title: creativeCopy.title,
        text: creativeCopy.text,
        status: 'active',
        videoAssetId: params.videoAsset.id,
        vkContentId: String(params.videoAsset.vkContentId),
      });

      const audience = await this.repository.createAudience({
        test: { connect: { id: params.testId } },
        name: city.label,
        status: 'active',
        runtimePauseReason: 'paused_by_test',
        geoJson: [city.id] as Prisma.InputJsonValue,
        sex: params.sex ?? undefined,
        ageFrom: params.ageFrom ?? undefined,
        ageTo: params.ageTo ?? undefined,
      });

      const cityRef = this.buildCityRef({
        testId: params.testId,
        cityId: city.id,
        audienceId: audience.id,
        creativeId: creative.id,
      });

      let adGroupId: number;
      let bannerId: number;
      if (index === 0) {
        const adPlan = await this.client.createAdPlan(
          params.accountIntegrationId,
          this.buildCampaignPayload({
            campaignName: params.testName,
            packageId: VK_ADS_TEST_PACKAGE_ID,
            budgetDay: params.startBudget,
            ref: cityRef,
            targetings,
            adGroupName: city.label,
          }),
          sharedUrl.id,
        );

        campaignId = this.requireNumber(
          adPlan.id,
          'VK Ads createAdPlan response does not contain numeric id',
        );
        params.progress.campaignId = campaignId;
        adGroupId = this.requireNumber(
          adPlan.ad_groups?.[0]?.id,
          'VK Ads createAdPlan response does not contain numeric ad_groups[0].id',
        );

        await this.repository.updateTestRuntimeIds(params.testId, {
          vkCampaignId: campaignId,
          vkPrimaryUrlId: sharedUrl.id,
        });
        await this.repository.updateAudienceRuntimeIds(audience.id, {
          vkAdGroupId: adGroupId,
        });

        await this.throttle(
          CITIES_AD_GROUP_THROTTLE_MIN_MS,
          CITIES_AD_GROUP_THROTTLE_MAX_MS,
        );

        this.logger.debug(
          JSON.stringify({
            scope: 'vk-ads-test-cities-launch',
            event: 'createBanner.before',
            testId: params.testId,
            cityIndex: index,
            cityId: city.id,
            cityName: city.label,
            vkAdGroupId: adGroupId,
          }),
        );

        let banner: number;
        try {
          banner = await this.builder.createBannerFromResolvedTemplate({
            integrationId: params.accountIntegrationId,
            adGroupId,
            name: creativeCopy.title,
            primaryUrlId: sharedUrl.id,
            template: bannerTemplate,
            creative: {
              name: creativeCopy.title,
              title: creativeCopy.title,
              text: creativeCopy.text,
              videoAssetId: params.videoAsset.id,
              videoAssetVkContentId: params.videoAsset.vkContentId,
              videoAssetWidth: params.videoAsset.width ?? undefined,
              videoAssetHeight: params.videoAsset.height ?? undefined,
            },
          });
        } catch (error: unknown) {
          this.logCitiesVkError({
            event: 'createBanner.error',
            testId: params.testId,
            cityIndex: index,
            totalCities,
            cityId: city.id,
            cityName: city.label,
            campaignId,
            error,
          });
          throw error;
        }

        this.logger.log(
          JSON.stringify({
            scope: 'vk-ads-test-cities-launch',
            event: 'createBanner.ok',
            testId: params.testId,
            cityIndex: index,
            cityId: city.id,
            cityName: city.label,
            vkBannerId: banner,
            vkAdGroupId: adGroupId,
          }),
        );
        bannerId = banner;
      } else {
        if (campaignId === null) {
          throw new Error('VK Ads campaign was not initialized for cities launch');
        }

        const bannerPayload =
          this.builder.buildBannerPayloadFromResolvedTemplate({
            name: creativeCopy.title,
            primaryUrlId: sharedUrl.id,
            template: bannerTemplate,
            creative: {
              name: creativeCopy.title,
              title: creativeCopy.title,
              text: creativeCopy.text,
              videoAssetId: params.videoAsset.id,
              videoAssetVkContentId: params.videoAsset.vkContentId,
              videoAssetWidth: params.videoAsset.width ?? undefined,
              videoAssetHeight: params.videoAsset.height ?? undefined,
            },
          });

        await this.throttle(
          CITIES_AD_GROUP_THROTTLE_MIN_MS,
          CITIES_AD_GROUP_THROTTLE_MAX_MS,
        );

        this.logger.debug(
          JSON.stringify({
            scope: 'vk-ads-test-cities-launch',
            event: 'createAdGroup.before',
            testId: params.testId,
            cityIndex: index,
            totalCities,
            cityId: city.id,
            cityName: city.label,
            campaignId,
          }),
        );

        let adGroup: Awaited<ReturnType<typeof this.client.createAdGroup>>;
        try {
          adGroup = await this.client.createAdGroup(
            params.accountIntegrationId,
            this.buildAdGroupPayload({
              adPlanId: campaignId,
              packageId: VK_ADS_TEST_PACKAGE_ID,
              budgetDay: params.startBudget,
              cityName: city.label,
              ref: cityRef,
              bannerPayload,
              targetings,
            }),
          );
        } catch (error: unknown) {
          this.logCitiesVkError({
            event: 'createAdGroup.error',
            testId: params.testId,
            cityIndex: index,
            totalCities,
            cityId: city.id,
            cityName: city.label,
            campaignId,
            error,
          });
          throw error;
        }

        adGroupId = this.requireNumber(
          adGroup.id,
          'VK Ads createAdGroup response does not contain numeric id',
        );

        bannerId = this.requireNumber(
          adGroup.banners?.[0]?.id,
          'VK Ads createAdGroup response does not contain numeric banners[0].id',
        );

        this.logger.log(
          JSON.stringify({
            scope: 'vk-ads-test-cities-launch',
            event: 'createAdGroup.ok',
            testId: params.testId,
            cityIndex: index,
            cityId: city.id,
            cityName: city.label,
            vkAdGroupId: adGroupId,
          }),
        );
        this.logger.log(
          JSON.stringify({
            scope: 'vk-ads-test-cities-launch',
            event: 'createBanner.ok',
            testId: params.testId,
            cityIndex: index,
            cityId: city.id,
            cityName: city.label,
            vkBannerId: bannerId,
            vkAdGroupId: adGroupId,
          }),
        );

        await this.repository.updateAudienceRuntimeIds(audience.id, {
          vkAdGroupId: adGroupId,
        });
      }

      const variant = await this.repository.createVariant({
        test: { connect: { id: params.testId } },
        audience: { connect: { id: audience.id } },
        creative: { connect: { id: creative.id } },
        variantKey: cityRef,
        status: 'active',
        runtimePauseReason: 'paused_by_test',
        budgetLimitDay: params.startBudget,
        vkCampaignId: campaignId,
        vkAdGroupId: adGroupId,
        vkPrimaryUrlId: sharedUrl.id,
        launchDate: new Date(),
      });

      await this.repository.updateVariant(variant.id, {
        vkCampaignId: campaignId,
        vkAdGroupId: adGroupId,
        vkBannerId: bannerId,
        vkPrimaryUrlId: sharedUrl.id,
        ref: cityRef,
        launchDate: new Date(),
        status: 'active',
      });

      runtimeCityIds.push({
        cityId: city.id,
        audienceId: audience.id,
        creativeId: creative.id,
        adGroupId,
        bannerId,
        variantId: variant.id,
      });

      params.progress.processedCities = index + 1;
      params.progress.lastSuccessfulCityId = city.id;
      params.progress.lastSuccessfulCityName = city.label;
      params.progress.lastSuccessfulIndex = index;
    }

    if (campaignId !== null) {
      await this.repository.updateTestRuntimeIds(params.testId, {
        vkCampaignId: campaignId,
        vkPrimaryUrlId: sharedUrl.id,
      });
    }

    await this.repository.updateTest(params.testId, { status: 'active' });

    await this.repository.logAction({
      test: { connect: { id: params.testId } },
      action: 'cities_flow_ready',
      payloadJson: {
        cityCount: params.cities.length,
        campaignId,
        sharedUrlId: sharedUrl.id,
        cityIds: runtimeCityIds,
      },
    });

    if (campaignId !== null) {
      this.runtimeStatusService.invalidateCache(
        params.accountIntegrationId,
        campaignId,
      );
    }
  }

  private throttle(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  private logCitiesVkError(params: {
    event: string;
    testId: number;
    cityIndex: number;
    totalCities: number;
    cityId: number;
    cityName: string;
    campaignId: number | null;
    error: unknown;
  }): void {
    const isVkError = params.error instanceof VkAdsTestClientError;
    this.logger.error(
      JSON.stringify({
        scope: 'vk-ads-test-cities-launch',
        event: params.event,
        testId: params.testId,
        cityIndex: params.cityIndex,
        totalCities: params.totalCities,
        cityId: params.cityId,
        cityName: params.cityName,
        campaignId: params.campaignId,
        message: params.error instanceof Error ? params.error.message : String(params.error),
        ...(isVkError && {
          status: (params.error as VkAdsTestClientError).status,
          vkErrorCode: (params.error as VkAdsTestClientError).vkErrorCode,
          vkErrorMessage: (params.error as VkAdsTestClientError).vkErrorMessage,
          fieldErrors: (params.error as VkAdsTestClientError).fieldErrors,
          rawError: (params.error as VkAdsTestClientError).rawError,
        }),
      }),
      params.error instanceof Error ? params.error.stack : String(params.error),
    );
  }

  private buildCampaignPayload(params: {
    campaignName: string;
    packageId: number;
    budgetDay: number;
    ref: string;
    targetings: Record<string, unknown>;
    adGroupName: string;
  }): Record<string, unknown> {
    return {
      name: params.campaignName,
      status: 'blocked',
      objective: VK_ADS_TEST_OBJECTIVE,
      ad_groups: [
        {
          name: params.adGroupName,
          package_id: params.packageId,
          status: 'blocked',
          autobidding_mode: 'max_goals',
          budget_limit_day: params.budgetDay,
          enable_utm: true,
          utm: `ref=${encodeURIComponent(params.ref)}`,
          targetings: params.targetings,
          banners: [],
        },
      ],
    };
  }

  private buildAdGroupPayload(params: {
    adPlanId: number;
    packageId: number;
    budgetDay: number;
    cityName: string;
    ref: string;
    bannerPayload: Record<string, unknown>;
    targetings: Record<string, unknown>;
  }): Record<string, unknown> {
    return {
      ad_plan_id: params.adPlanId,
      name: params.cityName,
      package_id: params.packageId,
      status: 'blocked',
      autobidding_mode: 'max_goals',
      budget_limit_day: params.budgetDay,
      enable_utm: true,
      utm: `ref=${encodeURIComponent(params.ref)}`,
      targetings: params.targetings,
      banners: [params.bannerPayload],
    };
  }

  private buildCityRef(params: {
    testId: number;
    cityId: number;
    audienceId: number;
    creativeId: number;
  }): string {
    return `city_${params.cityId}_vat_${params.testId}_${params.audienceId}_${params.creativeId}`;
  }

  private buildAudienceTargetings(
    cityIds: number[],
    params?: {
      sex?: 'male' | 'female' | null;
      ageFrom?: number | null;
      ageTo?: number | null;
    },
  ): Record<string, unknown> {
    const targetings: Record<string, unknown> = {
      geo: {
        regions: cityIds.length ? [...cityIds] : [DEFAULT_RUSSIA_REGION_ID],
      },
      fulltime: {
        flags: ['cross_timezone', 'use_holidays_moving'],
        mon: this.buildHours(),
        tue: this.buildHours(),
        wed: this.buildHours(),
        thu: this.buildHours(),
        fri: this.buildHours(),
        sat: this.buildHours(),
        sun: this.buildHours(),
      },
      pads: [...VK_ADS_TEST_PADS],
    };

    if (params?.sex) {
      targetings.sex = [params.sex];
    }

    if (params?.ageFrom != null && params?.ageTo != null) {
      targetings.age = {
        age_list: this.buildAgeList(params.ageFrom, params.ageTo),
      };
    }

    return targetings;
  }

  private buildHours() {
    return Array.from({ length: 24 }, (_, hour) => hour);
  }

  private buildAgeList(ageFrom: number, ageTo: number): number[] {
    if (ageFrom > ageTo) {
      throw new BadRequestException(
        'ageFrom must be less than or equal to ageTo',
      );
    }

    const result: number[] = [];
    for (let age = ageFrom; age <= ageTo; age += 1) {
      result.push(age);
    }

    return result;
  }

  private buildCityCreativeCopy(cityName: string, titleTemplate: string | null, textTemplate: string | null) {
    const label = cityName.trim();
    const applyTemplate = (template: string | null) =>
      (template ?? '').replace(/\$\{city\}/g, label);

    return {
      title: applyTemplate(titleTemplate),
      text: applyTemplate(textTemplate),
    };
  }

  private normalizeLaunchCities(cities: LaunchCityRecord[]) {
    const uniqueCities = new Map<number, LaunchCityRecord>();

    for (const city of cities ?? []) {
      if (!Number.isInteger(city.id) || city.id <= 0) {
        continue;
      }

      const label = city.label.trim();
      if (!label) {
        continue;
      }

      if (!uniqueCities.has(city.id)) {
        uniqueCities.set(city.id, { id: city.id, label });
      }
    }

    return Array.from(uniqueCities.values());
  }

  private requireNumber(value: unknown, message: string): number {
    const parsed =
      typeof value === 'number' && Number.isFinite(value)
        ? value
        : typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : NaN;

    if (!Number.isFinite(parsed)) {
      throw new Error(message);
    }

    return parsed;
  }
}
