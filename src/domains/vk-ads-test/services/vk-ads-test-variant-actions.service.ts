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
    const bannerId = this.resolveBannerId(variant);
    const campaignId = this.resolveCampaignId(variant);

    if (variant.status === 'paused') {
      throw new BadRequestException(`VK Ads test variant is already paused: id=${variantId}`);
    }

    try {
      if (bannerId !== null) {
        await this.client.updateBanner(variant.test.accountIntegrationId, bannerId, {
          status: 'blocked',
        });
      } else {
        await this.client.updateCampaignStatus(
          variant.test.accountIntegrationId,
          campaignId,
          'blocked',
        );
      }
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
        vkBannerId: bannerId,
        vkCampaignId: campaignId,
      },
    });

    return updated;
  }

  async resumeVariant(variantId: number) {
    const variant = await this.getVariant(variantId);
    const bannerId = this.resolveBannerId(variant);
    const campaignId = this.resolveCampaignId(variant);

    if (variant.status !== 'paused') {
      throw new BadRequestException(
        `VK Ads test variant must be paused before resume: id=${variantId}`,
      );
    }

    try {
      if (bannerId !== null) {
        await this.client.updateBanner(variant.test.accountIntegrationId, bannerId, {
          status: 'active',
        });
      } else {
        await this.client.updateCampaignStatus(
          variant.test.accountIntegrationId,
          campaignId,
          'active',
        );
      }
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
        vkBannerId: bannerId,
        vkCampaignId: campaignId,
      },
    });

    return updated;
  }

  async updateBudget(variantId: number, budgetLimitDay: number) {
    const variant = await this.getVariant(variantId);
    const adGroupId = this.resolveAdGroupId(variant);

    if (budgetLimitDay <= 0) {
      throw new BadRequestException('budgetLimitDay must be greater than 0');
    }

    if (!adGroupId) {
      throw new BadRequestException(
        `VK Ads test variant has no audience/ad group id: id=${variantId}`,
      );
    }

    const oldBudget = variant.budgetLimitDay.toString();
    const newBudget = budgetLimitDay.toString();

    try {
      await this.client.updateAdGroupBudget(
        variant.test.accountIntegrationId,
        adGroupId,
        newBudget,
      );
    } catch (error) {
      await this.logActionFailed(variant, 'update_budget', error, {
        oldBudget,
        newBudget,
        vkAdGroupId: adGroupId,
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
        vkAdGroupId: adGroupId,
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

  private resolveBannerId(variant: ActionVariant) {
    if (variant.vkBannerId) {
      return variant.vkBannerId;
    }

    return null;
  }

  private resolveCampaignId(variant: ActionVariant) {
    if (variant.test.vkCampaignId) {
      return variant.test.vkCampaignId;
    }

    if (variant.vkCampaignId) {
      // Transitional fallback: older variant rows can still carry the campaign id.
      return variant.vkCampaignId;
    }

    throw new BadRequestException(
      `VK Ads test variant has no campaign id: id=${variant.id}`,
    );
  }

  private resolveAdGroupId(variant: ActionVariant) {
    if (variant.audience?.vkAdGroupId) {
      return variant.audience.vkAdGroupId;
    }

    if (variant.vkAdGroupId) {
      // Transitional fallback: older variant rows can still carry the ad group id.
      return variant.vkAdGroupId;
    }

    return null;
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
        vkBannerId: variant.vkBannerId,
        vkCampaignId: variant.vkCampaignId,
        vkAdGroupId: variant.audience?.vkAdGroupId ?? variant.vkAdGroupId,
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
