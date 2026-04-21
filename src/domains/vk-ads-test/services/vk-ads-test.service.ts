import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateAudienceDto } from '../dto/create-audience.dto';
import { CreateCreativeDto } from '../dto/create-creative.dto';
import { CreateTestDto } from '../dto/create-test.dto';
import { LaunchCitiesDto } from '../dto/launch-cities.dto';
import { UpdateAudienceDto } from '../dto/update-audience.dto';
import { UpdateCreativeDto } from '../dto/update-creative.dto';
import { UpdateTestDto } from '../dto/update-test.dto';
import { VkAdsTestClient } from '../clients/vk-ads-test.client';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';
import { VkAdsTestCitiesLaunchService } from './vk-ads-test-cities-launch.service';
import {
  VkAdsTestRuntimeStatus,
  VkAdsTestRuntimeStatusService,
} from './vk-ads-test-runtime-status.service';
import { VkAdsTestVideoAssetsService } from './vk-ads-test-video-assets.service';

const VK_ADS_TEST_OBJECTIVE = 'socialengagement';
const VK_ADS_TEST_PACKAGE_ID = 3127;

@Injectable()
export class VkAdsTestService {
  constructor(
    private readonly repository: VkAdsTestRepository,
    private readonly client: VkAdsTestClient,
    private readonly runtimeStatusService: VkAdsTestRuntimeStatusService,
    private readonly videoAssetsService: VkAdsTestVideoAssetsService,
    private readonly citiesLaunchService: VkAdsTestCitiesLaunchService,
  ) {}

  async listIntegrations() {
    const integrations = await this.repository.listActiveIntegrations();

    return integrations.map((integration) => ({
      id: integration.id,
      name: this.formatIntegrationName(integration),
      accountId: integration.accountId,
      accountName: integration.account?.name ?? null,
      vkAdsAccountId: integration.vkAdsAccountId,
      vkAdsCabinetId: integration.vkAdsCabinetId,
    }));
  }

  async listAudiences(accountIntegrationId?: number) {
    if (accountIntegrationId === undefined) {
      return [];
    }

    const pageSize = 100;
    const segments: Array<Record<string, unknown>> = [];
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total) {
      const page = await this.client.getRemarketingSegments(
        accountIntegrationId,
        {
          limit: pageSize,
          offset,
        },
      );

      const items = Array.isArray(page.items) ? page.items : [];
      segments.push(...items);

      const count = typeof page.count === 'number' ? page.count : null;
      total = count !== null ? count : segments.length;

      if (items.length < pageSize) {
        break;
      }

      offset += pageSize;
    }

    return segments.map((segment) => ({
      id: Number(segment.id),
      name: String(segment.name || ''),
      created: typeof segment.created === 'string' ? segment.created : null,
      updated: typeof segment.updated === 'string' ? segment.updated : null,
      flags: Array.isArray(segment.flags) ? segment.flags : [],
      passCondition:
        typeof segment.pass_condition === 'number'
          ? segment.pass_condition
          : null,
    }));
  }

  async createTest(dto: CreateTestDto) {
    await this.assertIntegrationExists(dto.accountIntegrationId);

    const test = await this.repository.createTest({
      accountIntegration: { connect: { id: dto.accountIntegrationId } },
      flowType: 'vk_ads',
      name: dto.name,
      status: 'draft',
      objective: VK_ADS_TEST_OBJECTIVE,
      packageId: VK_ADS_TEST_PACKAGE_ID,
      startBudget: dto.startBudget,
      landingUrl: dto.landingUrl,
    });

    await this.repository.logAction({
      test: { connect: { id: test.id } },
      action: 'test_created',
      payloadJson: {
        accountIntegrationId: dto.accountIntegrationId,
        objective: VK_ADS_TEST_OBJECTIVE,
        packageId: VK_ADS_TEST_PACKAGE_ID,
        startBudget: dto.startBudget,
        landingUrl: dto.landingUrl,
      },
    });

    return test;
  }

  async launchCities(dto: LaunchCitiesDto) {
    return this.citiesLaunchService.launchCities(dto);
  }

  async listTests() {
    const tests = await this.repository.listTests();
    const runtimeStates =
      await this.runtimeStatusService.resolveManyTestsRuntimeState(tests);
    const runtimeStateByTestId = new Map(
      runtimeStates.map(({ testId, runtimeStatus, runtimeIssue }) => [
        testId,
        {
          runtimeStatus,
          runtimeIssue,
        },
      ]),
    );

    return tests.map(({ _count, actionLogs, ...test }) => ({
      ...test,
      expectedCitiesCount: this.extractExpectedCitiesCount(actionLogs),
      runtimeStatus:
        runtimeStateByTestId.get(test.id)?.runtimeStatus ??
        (test.vkCampaignId == null ? 'unknown' : 'error'),
      runtimeIssue:
        runtimeStateByTestId.get(test.id)?.runtimeIssue ?? null,
      canToggleRuntime:
        test.vkCampaignId != null &&
        !this.isRuntimeToggleDisabled(
          runtimeStateByTestId.get(test.id)?.runtimeStatus ??
            (test.vkCampaignId == null ? 'unknown' : 'error'),
        ),
      flowType:
        test.flowType === 'cities' || actionLogs.length > 0
          ? 'cities'
          : 'vk_ads',
      creativesCount: _count.creatives,
      audiencesCount: _count.audiences,
      variantsCount: _count.variants,
    }));
  }

  async getTest(id: number) {
    const test = await this.repository.getTestCard(id);

    if (!test) {
      throw new NotFoundException(`VK Ads test not found: id=${id}`);
    }

    return test;
  }

  async updateTest(id: number, dto: UpdateTestDto) {
    await this.assertTestExists(id);

    const data: Prisma.VkAdsTestUpdateInput = {
      ...this.pickDefined({
        name: dto.name,
        landingUrl: dto.landingUrl,
        startBudget: dto.startBudget,
      }),
    };

    const test = await this.repository.updateTest(id, data);

    await this.repository.logAction({
      test: { connect: { id } },
      action: 'test_updated',
      payloadJson: {
        fields: Object.keys(data),
      },
    });

    return test;
  }

  async addCreative(testId: number, dto: CreateCreativeDto) {
    await this.assertTestExists(testId);
    const videoAsset =
      dto.videoAssetId !== undefined
        ? await this.videoAssetsService.ensureVideoAssetForCreative(
            testId,
            dto.videoAssetId,
          )
        : null;

    const creative = await this.repository.createCreative({
      test: { connect: { id: testId } },
      name: dto.name,
      title: dto.title,
      text: dto.text,
      videoSourceUrl: dto.videoSourceUrl,
      ...(videoAsset ? { videoAssetId: videoAsset.id } : {}),
      vkContentId: this.normalizeOptionalId(
        videoAsset?.vkContentId ?? dto.vkContentId ?? dto.videoContentId,
      ),
      status: 'draft',
    });

    await this.repository.logAction({
      test: { connect: { id: testId } },
      action: 'creative_added',
      payloadJson: {
        creativeId: creative.id,
        name: creative.name,
      },
    });

    return creative;
  }

  async updateCreative(
    testId: number,
    creativeId: number,
    dto: UpdateCreativeDto,
  ) {
    await this.assertCreativeExists(testId, creativeId);
    const videoAsset =
      dto.videoAssetId !== undefined
        ? await this.videoAssetsService.ensureVideoAssetForCreative(
            testId,
            dto.videoAssetId,
          )
        : undefined;

    const data: Prisma.VkAdsTestCreativeUpdateInput = {
      ...this.pickDefined({
        name: dto.name,
        title: dto.title,
        text: dto.text,
        videoSourceUrl: dto.videoSourceUrl,
        videoAsset: videoAsset ? { connect: { id: videoAsset.id } } : undefined,
        vkContentId: this.normalizeOptionalId(
          videoAsset?.vkContentId ?? dto.vkContentId ?? dto.videoContentId,
        ),
      }),
    };

    const creative = await this.repository.updateCreative(creativeId, data);

    await this.repository.logAction({
      test: { connect: { id: testId } },
      action: 'creative_updated',
      payloadJson: {
        creativeId,
        fields: Object.keys(data),
      },
    });

    return creative;
  }

  async updateCreativeById(creativeId: number, dto: UpdateCreativeDto) {
    const creative = await this.repository.findCreativeById(creativeId);

    if (!creative) {
      throw new NotFoundException(
        `VK Ads test creative not found: id=${creativeId}`,
      );
    }

    return this.updateCreative(creative.testId, creativeId, dto);
  }

  async removeCreative(testId: number, creativeId: number) {
    await this.assertCreativeExists(testId, creativeId);

    const creative = await this.repository.updateCreative(creativeId, {
      status: 'archived',
    });

    await this.repository.logAction({
      test: { connect: { id: testId } },
      action: 'creative_archived',
      payloadJson: { creativeId },
    });

    return creative;
  }

  async addAudience(testId: number, dto: CreateAudienceDto) {
    await this.assertTestExists(testId);
    const includeSegmentIds = this.normalizeSegmentIds(
      dto.includeSegmentIds ??
        (dto.vkSegmentId !== undefined ? [dto.vkSegmentId] : []),
    );
    const excludeSegmentIds = this.normalizeSegmentIds(dto.excludeSegmentIds);

    this.assertNoOverlap(includeSegmentIds, excludeSegmentIds);

    const audience = await this.repository.createAudience({
      test: { connect: { id: testId } },
      name: dto.name,
      vkSegmentId: dto.vkSegmentId,
      includeSegmentIds,
      excludeSegmentIds,
      sex: dto.sex,
      ageFrom: dto.ageFrom,
      ageTo: dto.ageTo,
      geoJson: dto.geoJson as Prisma.InputJsonValue,
      interestsJson: dto.interestsJson as Prisma.InputJsonValue,
      status: 'draft',
    });

    await this.repository.logAction({
      test: { connect: { id: testId } },
      action: 'audience_added',
      payloadJson: {
        audienceId: audience.id,
        name: audience.name,
      },
    });

    return audience;
  }

  async updateAudience(
    testId: number,
    audienceId: number,
    dto: UpdateAudienceDto,
  ) {
    await this.assertAudienceExists(testId, audienceId);
    const includeSegmentIds = dto.includeSegmentIds
      ? this.normalizeSegmentIds(dto.includeSegmentIds)
      : undefined;
    const excludeSegmentIds = dto.excludeSegmentIds
      ? this.normalizeSegmentIds(dto.excludeSegmentIds)
      : undefined;

    if (includeSegmentIds && excludeSegmentIds) {
      this.assertNoOverlap(includeSegmentIds, excludeSegmentIds);
    }

    const data: Prisma.VkAdsTestAudienceUpdateInput = {
      ...this.pickDefined({
        name: dto.name,
        sex: dto.sex,
        ageFrom: dto.ageFrom,
        ageTo: dto.ageTo,
        geoJson: dto.geoJson as Prisma.InputJsonValue,
        interestsJson: dto.interestsJson as Prisma.InputJsonValue,
        vkSegmentId: dto.vkSegmentId,
        includeSegmentIds: includeSegmentIds as
          | Prisma.InputJsonValue
          | undefined,
        excludeSegmentIds: excludeSegmentIds as
          | Prisma.InputJsonValue
          | undefined,
      }),
    };

    const audience = await this.repository.updateAudience(audienceId, data);

    await this.repository.logAction({
      test: { connect: { id: testId } },
      action: 'audience_updated',
      payloadJson: {
        audienceId,
        fields: Object.keys(data),
      },
    });

    return audience;
  }

  async removeAudience(testId: number, audienceId: number) {
    await this.assertAudienceExists(testId, audienceId);

    const audience = await this.repository.updateAudience(audienceId, {
      status: 'archived',
    });

    await this.repository.logAction({
      test: { connect: { id: testId } },
      action: 'audience_archived',
      payloadJson: { audienceId },
    });

    return audience;
  }

  private async assertIntegrationExists(id: number) {
    const integration = await this.repository.findIntegrationById(id);

    if (!integration) {
      throw new NotFoundException(`VK Ads integration not found: id=${id}`);
    }
  }

  private async assertTestExists(id: number) {
    const test = await this.repository.findTestById(id);

    if (!test) {
      throw new NotFoundException(`VK Ads test not found: id=${id}`);
    }
  }

  private async assertCreativeExists(testId: number, creativeId: number) {
    const creative = await this.repository.findCreative(testId, creativeId);

    if (!creative) {
      throw new NotFoundException(
        `VK Ads test creative not found: testId=${testId}, creativeId=${creativeId}`,
      );
    }
  }

  private async assertAudienceExists(testId: number, audienceId: number) {
    const audience = await this.repository.findAudience(testId, audienceId);

    if (!audience) {
      throw new NotFoundException(
        `VK Ads test audience not found: testId=${testId}, audienceId=${audienceId}`,
      );
    }
  }

  private normalizeOptionalId(value: string | number | undefined) {
    if (value === undefined || value === null) {
      return undefined;
    }

    const normalized = String(value).trim();

    if (!normalized) {
      throw new BadRequestException('vkContentId must not be empty');
    }

    return normalized;
  }

  private normalizeSegmentIds(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);
  }

  private assertNoOverlap(
    includeSegmentIds: number[],
    excludeSegmentIds: number[],
  ) {
    const include = new Set(includeSegmentIds);
    const overlap = excludeSegmentIds.filter((id) => include.has(id));

    if (overlap.length) {
      throw new BadRequestException(
        `VK segment cannot be both included and excluded: ${overlap.join(', ')}`,
      );
    }
  }

  private pickDefined<T extends Record<string, unknown>>(value: T) {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined),
    ) as Partial<T>;
  }

  private isRuntimeToggleDisabled(runtimeStatus: VkAdsTestRuntimeStatus) {
    return (
      runtimeStatus === 'missing' ||
      runtimeStatus === 'error' ||
      runtimeStatus === 'unknown'
    );
  }

  private extractExpectedCitiesCount(
    actionLogs: Array<{ payloadJson?: unknown }>,
  ): number | null {
    const payload = actionLogs[0]?.payloadJson;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const expectedCitiesCount = (payload as Record<string, unknown>)
      .expectedCitiesCount;
    const parsed =
      typeof expectedCitiesCount === 'number'
        ? expectedCitiesCount
        : typeof expectedCitiesCount === 'string'
          ? Number(expectedCitiesCount)
          : NaN;

    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private formatIntegrationName(
    integration: Awaited<
      ReturnType<VkAdsTestRepository['listActiveIntegrations']>
    >[number],
  ) {
    const parts = [
      integration.account?.name || integration.account?.code,
      integration.vkAdsAccountId
        ? `VK account ${integration.vkAdsAccountId}`
        : '',
      integration.vkAdsCabinetId ? `cabinet ${integration.vkAdsCabinetId}` : '',
    ].filter(Boolean);

    return parts.length
      ? parts.join(' / ')
      : `VK Ads integration #${integration.id}`;
  }
}
