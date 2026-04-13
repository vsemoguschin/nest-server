import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateAudienceDto } from '../dto/create-audience.dto';
import { CreateCreativeDto } from '../dto/create-creative.dto';
import { CreateTestDto } from '../dto/create-test.dto';
import { UpdateAudienceDto } from '../dto/update-audience.dto';
import { UpdateCreativeDto } from '../dto/update-creative.dto';
import { UpdateTestDto } from '../dto/update-test.dto';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';

const VK_ADS_TEST_OBJECTIVE = 'socialengagement';
const VK_ADS_TEST_PACKAGE_ID = 3127;

@Injectable()
export class VkAdsTestService {
  constructor(private readonly repository: VkAdsTestRepository) {}

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

  async createTest(dto: CreateTestDto) {
    await this.assertIntegrationExists(dto.accountIntegrationId);

    const test = await this.repository.createTest({
      accountIntegration: { connect: { id: dto.accountIntegrationId } },
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

  async listTests() {
    const tests = await this.repository.listTests();

    return tests.map(({ _count, ...test }) => ({
      ...test,
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

    const creative = await this.repository.createCreative({
      test: { connect: { id: testId } },
      name: dto.name,
      title: dto.title,
      text: dto.text,
      videoSourceUrl: dto.videoSourceUrl,
      vkContentId: this.normalizeOptionalId(dto.vkContentId),
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

    const data: Prisma.VkAdsTestCreativeUpdateInput = {
      ...this.pickDefined({
        name: dto.name,
        title: dto.title,
        text: dto.text,
        videoSourceUrl: dto.videoSourceUrl,
        vkContentId: this.normalizeOptionalId(dto.vkContentId),
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

    const audience = await this.repository.createAudience({
      test: { connect: { id: testId } },
      name: dto.name,
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

    const data: Prisma.VkAdsTestAudienceUpdateInput = {
      ...this.pickDefined({
        name: dto.name,
        sex: dto.sex,
        ageFrom: dto.ageFrom,
        ageTo: dto.ageTo,
        geoJson: dto.geoJson as Prisma.InputJsonValue,
        interestsJson: dto.interestsJson as Prisma.InputJsonValue,
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

  private pickDefined<T extends Record<string, unknown>>(value: T) {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined),
    ) as Partial<T>;
  }

  private formatIntegrationName(
    integration: Awaited<
      ReturnType<VkAdsTestRepository['listActiveIntegrations']>
    >[number],
  ) {
    const parts = [
      integration.account?.name || integration.account?.code,
      integration.vkAdsAccountId ? `VK account ${integration.vkAdsAccountId}` : '',
      integration.vkAdsCabinetId ? `cabinet ${integration.vkAdsCabinetId}` : '',
    ].filter(Boolean);

    return parts.length ? parts.join(' / ') : `VK Ads integration #${integration.id}`;
  }
}
