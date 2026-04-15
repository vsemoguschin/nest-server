import { Injectable } from '@nestjs/common';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';

type PlacementTest = NonNullable<
  Awaited<ReturnType<VkAdsTestRepository['getTestForBuild']>>
>;
type PlacementCreative = PlacementTest['creatives'][number];
type PlacementAudience = PlacementTest['audiences'][number];
type PlacementVariant = {
  id: number;
  testId: number;
  audienceId: number;
  creativeId: number;
  variantKey: string;
  status: string;
  budgetLimitDay: PlacementTest['startBudget'];
  vkCampaignId: number | null;
  vkAdGroupId: number | null;
  vkBannerId: number | null;
  vkPrimaryUrlId: number | null;
  launchDate: Date | null;
  creative?: PlacementCreative;
  audience?: PlacementAudience;
};

export type VkAdsTestPlacement = {
  placementKey: string;
  audienceId: number;
  creativeId: number;
  audience: PlacementAudience;
  creative: PlacementCreative;
  variant: PlacementVariant;
};

@Injectable()
export class VkAdsTestPlacementPlannerService {
  constructor(private readonly repository: VkAdsTestRepository) {}

  async planPlacements(test: PlacementTest, variantIds?: number[]) {
    const requestedVariantIds = variantIds?.length
      ? new Set(variantIds)
      : null;
    const variantsByKey = new Map<string, PlacementVariant>(
      test.variants.map((variant) => [
        this.buildPlacementKey(test.id, variant.audienceId, variant.creativeId),
        variant as PlacementVariant,
      ]),
    );
    const placements: VkAdsTestPlacement[] = [];

    for (const audience of test.audiences) {
      for (const creative of test.creatives) {
        const placementKey = this.buildPlacementKey(
          test.id,
          audience.id,
          creative.id,
        );
        let variant = variantsByKey.get(placementKey);

        if (!variant) {
          variant = await this.repository.createVariant({
            test: { connect: { id: test.id } },
            audience: { connect: { id: audience.id } },
            creative: { connect: { id: creative.id } },
            variantKey: placementKey,
            status: 'draft',
            budgetLimitDay: test.startBudget,
          });
          variantsByKey.set(placementKey, variant as PlacementVariant);
        }

        const resolvedVariant = variant;
        if (!resolvedVariant) {
          throw new Error(
            `VK Ads test is missing variant storage for placement ${placementKey}`,
          );
        }

        if (requestedVariantIds && !requestedVariantIds.has(resolvedVariant.id)) {
          continue;
        }

        placements.push({
          placementKey,
          audienceId: audience.id,
          creativeId: creative.id,
          audience,
          creative,
          variant: resolvedVariant,
        });
      }
    }

    if (requestedVariantIds) {
      const foundVariantIds = new Set(placements.map((placement) => placement.variant.id));
      const missingIds = (variantIds ?? []).filter(
        (id) => !foundVariantIds.has(id),
      );
      if (missingIds.length > 0) {
        throw new Error(
          `Variants do not belong to VK Ads test ${test.id}: ${missingIds.join(', ')}`,
        );
      }
    }

    return placements;
  }

  private buildPlacementKey(testId: number, audienceId: number, creativeId: number) {
    return `vat_${testId}_${audienceId}_${creativeId}`;
  }
}
