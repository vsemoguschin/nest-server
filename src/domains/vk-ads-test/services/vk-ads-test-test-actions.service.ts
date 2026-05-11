import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VkAdsTestClient } from '../clients/vk-ads-test.client';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';

type TestActionKind = 'pause' | 'resume';
type VkRuntimeActionStatus = 'active' | 'blocked';

type RuntimeActionTest = {
  id: number;
  accountIntegrationId: number;
  vkCampaignId: number | null;
  audiences: Array<{
    id: number;
    vkAdGroupId: number | null;
  }>;
  variants: Array<{
    id: number;
    vkBannerId: number | null;
  }>;
};

type RuntimeEntityReport = {
  total: number;
  succeeded: number;
  failed: number;
};

type RuntimeActionReport = {
  testId: number;
  action: TestActionKind;
  campaign: {
    id: number;
    status: VkRuntimeActionStatus;
  };
  adGroups: RuntimeEntityReport;
  banners: RuntimeEntityReport;
};

@Injectable()
export class VkAdsTestTestActionsService {
  constructor(
    private readonly repository: VkAdsTestRepository,
    private readonly client: VkAdsTestClient,
  ) {}

  async pauseTest(testId: number): Promise<RuntimeActionReport> {
    return this.runTestAction(testId, 'pause');
  }

  async resumeTest(testId: number): Promise<RuntimeActionReport> {
    return this.runTestAction(testId, 'resume');
  }

  private async runTestAction(
    testId: number,
    action: TestActionKind,
  ): Promise<RuntimeActionReport> {
    const test = await this.getTest(testId);

    if (test.vkCampaignId == null) {
      throw new BadRequestException(
        `VK Ads test has no vkCampaignId: id=${test.id}`,
      );
    }

    const targetStatus: VkRuntimeActionStatus =
      action === 'pause' ? 'blocked' : 'active';

    await this.client.updateAdPlan(
      test.accountIntegrationId,
      test.vkCampaignId,
      {
        status: targetStatus,
      },
    );

    const adGroups =
      action === 'pause'
        ? await this.toggleAdGroups(test, 'blocked')
        : await this.toggleAdGroups(test, 'active');
    const banners =
      action === 'pause'
        ? await this.toggleBanners(test, 'blocked')
        : await this.toggleBanners(test, 'active');

    const report: RuntimeActionReport = {
      testId: test.id,
      action,
      campaign: {
        id: test.vkCampaignId,
        status: targetStatus,
      },
      adGroups,
      banners,
    };

    await this.repository.logAction({
      test: { connect: { id: test.id } },
      action: action === 'pause' ? 'test_paused' : 'test_resumed',
      payloadJson: this.toReportPayload(report),
    });

    return report;
  }

  private async toggleAdGroups(
    test: RuntimeActionTest,
    status: VkRuntimeActionStatus,
  ): Promise<RuntimeEntityReport> {
    const results = await Promise.all(
      test.audiences
        .filter((audience) => audience.vkAdGroupId != null)
        .map(async (audience) => {
          const adGroupId = audience.vkAdGroupId as number;

          try {
            await this.client.updateAdGroup(
              test.accountIntegrationId,
              adGroupId,
              {
                status,
              },
            );
            return { ok: true };
          } catch {
            return { ok: false };
          }
        }),
    );

    return this.toEntityReport(results);
  }

  private async toggleBanners(
    test: RuntimeActionTest,
    status: VkRuntimeActionStatus,
  ): Promise<RuntimeEntityReport> {
    const results = await Promise.all(
      test.variants
        .filter((variant) => variant.vkBannerId != null)
        .map(async (variant) => {
          const bannerId = variant.vkBannerId as number;
          try {
            await this.client.updateBanner(
              test.accountIntegrationId,
              bannerId,
              {
                status,
              },
            );
            return { ok: true };
          } catch {
            return { ok: false };
          }
        }),
    );

    return this.toEntityReport(results);
  }

  private toEntityReport(results: Array<{ ok: boolean }>): RuntimeEntityReport {
    return {
      total: results.length,
      succeeded: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
    };
  }

  private toReportPayload(report: RuntimeActionReport) {
    return {
      campaign: report.campaign,
      adGroups: report.adGroups,
      banners: report.banners,
    };
  }

  private async getTest(testId: number): Promise<RuntimeActionTest> {
    const test = (await this.repository.getTestForRuntimeActions(
      testId,
    )) as unknown as RuntimeActionTest;

    if (!test) {
      throw new NotFoundException(`VK Ads test not found: id=${testId}`);
    }

    return test;
  }
}
