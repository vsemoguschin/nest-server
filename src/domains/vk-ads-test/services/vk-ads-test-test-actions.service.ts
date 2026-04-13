import { Injectable, NotFoundException } from '@nestjs/common';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';
import { VkAdsTestVariantActionsService } from './vk-ads-test-variant-actions.service';

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
type ActionVariant = ActionTest['variants'][number];

@Injectable()
export class VkAdsTestTestActionsService {
  constructor(
    private readonly repository: VkAdsTestRepository,
    private readonly variantActions: VkAdsTestVariantActionsService,
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

    const results: TestActionResult[] = [];

    for (const variant of test.variants) {
      if (variant.status !== targetStatus) {
        results.push({
          variantId: variant.id,
          status: 'skipped',
          errorMessage: `variant_status_not_${targetStatus}`,
        });
        continue;
      }

      try {
        await this.runVariantAction(action, variant);
        results.push({
          variantId: variant.id,
          status: 'succeeded',
        });
      } catch (error) {
        results.push({
          variantId: variant.id,
          status: 'failed',
          errorMessage: this.toShortErrorMessage(error),
        });
      }
    }

    const report = this.toReport(test.id, action, results);

    if (report.succeeded > 0 && report.failed === 0) {
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

  private runVariantAction(action: TestActionKind, variant: ActionVariant) {
    if (action === 'pause') {
      return this.variantActions.pauseVariant(variant.id);
    }

    return this.variantActions.resumeVariant(variant.id);
  }

  private toReport(
    testId: number,
    action: TestActionKind,
    results: TestActionResult[],
  ): TestActionReport {
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
