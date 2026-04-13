import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BuildTestDto } from '../dto/build-test.dto';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';
import {
  VkAdsTestBuilderService,
  VkAdsTestBuildOneVariantInput,
} from './vk-ads-test-builder.service';

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
type BuildVariant = BuildTest['variants'][number];

const DEFAULT_URL_CHECK_TIMEOUT_MS = 120_000;
const DEFAULT_URL_CHECK_INTERVAL_MS = 5_000;

@Injectable()
export class VkAdsTestBuildService {
  constructor(
    private readonly repository: VkAdsTestRepository,
    private readonly builder: VkAdsTestBuilderService,
  ) {}

  async buildTest(testId: number, dto: BuildTestDto = {}): Promise<BuildTestReport> {
    const test = await this.repository.getTestForBuild(testId);

    if (!test) {
      throw new NotFoundException(`VK Ads test not found: id=${testId}`);
    }

    const requestedVariants = this.selectRequestedVariants(test, dto.variantIds);
    const results: BuildVariantResult[] = [];

    for (const variant of requestedVariants) {
      const skipReason = this.getSkipReason(test, variant, dto);
      if (skipReason) {
        results.push({
          variantId: variant.id,
          status: 'skipped',
          errorMessage: skipReason,
        });
        continue;
      }

      await this.markBuildStarted(test.id, variant.id);

      try {
        const buildResult = await this.builder.buildOneVariant(
          this.toBuilderInput(test, variant),
        );
        const vkIds = buildResult.vkIds;
        const launchDate = new Date();

        await this.repository.updateVariant(variant.id, {
          vkCampaignId: vkIds.campaignId,
          vkAdGroupId: vkIds.adGroupId,
          vkBannerId: vkIds.bannerId,
          vkPrimaryUrlId: vkIds.urlId,
          launchDate,
          status: 'active',
        });

        await this.repository.logAction({
          test: { connect: { id: test.id } },
          variant: { connect: { id: variant.id } },
          action: 'variant_build_succeeded',
          payloadJson: {
            vkCampaignId: vkIds.campaignId,
            vkAdGroupId: vkIds.adGroupId,
            vkBannerId: vkIds.bannerId,
            vkPrimaryUrlId: vkIds.urlId,
          },
        });

        results.push({
          variantId: variant.id,
          status: 'succeeded',
          vkCampaignId: vkIds.campaignId,
          vkAdGroupId: vkIds.adGroupId,
          vkBannerId: vkIds.bannerId,
          vkPrimaryUrlId: vkIds.urlId,
        });
      } catch (error) {
        const errorMessage = this.toShortErrorMessage(error);

        await this.repository.updateVariant(variant.id, {
          status: 'error',
        });

        await this.repository.logAction({
          test: { connect: { id: test.id } },
          variant: { connect: { id: variant.id } },
          action: 'variant_build_failed',
          payloadJson: {
            errorMessage,
          },
        });

        results.push({
          variantId: variant.id,
          status: 'failed',
          errorMessage,
        });
      }
    }

    const report = this.toReport(test.id, requestedVariants.length, results);
    await this.finalizeTestBuild(test.id, report);

    return report;
  }

  private selectRequestedVariants(test: BuildTest, variantIds?: number[]) {
    if (!variantIds?.length) {
      return test.variants;
    }

    const requestedIds = new Set(variantIds);
    const selected = test.variants.filter((variant) => requestedIds.has(variant.id));
    const selectedIds = new Set(selected.map((variant) => variant.id));
    const missingIds = variantIds.filter((id) => !selectedIds.has(id));

    if (missingIds.length > 0) {
      throw new BadRequestException(
        `Variants do not belong to VK Ads test ${test.id}: ${missingIds.join(', ')}`,
      );
    }

    return selected;
  }

  private getSkipReason(
    test: BuildTest,
    variant: BuildVariant,
    dto: BuildTestDto,
  ): string | null {
    if (!test.landingUrl) {
      return 'test_landing_url_missing';
    }

    if (variant.creative.status === 'archived') {
      return 'creative_archived';
    }

    if (variant.audience.status === 'archived') {
      return 'audience_archived';
    }

    if (variant.status === 'error' && dto.rebuildErrors !== true) {
      return 'variant_error_rebuild_not_enabled';
    }

    if (!['draft', 'ready', 'error'].includes(variant.status)) {
      return `variant_status_not_buildable:${variant.status}`;
    }

    if (variant.status === 'error' && dto.rebuildErrors === true) {
      return null;
    }

    if (variant.vkCampaignId || variant.vkAdGroupId || variant.vkBannerId) {
      return 'variant_already_has_vk_ids';
    }

    return null;
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
    variant: BuildVariant,
  ): VkAdsTestBuildOneVariantInput {
    return {
      integrationId: test.accountIntegrationId,
      accountId: test.accountIntegration.accountId,
      testName: test.name,
      packageId: test.packageId,
      landingUrl: test.landingUrl as string,
      campaignName: `${test.name} ${variant.variantKey}`,
      adGroupName: `${variant.audience.name} ${variant.variantKey}`,
      bannerName: `${variant.creative.name} ${variant.variantKey}`,
      objective: test.objective,
      budgetDay: this.decimalToString(variant.budgetLimitDay ?? test.startBudget),
      urlCheckTimeoutMs: DEFAULT_URL_CHECK_TIMEOUT_MS,
      urlCheckIntervalMs: DEFAULT_URL_CHECK_INTERVAL_MS,
      audience: {
        name: variant.audience.name,
        sex: variant.audience.sex ?? undefined,
        ageFrom: variant.audience.ageFrom ?? undefined,
        ageTo: variant.audience.ageTo ?? undefined,
        geoJson: variant.audience.geoJson as Prisma.InputJsonValue | undefined,
        interestsJson: variant.audience.interestsJson as
          | Prisma.InputJsonValue
          | undefined,
      },
      creative: {
        name: variant.creative.name,
        title: variant.creative.title,
        text: variant.creative.text,
      },
      persistResult: false,
      existingIds: {
        testId: test.id,
        audienceId: variant.audienceId,
        creativeId: variant.creativeId,
        variantId: variant.id,
        variantKey: variant.variantKey,
      },
    };
  }

  private async finalizeTestBuild(testId: number, report: BuildTestReport) {
    if (report.succeeded > 0) {
      await this.repository.updateTest(testId, { status: 'active' });
    } else if (report.failed > 0) {
      const activeVariantsCount = await this.repository.countActiveVariants(testId);
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
      succeeded: results.filter((result) => result.status === 'succeeded').length,
      failed: results.filter((result) => result.status === 'failed').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      results,
    };
  }

  private decimalToString(value: Prisma.Decimal | number | string) {
    return typeof value === 'string' ? value : value.toString();
  }

  private toShortErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 500);
  }
}
