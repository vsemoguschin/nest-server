import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VkAdsTestClient } from '../clients/vk-ads-test.client';
import { UpdateCitiesSettingsDto } from '../dto/update-cities-settings.dto';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';

const MASS_ACTION_CHUNK_SIZE = 200;

type CitiesSettingsTest = NonNullable<
  Awaited<ReturnType<VkAdsTestRepository['getTestForCitiesSettings']>>
>;

type CitiesSettingsAudience = CitiesSettingsTest['audiences'][number];

@Injectable()
export class VkAdsTestCitiesSettingsService {
  constructor(
    private readonly repository: VkAdsTestRepository,
    private readonly client: VkAdsTestClient,
  ) {}

  async updateSettings(testId: number, dto: UpdateCitiesSettingsDto) {
    if (
      dto.budget === undefined &&
      dto.sex === undefined &&
      dto.ageFrom === undefined &&
      dto.ageTo === undefined
    ) {
      throw new BadRequestException('At least one field must be provided');
    }

    const test = await this.loadAndValidateTest(testId);

    const audiences = test.audiences as CitiesSettingsAudience[];

    if (audiences.length === 0) {
      throw new BadRequestException(
        `No active adGroups found for cities test id=${testId}`,
      );
    }

    const payload = this.buildMassActionPayload(audiences, dto);
    await this.applyMassActionInChunks(test.accountIntegrationId, payload);
    await this.persistChanges(test, audiences, dto);

    await this.repository.logAction({
      test: { connect: { id: test.id } },
      action: 'cities_settings_updated',
      payloadJson: {
        budget: dto.budget ?? null,
        sex: dto.sex ?? null,
        ageFrom: dto.ageFrom ?? null,
        ageTo: dto.ageTo ?? null,
        adGroupsUpdated: audiences.length,
      },
    });

    return { testId, adGroupsUpdated: audiences.length };
  }

  private async loadAndValidateTest(testId: number): Promise<CitiesSettingsTest> {
    const test = await this.repository.getTestForCitiesSettings(testId);

    if (!test) {
      throw new NotFoundException(`VK Ads test not found: id=${testId}`);
    }

    if (test.flowType !== 'cities') {
      throw new BadRequestException(
        `Test id=${testId} is not a cities test (flowType=${test.flowType})`,
      );
    }

    if (!test.vkCampaignId) {
      throw new BadRequestException(
        `Test id=${testId} has no vkCampaignId — launch not completed yet`,
      );
    }

    const allowedStatuses = ['active', 'paused'];
    if (!allowedStatuses.includes(test.status)) {
      throw new BadRequestException(
        `Test id=${testId} has status=${test.status}, expected one of: ${allowedStatuses.join(', ')}`,
      );
    }

    return test;
  }

  private buildMassActionPayload(
    audiences: CitiesSettingsAudience[],
    dto: UpdateCitiesSettingsDto,
  ): Record<string, unknown>[] {
    const hasTargeting = dto.sex !== undefined || dto.ageFrom !== undefined || dto.ageTo !== undefined;
    const hasBudget = dto.budget !== undefined;

    return audiences.map((audience) => {
      const item: Record<string, unknown> = { id: audience.vkAdGroupId };

      if (hasBudget) {
        item.budget_limit_day = dto.budget;
      }

      if (hasTargeting) {
        item.targetings = this.buildTargetings(dto);
      }

      return item;
    });
  }

  private buildTargetings(dto: UpdateCitiesSettingsDto): Record<string, unknown> {
    const targetings: Record<string, unknown> = {};

    if (dto.sex !== undefined) {
      if (dto.sex !== null) {
        targetings.sex = [dto.sex];
      }
    }

    if (dto.ageFrom != null && dto.ageTo != null) {
      targetings.age = {
        age_list: this.buildAgeList(dto.ageFrom, dto.ageTo),
      };
    }

    return targetings;
  }

  private buildAgeList(ageFrom: number, ageTo: number): number[] {
    if (ageFrom > ageTo) {
      throw new BadRequestException('ageFrom must be less than or equal to ageTo');
    }
    const result: number[] = [];
    for (let age = ageFrom; age <= ageTo; age += 1) {
      result.push(age);
    }
    return result;
  }

  private async applyMassActionInChunks(
    integrationId: number,
    items: Record<string, unknown>[],
  ): Promise<void> {
    const chunks = this.chunk(items, MASS_ACTION_CHUNK_SIZE);

    for (const chunkItems of chunks) {
      await this.client.massActionAdGroups(integrationId, chunkItems);
    }
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }

  private async persistChanges(
    test: CitiesSettingsTest,
    audiences: CitiesSettingsAudience[],
    dto: UpdateCitiesSettingsDto,
  ): Promise<void> {
    const audienceIds = audiences.map((a) => a.id);

    const hasTargeting = dto.sex !== undefined || dto.ageFrom !== undefined || dto.ageTo !== undefined;
    const hasBudget = dto.budget !== undefined;

    await this.repository.transaction(async (tx) => {
      if (hasBudget) {
        await this.repository.updateTest(
          test.id,
          { startBudget: new Prisma.Decimal(dto.budget as number) },
          tx,
        );
      }

      if (hasTargeting) {
        const audienceData: {
          sex?: string | null;
          ageFrom?: number | null;
          ageTo?: number | null;
        } = {};

        if (dto.sex !== undefined) {
          audienceData.sex = dto.sex;
        }
        if (dto.ageFrom !== undefined) {
          audienceData.ageFrom = dto.ageFrom;
        }
        if (dto.ageTo !== undefined) {
          audienceData.ageTo = dto.ageTo;
        }

        await this.repository.updateAudiencesCitiesSettings(audienceIds, audienceData, tx);
      }
    });
  }
}
