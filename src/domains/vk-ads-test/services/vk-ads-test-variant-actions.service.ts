import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VkAdsTestClient } from '../clients/vk-ads-test.client';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';

type ActionVariant = NonNullable<
  Awaited<ReturnType<VkAdsTestRepository['findVariantForAction']>>
>;

@Injectable()
export class VkAdsTestVariantActionsService {
  constructor(
    private readonly repository: VkAdsTestRepository,
    private readonly client: VkAdsTestClient,
  ) {}

  async pauseVariant(variantId: number) {
    const variant = await this.getVariant(variantId);
    this.assertHasCampaign(variant);

    if (variant.status === 'paused') {
      throw new BadRequestException(`VK Ads test variant is already paused: id=${variantId}`);
    }

    try {
      await this.client.updateCampaignStatus(
        variant.test.accountIntegrationId,
        variant.vkCampaignId as number,
        'blocked',
      );
    } catch (error) {
      await this.logActionFailed(variant, 'pause', error);
      throw error;
    }

    const updated = await this.repository.updateVariant(variant.id, {
      status: 'paused',
    });

    await this.repository.logAction({
      test: { connect: { id: variant.testId } },
      variant: { connect: { id: variant.id } },
      action: 'variant_paused',
      payloadJson: {
        vkCampaignId: variant.vkCampaignId,
      },
    });

    return updated;
  }

  async resumeVariant(variantId: number) {
    const variant = await this.getVariant(variantId);
    this.assertHasCampaign(variant);

    if (variant.status !== 'paused') {
      throw new BadRequestException(
        `VK Ads test variant must be paused before resume: id=${variantId}`,
      );
    }

    try {
      await this.client.updateCampaignStatus(
        variant.test.accountIntegrationId,
        variant.vkCampaignId as number,
        'active',
      );
    } catch (error) {
      await this.logActionFailed(variant, 'resume', error);
      throw error;
    }

    const updated = await this.repository.updateVariant(variant.id, {
      status: 'active',
    });

    await this.repository.logAction({
      test: { connect: { id: variant.testId } },
      variant: { connect: { id: variant.id } },
      action: 'variant_resumed',
      payloadJson: {
        vkCampaignId: variant.vkCampaignId,
      },
    });

    return updated;
  }

  async updateBudget(variantId: number, budgetLimitDay: number) {
    const variant = await this.getVariant(variantId);

    if (budgetLimitDay <= 0) {
      throw new BadRequestException('budgetLimitDay must be greater than 0');
    }

    if (!variant.vkAdGroupId) {
      throw new BadRequestException(
        `VK Ads test variant has no vkAdGroupId: id=${variantId}`,
      );
    }

    const oldBudget = variant.budgetLimitDay.toString();
    const newBudget = budgetLimitDay.toString();

    try {
      await this.client.updateAdGroupBudget(
        variant.test.accountIntegrationId,
        variant.vkAdGroupId,
        newBudget,
      );
    } catch (error) {
      await this.logActionFailed(variant, 'update_budget', error, {
        oldBudget,
        newBudget,
        vkAdGroupId: variant.vkAdGroupId,
      });
      throw error;
    }

    const updated = await this.repository.updateVariant(variant.id, {
      budgetLimitDay: new Prisma.Decimal(newBudget),
    });

    await this.repository.logAction({
      test: { connect: { id: variant.testId } },
      variant: { connect: { id: variant.id } },
      action: 'variant_budget_updated',
      payloadJson: {
        vkAdGroupId: variant.vkAdGroupId,
        oldBudget,
        newBudget,
      },
    });

    return updated;
  }

  private async getVariant(variantId: number) {
    const variant = await this.repository.findVariantForAction(variantId);

    if (!variant) {
      throw new NotFoundException(`VK Ads test variant not found: id=${variantId}`);
    }

    return variant;
  }

  private assertHasCampaign(variant: ActionVariant) {
    if (!variant.vkCampaignId) {
      throw new BadRequestException(
        `VK Ads test variant has no vkCampaignId: id=${variant.id}`,
      );
    }
  }

  private async logActionFailed(
    variant: ActionVariant,
    action: string,
    error: unknown,
    payload: Record<string, unknown> = {},
  ) {
    await this.repository.logAction({
      test: { connect: { id: variant.testId } },
      variant: { connect: { id: variant.id } },
      action: 'variant_action_failed',
      reason: action,
      payloadJson: {
        action,
        vkCampaignId: variant.vkCampaignId,
        vkAdGroupId: variant.vkAdGroupId,
        errorMessage: this.toShortErrorMessage(error),
        ...payload,
      },
    });
  }

  private toShortErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 500);
  }
}
