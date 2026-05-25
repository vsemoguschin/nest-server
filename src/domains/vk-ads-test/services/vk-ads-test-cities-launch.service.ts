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
import {
  VkAdsCitiesBannerDiagnostics,
  VkAdsTestBuildError,
  VkAdsTestBuilderService,
} from './vk-ads-test-builder.service';
import { VkAdsTestVideoAssetsService } from './vk-ads-test-video-assets.service';

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
  ) {}

  async launchCities(dto: LaunchCitiesDto) {
    this.logger.log(
      JSON.stringify({
        scope: 'vk-ads-test-cities-launch',
        event: 'launchCities.enter',
        accountIntegrationId: dto.accountIntegrationId,
        testId: dto.testId ?? null,
        citiesCount: dto.cities?.length ?? 0,
        videoAssetId: dto.videoAssetId ?? null,
      }),
    );

    const cities = this.normalizeLaunchCities(dto.cities);
    if (!cities.length) {
      throw new BadRequestException('At least one city is required');
    }

    if (!dto.videoAssetId) {
      throw new BadRequestException('videoAssetId is required for cities launch');
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

    this.logger.log(
      JSON.stringify({
        scope: 'vk-ads-test-cities-launch',
        event: 'test.created',
        testId: test.id,
        reused: existingTest !== null,
      }),
    );

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

    const launchProgress = {
      processedCities: 0,
      lastSuccessfulCityId: null as number | null,
      lastSuccessfulCityName: null as string | null,
      lastSuccessfulIndex: null as number | null,
      campaignId: null as number | null,
    };

    this.logger.log(
      JSON.stringify({
        scope: 'vk-ads-test-cities-launch',
        event: 'async.runCitiesLaunch.scheduled',
        testId: test.id,
      }),
    );

    void this.runCitiesLaunch({
      testId: test.id,
      testName: test.name,
      accountIntegrationId: dto.accountIntegrationId,
      landingUrl: dto.landingUrl,
      startBudget: dto.startBudget,
      videoAssetId: dto.videoAssetId,
      adTitleTemplate: dto.adTitle ?? null,
      adTextTemplate: dto.adText ?? null,
      sex: dto.sex ?? null,
      ageFrom: dto.ageFrom ?? null,
      ageTo: dto.ageTo ?? null,
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
    videoAssetId: number;
    adTitleTemplate: string | null;
    adTextTemplate: string | null;
    sex: 'male' | 'female' | null;
    ageFrom: number | null;
    ageTo: number | null;
    cities: LaunchCityRecord[];
    progress: {
      processedCities: number;
      lastSuccessfulCityId: number | null;
      lastSuccessfulCityName: string | null;
      lastSuccessfulIndex: number | null;
      campaignId: number | null;
    };
  }) {
    this.logger.log(
      JSON.stringify({
        scope: 'vk-ads-test-cities-launch',
        event: 'runCitiesLaunch.enter',
        testId: params.testId,
        citiesCount: params.cities.length,
        videoAssetId: params.videoAssetId,
      }),
    );

    const videoAsset = await this.videoAssetsService.ensureVideoAssetForCreative(
      params.testId,
      params.videoAssetId,
    );

    this.logger.log(
      JSON.stringify({
        scope: 'vk-ads-test-cities-launch',
        event: 'videoAsset.resolved.detail',
        testId: params.testId,
        videoAssetId: videoAsset.id,
        vkContentId: videoAsset.vkContentId,
        durationSec: videoAsset.durationSec ?? null,
        width: videoAsset.width ?? null,
        height: videoAsset.height ?? null,
        aspectRatio: this.formatAspectRatio(
          videoAsset.width ?? null,
          videoAsset.height ?? null,
        ),
        status: videoAsset.status,
        originalFilename: videoAsset.name ?? null,
        belongsToTestId: videoAsset.testId ?? null,
        expectedTestId: params.testId,
        isSameTest: videoAsset.testId === params.testId,
      }),
    );

    this.logger.log(
      JSON.stringify({
        scope: 'vk-ads-test-cities-launch',
        event: 'prepareLandingUrl.start',
        testId: params.testId,
        accountIntegrationId: params.accountIntegrationId,
        landingUrl: params.landingUrl,
      }),
    );
    let sharedUrl: Awaited<ReturnType<typeof this.builder.prepareLandingUrl>>;
    try {
      sharedUrl = await this.builder.prepareLandingUrl(
        params.accountIntegrationId,
        params.landingUrl,
        VK_ADS_TEST_PACKAGE_ID,
      );
    } catch (error: unknown) {
      this.logStepError('prepareLandingUrl.error', params.testId, params.accountIntegrationId, error);
      throw error;
    }
    this.logger.log(
      JSON.stringify({
        scope: 'vk-ads-test-cities-launch',
        event: 'prepareLandingUrl.ok',
        testId: params.testId,
        urlId: sharedUrl.id,
      }),
    );

    this.logger.log(
      JSON.stringify({
        scope: 'vk-ads-test-cities-launch',
        event: 'prepareBannerTemplate.start',
        testId: params.testId,
        accountIntegrationId: params.accountIntegrationId,
      }),
    );
    let bannerTemplate: Awaited<ReturnType<typeof this.builder.prepareBannerTemplate>>;
    try {
      bannerTemplate = await this.builder.prepareBannerTemplate(
        params.accountIntegrationId,
        VK_ADS_TEST_PACKAGE_ID,
      );
    } catch (error: unknown) {
      this.logStepError('prepareBannerTemplate.error', params.testId, params.accountIntegrationId, error);
      throw error;
    }
    this.logger.log(
      JSON.stringify({
        scope: 'vk-ads-test-cities-launch',
        event: 'prepareBannerTemplate.ok',
        testId: params.testId,
        adGroupId: bannerTemplate.adGroupId,
        bannerId: bannerTemplate.bannerId,
      }),
    );

    const templateDiagnostics = this.builder.describeCitiesBannerDiagnostics({
      template: bannerTemplate,
      testId: params.testId,
      accountIntegrationId: params.accountIntegrationId,
      packageId: VK_ADS_TEST_PACKAGE_ID,
    });

    this.logger.log(
      JSON.stringify({
        scope: 'vk-ads-test-cities-launch',
        event: 'prepareBannerTemplate.detail',
        testId: params.testId,
        accountIntegrationId: params.accountIntegrationId,
        packageId: VK_ADS_TEST_PACKAGE_ID,
        templateBannerId: templateDiagnostics.templateBannerId,
        templateContentKeys: templateDiagnostics.templateContentKeys,
        templateTextblockKeys: templateDiagnostics.templateTextblockKeys,
        templateUrlKeys: templateDiagnostics.templateUrlKeys,
        templatePatternIds: templateDiagnostics.templatePatternIds,
        templateVideoSlots: templateDiagnostics.templateVideoSlots,
        templateImageSlots: templateDiagnostics.templateImageSlots,
      }),
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
      const bannerDiagnostics: VkAdsCitiesBannerDiagnostics =
        this.builder.describeCitiesBannerDiagnostics({
          template: bannerTemplate,
          creative: {
            name: creativeCopy.title,
            title: creativeCopy.title,
            text: creativeCopy.text,
            videoAssetId: videoAsset.id,
            videoAssetVkContentId: videoAsset.vkContentId,
            videoAssetWidth: videoAsset.width ?? undefined,
            videoAssetHeight: videoAsset.height ?? undefined,
          },
          testId: params.testId,
          accountIntegrationId: params.accountIntegrationId,
          cityIndex: index,
          cityId: city.id,
          cityName: city.label,
          packageId: VK_ADS_TEST_PACKAGE_ID,
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
      this.logger.log(
        JSON.stringify({
          scope: 'vk-ads-test-cities-launch',
          event: 'videoSlot.resolve',
          testId: params.testId,
          cityIndex: index,
          cityId: city.id,
          cityName: city.label,
          packageId: VK_ADS_TEST_PACKAGE_ID,
          templateBannerId: bannerDiagnostics.templateBannerId,
          candidateVideoSlots: bannerDiagnostics.candidateVideoSlots,
          candidateSlotsWithExistingTemplateContent:
            bannerDiagnostics.candidateSlotsWithExistingTemplateContent,
          resolvedSlot: bannerDiagnostics.resolvedSlot,
          finalContentVideoId: bannerDiagnostics.finalContentVideoId,
          templateVideoId: bannerDiagnostics.templateVideoId,
          selectedVideoContentId: bannerDiagnostics.selectedVideoContentId,
          reason: bannerDiagnostics.reason,
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
        videoAssetId: videoAsset.id,
        vkContentId: String(videoAsset.vkContentId),
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
        this.logger.log(
          JSON.stringify({
            scope: 'vk-ads-test-cities-launch',
            event: 'createAdPlan.start',
            testId: params.testId,
            accountIntegrationId: params.accountIntegrationId,
            cityId: city.id,
            cityName: city.label,
          }),
        );
        let adPlan: Awaited<ReturnType<typeof this.client.createAdPlan>>;
        try {
          adPlan = await this.client.createAdPlan(
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
        } catch (error: unknown) {
          this.logStepError('createAdPlan.error', params.testId, params.accountIntegrationId, error);
          throw error;
        }
        this.logger.log(
          JSON.stringify({
            scope: 'vk-ads-test-cities-launch',
            event: 'createAdPlan.ok',
            testId: params.testId,
            vkCampaignId: adPlan.id,
          }),
        );

        campaignId = this.requireNumber(
          adPlan.id,
          'VK Ads createAdPlan response does not contain numeric id',
        );
        params.progress.campaignId = campaignId;
        this.logger.warn(
          JSON.stringify({
            scope: 'vk-ads-test-cities-launch',
            event: 'cities.createAdPlan.normalized',
            testId: params.testId,
            vkCampaignId: adPlan.id,
            adGroupsCount: adPlan.ad_groups?.length ?? 0,
            adGroups: adPlan.ad_groups,
          }),
        );

        adGroupId = this.requireNumber(
          adPlan.ad_groups?.[0]?.id,
          'VK Ads createAdPlan response does not contain numeric ad_groups[0].id',
        );

        this.logger.log(
          JSON.stringify({
            scope: 'vk-ads-test-cities-launch',
            event: 'createBanner.payload.detail',
            testId: params.testId,
            cityIndex: index,
            cityId: city.id,
            cityName: city.label,
            packageId: VK_ADS_TEST_PACKAGE_ID,
            templateBannerId: bannerDiagnostics.templateBannerId,
            vkAdGroupId: adGroupId,
            contentKeys: bannerDiagnostics.contentKeys,
            urlKeys: bannerDiagnostics.urlKeys,
            textblockKeys: bannerDiagnostics.textblockKeys,
            hasVideoContent: bannerDiagnostics.hasVideoContent,
            videoContentKeys: bannerDiagnostics.videoContentKeys,
            selectedVideoContentId: bannerDiagnostics.selectedVideoContentId,
            resolvedSlot: bannerDiagnostics.resolvedSlot,
            finalContentVideoId: bannerDiagnostics.finalContentVideoId,
            payloadPatternCompatibilityHint:
              bannerDiagnostics.payloadPatternCompatibilityHint,
          }),
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
              videoAssetId: videoAsset.id,
              videoAssetVkContentId: videoAsset.vkContentId,
              videoAssetWidth: videoAsset.width ?? undefined,
              videoAssetHeight: videoAsset.height ?? undefined,
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
            packageId: VK_ADS_TEST_PACKAGE_ID,
            templateBannerId: bannerDiagnostics.templateBannerId,
            contentKeys: bannerDiagnostics.contentKeys,
            textblockKeys: bannerDiagnostics.textblockKeys,
            urlKeys: bannerDiagnostics.urlKeys,
            selectedVideoContentId: bannerDiagnostics.selectedVideoContentId,
            resolvedSlot: bannerDiagnostics.resolvedSlot,
            finalContentVideoId: bannerDiagnostics.finalContentVideoId,
            candidateVideoSlots: bannerDiagnostics.candidateVideoSlots,
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
              videoAssetId: videoAsset.id,
              videoAssetVkContentId: videoAsset.vkContentId,
              videoAssetWidth: videoAsset.width ?? undefined,
              videoAssetHeight: videoAsset.height ?? undefined,
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

        this.logger.warn(
          JSON.stringify({
            scope: 'vk-ads-test-cities-launch',
            event: 'cities.createAdGroup.response',
            testId: params.testId,
            cityIndex: index,
            adGroupId: adGroup.id,
            bannersCount: (adGroup.banners as unknown[] | undefined)?.length ?? 0,
            banners: adGroup.banners,
          }),
        );

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
            event: 'createBanner.payload.detail',
            testId: params.testId,
            cityIndex: index,
            cityId: city.id,
            cityName: city.label,
            packageId: VK_ADS_TEST_PACKAGE_ID,
            templateBannerId: bannerDiagnostics.templateBannerId,
            vkAdGroupId: adGroupId,
            contentKeys: bannerDiagnostics.contentKeys,
            urlKeys: bannerDiagnostics.urlKeys,
            textblockKeys: bannerDiagnostics.textblockKeys,
            hasVideoContent: bannerDiagnostics.hasVideoContent,
            videoContentKeys: bannerDiagnostics.videoContentKeys,
            selectedVideoContentId: bannerDiagnostics.selectedVideoContentId,
            resolvedSlot: bannerDiagnostics.resolvedSlot,
            finalContentVideoId: bannerDiagnostics.finalContentVideoId,
            payloadPatternCompatibilityHint:
              bannerDiagnostics.payloadPatternCompatibilityHint,
          }),
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

  }

  private throttle(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  private logStepError(event: string, testId: number, accountIntegrationId: number, error: unknown): void {
    const isVkError = error instanceof VkAdsTestClientError;
    this.logger.error(
      JSON.stringify({
        scope: 'vk-ads-test-cities-launch',
        event,
        testId,
        accountIntegrationId,
        message: error instanceof Error ? error.message : String(error),
        ...(isVkError && {
          status: (error as VkAdsTestClientError).status,
          vkErrorCode: (error as VkAdsTestClientError).vkErrorCode,
          vkErrorMessage: (error as VkAdsTestClientError).vkErrorMessage,
          fieldErrors: (error as VkAdsTestClientError).fieldErrors,
          rawError: (error as VkAdsTestClientError).rawError,
        }),
      }),
      error instanceof Error ? error.stack : String(error),
    );
  }

  private logCitiesVkError(params: {
    event: string;
    testId: number;
    cityIndex: number;
    totalCities: number;
    cityId: number;
    cityName: string;
    campaignId: number | null;
    packageId?: number;
    templateBannerId?: number | null;
    contentKeys?: string[];
    textblockKeys?: string[];
    urlKeys?: string[];
    selectedVideoContentId?: number | null;
    resolvedSlot?: string | null;
    finalContentVideoId?: number | null;
    candidateVideoSlots?: string[];
    error: unknown;
  }): void {
    const isClientError = params.error instanceof VkAdsTestClientError;
    const isBuildError = params.error instanceof VkAdsTestBuildError;
    const clientError = isClientError
      ? (params.error as VkAdsTestClientError)
      : null;
    const buildError = isBuildError
      ? (params.error as VkAdsTestBuildError)
      : null;
    const fieldErrors = buildError?.fieldErrors ?? clientError?.fieldErrors;
    const rawError = buildError?.vkErrorBody ?? clientError?.rawError;
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
        packageId: params.packageId ?? null,
        templateBannerId: params.templateBannerId ?? null,
        contentKeys: params.contentKeys ?? [],
        textblockKeys: params.textblockKeys ?? [],
        urlKeys: params.urlKeys ?? [],
        selectedVideoContentId: params.selectedVideoContentId ?? null,
        resolvedSlot: params.resolvedSlot ?? null,
        finalContentVideoId: params.finalContentVideoId ?? null,
        candidateVideoSlots: params.candidateVideoSlots ?? [],
        message: params.error instanceof Error ? params.error.message : String(params.error),
        ...((isBuildError || isClientError) && {
          status: buildError?.status ?? clientError?.status,
          vkErrorCode: buildError?.vkErrorCode ?? clientError?.vkErrorCode,
          vkErrorMessage:
            buildError?.vkErrorMessage ?? clientError?.vkErrorMessage,
          fieldErrors,
          rawError,
        }),
      }),
      params.error instanceof Error ? params.error.stack : String(params.error),
    );
  }

  private formatAspectRatio(
    width: number | null,
    height: number | null,
  ): string | null {
    if (!width || !height) {
      return null;
    }

    return `${width}:${height}`;
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
