import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';
import { VkAdsTestClient } from '../clients/vk-ads-test.client';

type TestActionKind = 'pause' | 'resume';
type TestActionResultStatus = 'succeeded' | 'failed' | 'skipped';

type TestActionResult = {
  variantId: number;
  status: TestActionResultStatus;
  errorMessage?: string;
};

type TestActionReport = {
  testId: number;
  action: TestActionKind;
  total: number;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: TestActionResult[];
};

type ActionTest = NonNullable<
  Awaited<ReturnType<VkAdsTestRepository['getTestForActions']>>
>;

@Injectable()
export class VkAdsTestTestActionsService {
  constructor(
    private readonly repository: VkAdsTestRepository,
    private readonly client: VkAdsTestClient,
  ) {}

  async pauseTest(testId: number) {
    return this.runTestAction(testId, 'pause', 'active');
  }

  async resumeTest(testId: number) {
    return this.runTestAction(testId, 'resume', 'paused');
  }

  private async runTestAction(
    testId: number,
    action: TestActionKind,
    targetStatus: string,
  ): Promise<TestActionReport> {
    const test = await this.repository.getTestForActions(testId);

    if (!test) {
      throw new NotFoundException(`VK Ads test not found: id=${testId}`);
    }

    const campaignId = this.resolveCampaignId(test);
    if (!campaignId) {
      throw new BadRequestException(
        `VK Ads test has no vkCampaignId: id=${test.id}`,
      );
    }

    const results: TestActionResult[] = [];
    const targetVariants = test.variants.filter(
      (variant) => variant.status === targetStatus,
    );

    try {
      await this.client.updateCampaignStatus(
        test.accountIntegrationId,
        campaignId,
        action === 'pause' ? 'blocked' : 'active',
      );
    } catch (error) {
      for (const variant of targetVariants) {
        results.push({
          variantId: variant.id,
          status: 'failed',
          errorMessage: this.toShortErrorMessage(error),
        });
      }
      for (const variant of test.variants) {
        if (variant.status === targetStatus) continue;
        results.push({
          variantId: variant.id,
          status: 'skipped',
          errorMessage: `variant_status_not_${targetStatus}`,
        });
      }
      return this.finalizeReport(test, action, results);
    }

    for (const variant of targetVariants) {
      await this.repository.updateVariant(variant.id, {
        status: action === 'pause' ? 'paused' : 'active',
      });
      results.push({
        variantId: variant.id,
        status: 'succeeded',
      });
    }

    for (const variant of test.variants) {
      if (variant.status === targetStatus) continue;
      results.push({
        variantId: variant.id,
        status: 'skipped',
        errorMessage: `variant_status_not_${targetStatus}`,
      });
    }

    return this.finalizeReport(test, action, results, true);
  }

  private resolveCampaignId(test: ActionTest) {
    if (test.vkCampaignId) {
      return test.vkCampaignId;
    }

    const variantCampaignId = (
      test.variants.find((variant) => variant.vkCampaignId) as
        | { vkCampaignId?: number | null }
        | undefined
    )?.vkCampaignId;

    if (variantCampaignId) {
      // Transitional fallback: older rows can still carry campaign id on variant.
      return variantCampaignId;
    }

    return null;
  }

  private async finalizeReport(
    test: ActionTest,
    action: TestActionKind,
    results: TestActionResult[],
    campaignUpdated = false,
  ) {
    const report = this.toReport(test.id, action, results);

    if (campaignUpdated && report.failed === 0) {
      await this.repository.updateTest(test.id, {
        status: action === 'pause' ? 'paused' : 'active',
      });

      await this.repository.logAction({
        test: { connect: { id: test.id } },
        action: action === 'pause' ? 'test_paused' : 'test_resumed',
        payloadJson: this.toReportPayload(report),
      });
    }

    await this.repository.logAction({
      test: { connect: { id: test.id } },
      action: 'test_action_completed',
      reason: action,
      payloadJson: this.toReportPayload(report),
    });

    return report;
  }

  private toReport(testId: number, action: TestActionKind, results: TestActionResult[]): TestActionReport {
    return {
      testId,
      action,
      total: results.length,
      attempted: results.filter((result) => result.status !== 'skipped').length,
      succeeded: results.filter((result) => result.status === 'succeeded').length,
      failed: results.filter((result) => result.status === 'failed').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      results,
    };
  }

  private toReportPayload(report: TestActionReport) {
    return {
      total: report.total,
      attempted: report.attempted,
      succeeded: report.succeeded,
      failed: report.failed,
      skipped: report.skipped,
    };
  }

  private toShortErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 500);
  }
}
