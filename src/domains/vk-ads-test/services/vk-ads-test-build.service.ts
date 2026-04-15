import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BuildTestDto } from '../dto/build-test.dto';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';
import { VkAdsTestPlacementPlannerService } from './vk-ads-test-placement-planner.service';
import {
  VkAdsTestBuilderService,
  VkAdsTestBuildOneVariantInput,
  VkAdsTestBuildError,
} from './vk-ads-test-builder.service';
import { VkAdsTestClientError } from '../clients/vk-ads-test.client';

type BuildResultStatus = 'succeeded' | 'failed' | 'skipped';

type BuildVariantResult = {
  variantId: number;
  status: BuildResultStatus;
  vkCampaignId?: number;
  vkAdGroupId?: number;
  vkBannerId?: number;
  vkPrimaryUrlId?: number;
  errorMessage?: string;
};

type BuildTestReport = {
  testId: number;
  totalRequested: number;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: BuildVariantResult[];
};

type BuildTest = NonNullable<
  Awaited<ReturnType<VkAdsTestRepository['getTestForBuild']>>
>;
type BuildPlacement = Awaited<
  ReturnType<VkAdsTestPlacementPlannerService['planPlacements']>
>[number];

const DEFAULT_URL_CHECK_TIMEOUT_MS = 120_000;
const DEFAULT_URL_CHECK_INTERVAL_MS = 5_000;
const DEFAULT_RUSSIA_REGION_ID = 188;
const VK_ADS_TEST_PADS = [1265106, 2243453];

@Injectable()
export class VkAdsTestBuildService {
  constructor(
    private readonly repository: VkAdsTestRepository,
    private readonly planner: VkAdsTestPlacementPlannerService,
    private readonly builder: VkAdsTestBuilderService,
  ) {}

  async buildTest(
    testId: number,
    dto: BuildTestDto = {},
  ): Promise<BuildTestReport> {
    const test = await this.repository.getTestForBuild(testId);

    if (!test) {
      throw new NotFoundException(`VK Ads test not found: id=${testId}`);
    }

    if (!test.landingUrl) {
      throw new BadRequestException(
        'VK Ads test landingUrl is required for build',
      );
    }

    const testRuntimeIds = await this.repository.findTestRuntimeIds(test.id);
    const placements = await this.planner.planPlacements(test, dto.variantIds);
    const groupedPlacements = this.groupPlacementsByAudience(placements);
    const results: BuildVariantResult[] = [];
    let campaignId =
      testRuntimeIds?.vkCampaignId ??
      placements.find((placement) => placement.variant.vkCampaignId)?.variant
        .vkCampaignId ??
      null;
    let primaryUrlId: number | null = testRuntimeIds?.vkPrimaryUrlId ?? null;

    for (const [, audiencePlacements] of groupedPlacements) {
      const firstPlacement = audiencePlacements[0];
      let audienceAdGroupId =
        firstPlacement.audience.vkAdGroupId ??
        firstPlacement.variant.vkAdGroupId ??
        null;

      if (campaignId === null) {
        campaignId = firstPlacement.variant.vkCampaignId ?? null;
      }

      for (const placement of audiencePlacements) {
        const skipReason = this.getSkipReason(placement, dto);
        if (skipReason) {
          results.push({
            variantId: placement.variant.id,
            status: 'skipped',
            errorMessage: skipReason,
          });
          continue;
        }

        await this.markBuildStarted(test.id, placement.variant.id);

        try {
          const buildResult = await this.builder.buildPlacement(
            this.toBuilderInput(test, placement, {
              campaignId,
              adGroupId: audienceAdGroupId,
            }),
          );
          const vkIds = buildResult.vkIds;
          const launchDate = new Date();
          const campaignWasMissing = campaignId === null;
          const adGroupWasMissing = audienceAdGroupId === null;
          const variantRef = this.buildVariantRef(
            test.id,
            placement.audienceId,
            placement.creativeId,
          );

          campaignId = campaignId ?? vkIds.campaignId;
          audienceAdGroupId = audienceAdGroupId ?? vkIds.adGroupId;

          await this.repository.transaction(async (tx) => {
            if (campaignWasMissing) {
              await this.repository.updateTestRuntimeIds(
                test.id,
                {
                  vkCampaignId: vkIds.campaignId,
                },
                tx,
              );
            }

            if (adGroupWasMissing) {
              await this.repository.updateAudienceRuntimeIds(
                placement.audienceId,
                {
                  vkAdGroupId: vkIds.adGroupId,
                },
                tx,
              );
            }

            await this.repository.updateVariant(
              placement.variant.id,
              {
                vkCampaignId: vkIds.campaignId,
                vkAdGroupId: vkIds.adGroupId,
                vkBannerId: vkIds.bannerId,
                vkPrimaryUrlId: vkIds.urlId,
                ref: variantRef,
                launchDate,
                status: 'active',
              },
              tx,
            );

            await this.repository.logAction(
              {
                test: { connect: { id: test.id } },
                variant: { connect: { id: placement.variant.id } },
                action: 'variant_build_succeeded',
                payloadJson: {
                  vkCampaignId: vkIds.campaignId,
                  vkAdGroupId: vkIds.adGroupId,
                  vkBannerId: vkIds.bannerId,
                  vkPrimaryUrlId: vkIds.urlId,
                  ref: variantRef,
                },
              },
              tx,
            );

            if (primaryUrlId === null) {
              primaryUrlId = vkIds.urlId;
              await this.repository.updateTestRuntimeIds(
                test.id,
                {
                  vkPrimaryUrlId: primaryUrlId,
                },
                tx,
              );
            }
          });

          results.push({
            variantId: placement.variant.id,
            status: 'succeeded',
            vkCampaignId: vkIds.campaignId,
            vkAdGroupId: vkIds.adGroupId,
            vkBannerId: vkIds.bannerId,
            vkPrimaryUrlId: vkIds.urlId,
          });
        } catch (error) {
          const errorMessage = this.toShortErrorMessage(error);
          const errorLogPayload = this.buildErrorLogPayload(
            errorMessage,
            error,
          );

          await this.repository.updateVariant(placement.variant.id, {
            status: 'error',
          });

          await this.repository.logAction({
            test: { connect: { id: test.id } },
            variant: { connect: { id: placement.variant.id } },
            action: 'variant_build_failed',
            payloadJson: errorLogPayload,
          });

          results.push({
            variantId: placement.variant.id,
            status: 'failed',
            errorMessage,
          });
        }
      }
    }

    const report = this.toReport(test.id, placements.length, results);
    await this.finalizeTestBuild(test.id, report);

    return report;
  }

  private getSkipReason(
    placement: BuildPlacement,
    dto: BuildTestDto,
  ): string | null {
    if (placement.creative.status === 'archived') {
      return 'creative_archived';
    }

    if (placement.audience.status === 'archived') {
      return 'audience_archived';
    }

    if (placement.variant.status === 'error' && dto.rebuildErrors !== true) {
      return 'variant_error_rebuild_not_enabled';
    }

    if (!['draft', 'ready', 'error'].includes(placement.variant.status)) {
      return `variant_status_not_buildable:${placement.variant.status}`;
    }

    if (placement.variant.status === 'error' && dto.rebuildErrors === true) {
      return null;
    }

    if (placement.variant.vkBannerId) {
      return 'variant_already_has_vk_banner_id';
    }

    return null;
  }

  private groupPlacementsByAudience(placements: BuildPlacement[]) {
    const grouped = new Map<number, BuildPlacement[]>();

    for (const placement of placements.sort((a, b) => {
      if (a.audienceId !== b.audienceId) {
        return a.audienceId - b.audienceId;
      }

      return a.creativeId - b.creativeId;
    })) {
      const items = grouped.get(placement.audienceId) || [];
      items.push(placement);
      grouped.set(placement.audienceId, items);
    }

    return grouped;
  }

  private async markBuildStarted(testId: number, variantId: number) {
    await this.repository.updateVariant(variantId, {
      status: 'building',
    });

    await this.repository.logAction({
      test: { connect: { id: testId } },
      variant: { connect: { id: variantId } },
      action: 'variant_build_started',
      payloadJson: {
        variantId,
      },
    });
  }

  private toBuilderInput(
    test: BuildTest,
    placement: BuildPlacement,
    existingRuntimeIds: {
      campaignId: number | null;
      adGroupId: number | null;
    },
  ): VkAdsTestBuildOneVariantInput {
    const audience = placement.audience as typeof placement.audience & {
      vkSegmentId?: number | null;
      includeSegmentIds?: unknown;
      excludeSegmentIds?: unknown;
    };
    const includeSegmentIds = this.normalizeSegmentIds(
      audience.includeSegmentIds,
    );
    const excludeSegmentIds = this.normalizeSegmentIds(
      audience.excludeSegmentIds,
    );
    const legacySegmentId = audience.vkSegmentId ?? null;
    const segmentIds =
      includeSegmentIds.length || excludeSegmentIds.length
        ? [
            ...includeSegmentIds,
            ...excludeSegmentIds.map((id) => -Math.abs(id)),
          ]
        : legacySegmentId !== null
          ? [legacySegmentId]
          : [];

    return {
      integrationId: test.accountIntegrationId,
      accountId: test.accountIntegration.accountId,
      testName: test.name,
      packageId: test.packageId,
      landingUrl: test.landingUrl as string,
      campaignName: `${test.name} ${placement.variant.variantKey}`,
      adGroupName: `${placement.audience.name} ${placement.variant.variantKey}`,
      bannerName: `${placement.creative.name} ${placement.variant.variantKey}`,
      objective: test.objective,
      budgetDay: this.decimalToString(
        placement.variant.budgetLimitDay ?? test.startBudget,
      ),
      urlCheckTimeoutMs: DEFAULT_URL_CHECK_TIMEOUT_MS,
      urlCheckIntervalMs: DEFAULT_URL_CHECK_INTERVAL_MS,
      ref: this.buildVariantRef(
        test.id,
        placement.audienceId,
        placement.creativeId,
      ),
      audience: {
        name: placement.audience.name,
        vkSegmentId: legacySegmentId ?? undefined,
        includeSegmentIds: includeSegmentIds.length
          ? includeSegmentIds
          : undefined,
        excludeSegmentIds: excludeSegmentIds.length
          ? excludeSegmentIds
          : undefined,
        vkTargetings: this.buildAudienceTargetings({
          segments: segmentIds,
          sex: placement.audience.sex ?? undefined,
          ageFrom: placement.audience.ageFrom ?? undefined,
          ageTo: placement.audience.ageTo ?? undefined,
          geoJson: (placement.audience.geoJson ??
            null) as Prisma.InputJsonValue | null,
          interestsJson: (placement.audience.interestsJson ??
            null) as Prisma.InputJsonValue | null,
        }),
      },
      creative: {
        name: placement.creative.name,
        title: placement.creative.title,
        text: placement.creative.text,
        vkContentId: placement.creative.vkContentId ?? undefined,
        videoAssetId: placement.creative.videoAssetId ?? undefined,
        videoAssetVkContentId:
          placement.creative.videoAsset?.vkContentId ?? undefined,
        videoAssetWidth: placement.creative.videoAsset?.width ?? undefined,
        videoAssetHeight: placement.creative.videoAsset?.height ?? undefined,
      },
      persistResult: false,
      existingIds: {
        testId: test.id,
        audienceId: placement.audienceId,
        creativeId: placement.creativeId,
        variantId: placement.variant.id,
        variantKey: placement.variant.variantKey,
        ...(existingRuntimeIds.campaignId !== null
          ? { campaignId: existingRuntimeIds.campaignId }
          : {}),
        ...(existingRuntimeIds.adGroupId !== null
          ? { adGroupId: existingRuntimeIds.adGroupId }
          : {}),
      },
    };
  }

  private buildVariantRef(
    testId: number,
    audienceId: number,
    creativeId: number,
  ): string {
    return `vat_${testId}_${audienceId}_${creativeId}`;
  }

  private buildAudienceTargetings(params: {
    segments: number[];
    sex?: string | null;
    ageFrom?: number | null;
    ageTo?: number | null;
    geoJson?: Prisma.InputJsonValue | null;
    interestsJson?: Prisma.InputJsonValue | null;
  }): Record<string, unknown> {
    const targetings: Record<string, unknown> = {
      geo: {
        regions: this.normalizeRegionIds(params.geoJson),
      },
      fulltime: this.buildDefaultFulltimeTargeting(),
      pads: [...VK_ADS_TEST_PADS],
    };

    if (params.sex) {
      targetings.sex = [params.sex];
    }

    const ageList = this.buildAgeList(params.ageFrom, params.ageTo);
    if (ageList.length) {
      targetings.age = { age_list: ageList };
    }

    if (params.segments.length) {
      targetings.segments = params.segments;
    }

    return targetings;
  }

  private buildDefaultFulltimeTargeting(): Record<string, unknown> {
    const hours = Array.from({ length: 24 }, (_, hour) => hour);

    return {
      flags: ['cross_timezone', 'use_holidays_moving'],
      mon: [...hours],
      tue: [...hours],
      wed: [...hours],
      thu: [...hours],
      fri: [...hours],
      sat: [...hours],
      sun: [...hours],
    };
  }

  private normalizeRegionIds(geoJson?: Prisma.InputJsonValue | null): number[] {
    if (!geoJson) {
      return [DEFAULT_RUSSIA_REGION_ID];
    }

    const candidates: unknown[] = [];

    if (Array.isArray(geoJson)) {
      candidates.push(...geoJson);
    } else if (typeof geoJson === 'object') {
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
      const values: number[] = [];
      for (let age = start; age <= end; age += 1) {
        values.push(age);
      }
      return values;
    }

    const single = from ?? to;
    return single === null ? [] : [single];
  }

  private async finalizeTestBuild(testId: number, report: BuildTestReport) {
    if (report.succeeded > 0) {
      await this.repository.updateTest(testId, { status: 'active' });
    } else if (report.failed > 0) {
      const activeVariantsCount =
        await this.repository.countActiveVariants(testId);
      if (activeVariantsCount === 0) {
        await this.repository.updateTest(testId, { status: 'error' });
      }
    }

    await this.repository.logAction({
      test: { connect: { id: testId } },
      action: 'test_build_completed',
      payloadJson: {
        totalRequested: report.totalRequested,
        attempted: report.attempted,
        succeeded: report.succeeded,
        failed: report.failed,
        skipped: report.skipped,
      },
    });
  }

  private toReport(
    testId: number,
    totalRequested: number,
    results: BuildVariantResult[],
  ): BuildTestReport {
    return {
      testId,
      totalRequested,
      attempted: results.filter((result) => result.status !== 'skipped').length,
      succeeded: results.filter((result) => result.status === 'succeeded')
        .length,
      failed: results.filter((result) => result.status === 'failed').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      results,
    };
  }

  private decimalToString(value: Prisma.Decimal | number | string) {
    return typeof value === 'string' ? value : value.toString();
  }

  private normalizeSegmentIds(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);
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

  private toShortErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 500);
  }

  private buildErrorLogPayload(
    errorMessage: string,
    error: unknown,
  ): Prisma.InputJsonValue {
    const payload: Record<string, unknown> = {
      errorMessage,
    };

    if (error instanceof VkAdsTestBuildError) {
      payload.stage = error.stage;
      payload.status = error.status;
      payload.vkErrorCode = error.vkErrorCode;
      payload.vkErrorMessage = error.vkErrorMessage;
      payload.vkErrorBody = error.vkErrorBody;
      payload.adGroupPayload = error.adGroupPayload;
      payload.bannerPayload = error.bannerPayload;
      payload.templateAdGroupId = error.templateAdGroupId;
      payload.templateBannerId = error.templateBannerId;
      return payload as Prisma.InputJsonValue;
    }

    if (error instanceof VkAdsTestClientError) {
      payload.status = error.status;
      payload.vkErrorCode = error.vkErrorCode;
      payload.vkErrorMessage = error.vkErrorMessage;
      payload.vkErrorBody = error.rawError;
      return payload as Prisma.InputJsonValue;
    }

    return payload as Prisma.InputJsonValue;
  }
}
