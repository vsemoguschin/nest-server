import { Injectable, NotFoundException } from '@nestjs/common';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';

@Injectable()
export class VkAdsTestVariantsService {
  constructor(private readonly repository: VkAdsTestRepository) {}

  async composeVariants(testId: number) {
    const result = await this.repository.transaction(async (tx) => {
      const test = await this.repository.findComposedInput(testId, tx);

      if (!test) {
        throw new NotFoundException(`VK Ads test not found: id=${testId}`);
      }

      const variantInputs = test.creatives.flatMap((creative) =>
        test.audiences.map((audience) => ({
          testId: test.id,
          creativeId: creative.id,
          audienceId: audience.id,
          variantKey: this.buildVariantKey(test.id, audience.id, creative.id),
          status: 'draft',
          budgetLimitDay: test.startBudget,
        })),
      );

      const created =
        variantInputs.length > 0
          ? await this.repository.createVariantsMany(variantInputs, tx)
          : { count: 0 };

      const variantsCount = await this.repository.countVariants(test.id, tx);

      if (variantsCount > 0 && test.status === 'draft') {
        await this.repository.updateTest(test.id, { status: 'ready' }, tx);
      }

      await this.repository.logAction(
        {
          test: { connect: { id: test.id } },
          action: 'variants_composed',
          payloadJson: {
            creativesCount: test.creatives.length,
            audiencesCount: test.audiences.length,
            targetPairsCount: variantInputs.length,
            createdCount: created.count,
            variantsCount,
          },
        },
        tx,
      );

      return {
        createdCount: created.count,
        variantsCount,
        targetPairsCount: variantInputs.length,
      };
    });

    return {
      ...result,
      test: await this.repository.getTestCard(testId),
    };
  }

  private buildVariantKey(testId: number, audienceId: number, creativeId: number) {
    return `vat_${testId}_${audienceId}_${creativeId}`;
  }
}
