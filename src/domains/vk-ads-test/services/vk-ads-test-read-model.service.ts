import { Injectable, NotFoundException } from '@nestjs/common';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';

type ReadModelTest = NonNullable<
  Awaited<ReturnType<VkAdsTestRepository['getTestForOwnershipReadModel']>>
>;
type ReadModelVariant = ReadModelTest['variants'][number];

type ReadModelVariantRef = {
  id: number;
  variantKey: string;
  status: string;
};

@Injectable()
export class VkAdsTestReadModelService {
  constructor(private readonly repository: VkAdsTestRepository) {}

  async getCampaigns(testId: number) {
    const test = await this.getTest(testId);
    const grouped = new Map<number, ReadModelVariant[]>();
    const fallbackCampaignId = test.vkCampaignId ?? null;

    for (const variant of test.variants) {
      const vkCampaignId = this.resolveCampaignId(fallbackCampaignId, variant);
      if (!vkCampaignId) continue;
      this.pushGrouped(grouped, vkCampaignId, variant);
    }

    return Array.from(grouped.entries()).map(([vkCampaignId, variants]) => ({
      vkCampaignId,
      variantCount: variants.length,
      variants: this.toVariantRefs(variants),
      creatives: this.uniqueStrings(variants.map((variant) => variant.creative.name)),
      audiences: this.uniqueStrings(variants.map((variant) => variant.audience.name)),
      firstLaunchDate: this.firstLaunchDate(variants),
      lastLaunchDate: this.lastLaunchDate(variants),
    }));
  }

  async getAdGroups(testId: number) {
    const test = await this.getTest(testId);
    const grouped = new Map<number, ReadModelVariant[]>();

    for (const variant of test.variants) {
      const vkAdGroupId = this.resolveAdGroupId(variant);
      if (!vkAdGroupId) continue;
      this.pushGrouped(grouped, vkAdGroupId, variant);
    }

    return Array.from(grouped.entries()).map(([vkAdGroupId, variants]) => ({
      vkAdGroupId,
      variantCount: variants.length,
      variants: this.toVariantRefs(variants),
      audiences: this.uniqueStrings(variants.map((variant) => variant.audience.name)),
      currentBudgets: this.uniqueStrings(
        variants.map((variant) => variant.budgetLimitDay.toString()),
      ),
      firstLaunchDate: this.firstLaunchDate(variants),
      lastLaunchDate: this.lastLaunchDate(variants),
    }));
  }

  async getBanners(testId: number) {
    const test = await this.getTest(testId);
    const grouped = new Map<number, ReadModelVariant[]>();

    for (const variant of test.variants) {
      const vkBannerId = variant.vkBannerId;
      if (!vkBannerId) continue;
      this.pushGrouped(grouped, vkBannerId, variant);
    }

    return Array.from(grouped.entries()).map(([vkBannerId, variants]) => ({
      vkBannerId,
      variantCount: variants.length,
      variants: this.toVariantRefs(variants),
      creatives: this.uniqueStrings(variants.map((variant) => variant.creative.name)),
      firstLaunchDate: this.firstLaunchDate(variants),
      lastLaunchDate: this.lastLaunchDate(variants),
    }));
  }

  private async getTest(testId: number) {
    const test = await this.repository.getTestForOwnershipReadModel(testId);

    if (!test) {
      throw new NotFoundException(`VK Ads test not found: id=${testId}`);
    }

    return test;
  }

  private resolveCampaignId(
    fallbackCampaignId: number | null,
    variant: ReadModelVariant,
  ) {
    if (fallbackCampaignId != null) {
      return fallbackCampaignId;
    }

    // Transitional fallback: older rows may still only have the campaign id on variant.
    return variant.vkCampaignId ?? null;
  }

  private resolveAdGroupId(variant: ReadModelVariant) {
    if (variant.audience?.vkAdGroupId) {
      return variant.audience.vkAdGroupId;
    }

    // Transitional fallback: some historical rows may still rely on variant ownership.
    return variant.vkAdGroupId ?? null;
  }

  private pushGrouped(
    grouped: Map<number, ReadModelVariant[]>,
    key: number,
    variant: ReadModelVariant,
  ) {
    const items = grouped.get(key) || [];
    items.push(variant);
    grouped.set(key, items);
  }

  private toVariantRefs(variants: ReadModelVariant[]): ReadModelVariantRef[] {
    return variants.map((variant) => ({
      id: variant.id,
      variantKey: variant.variantKey,
      status: variant.status,
    }));
  }

  private uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(
      new Set(values.map((value) => String(value || '').trim()).filter(Boolean)),
    );
  }

  private firstLaunchDate(variants: ReadModelVariant[]) {
    return this.sortedLaunchDates(variants)[0]?.toISOString() ?? null;
  }

  private lastLaunchDate(variants: ReadModelVariant[]) {
    const dates = this.sortedLaunchDates(variants);
    return dates[dates.length - 1]?.toISOString() ?? null;
  }

  private sortedLaunchDates(variants: ReadModelVariant[]) {
    return variants
      .map((variant) => variant.launchDate)
      .filter((date): date is Date => date instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime());
  }
}
