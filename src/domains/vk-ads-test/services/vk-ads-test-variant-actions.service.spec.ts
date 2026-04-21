import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VkAdsTestVariantActionsService } from './vk-ads-test-variant-actions.service';

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

describe('VkAdsTestVariantActionsService', () => {
  it('pauses variant through banner ownership and updates local status', async () => {
    const repository = createRepositoryMock(createVariant({ vkBannerId: 601 }));
    const client = createClientMock();
    const service = new VkAdsTestVariantActionsService(
      repository as any,
      client as any,
    );

    await service.pauseVariant(10);

    expect(client.updateBanner).toHaveBeenCalledWith(5, 601, {
      status: 'blocked',
    });
    expect(repository.updateVariant).toHaveBeenCalledWith(10, {
      status: 'paused',
      runtimePauseReason: 'paused_manually',
    });
    expect(repository.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'variant_paused',
        payloadJson: { vkBannerId: 601, vkCampaignId: 401 },
      }),
    );
  });

  it('falls back to campaign status when banner id is missing', async () => {
    const repository = createRepositoryMock(
      createVariant({ status: 'paused', vkBannerId: null }),
    );
    const client = createClientMock();
    const service = new VkAdsTestVariantActionsService(
      repository as any,
      client as any,
    );

    await service.resumeVariant(10);

    expect(client.updateCampaignStatus).toHaveBeenCalledWith(5, 401, 'active');
    expect(repository.updateVariant).toHaveBeenCalledWith(10, {
      status: 'active',
      runtimePauseReason: null,
    });
  });

  it('updates ad group budget through audience ownership and local variant budget', async () => {
    const repository = createRepositoryMock(
      createVariant({
        vkBannerId: 601,
        audienceVkAdGroupId: 701,
        variantVkAdGroupId: null,
      }),
    );
    const client = createClientMock();
    const service = new VkAdsTestVariantActionsService(
      repository as any,
      client as any,
    );

    await service.updateBudget(10, 150);

    expect(client.updateAdGroupBudget).toHaveBeenCalledWith(5, 701, '150');
    expect(repository.updateVariant).toHaveBeenCalledWith(10, {
      budgetLimitDay: new Prisma.Decimal('150'),
    });
    expect(repository.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'variant_budget_updated',
        payloadJson: {
          vkAdGroupId: 701,
          oldBudget: '100',
          newBudget: '150',
        },
      }),
    );
  });

  it('logs failed budget action and does not update local budget', async () => {
    const repository = createRepositoryMock(
      createVariant({
        vkBannerId: 601,
        audienceVkAdGroupId: 701,
        variantVkAdGroupId: null,
      }),
    );
    const client = createClientMock();
    client.updateAdGroupBudget.mockRejectedValueOnce(new Error('VK failed'));
    const service = new VkAdsTestVariantActionsService(
      repository as any,
      client as any,
    );

    await expect(service.updateBudget(10, 150)).rejects.toThrow('VK failed');

    expect(client.updateAdGroupBudget).toHaveBeenCalledWith(5, 701, '150');
    expect(repository.updateVariant).not.toHaveBeenCalled();
    expect(repository.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'variant_action_failed',
        reason: 'update_budget',
        payloadJson: expect.objectContaining({
          action: 'update_budget',
          oldBudget: '100',
          newBudget: '150',
          vkAdGroupId: 701,
          errorMessage: 'VK failed',
        }),
      }),
    );
  });
});

function createRepositoryMock(variant: any) {
  return {
    findVariantForAction: jest.fn().mockResolvedValue(variant),
    updateVariant: jest.fn().mockResolvedValue(null),
    logAction: jest.fn().mockResolvedValue(null),
  };
}

function createClientMock() {
  return {
    updateCampaignStatus: jest.fn().mockResolvedValue(null),
    updateAdGroupBudget: jest.fn().mockResolvedValue(null),
    updateBanner: jest.fn().mockResolvedValue(null),
  };
}

function createVariant(
  overrides: {
    status?: string;
    vkCampaignId?: number | null;
    vkAdGroupId?: number | null;
    variantVkAdGroupId?: number | null;
    vkBannerId?: number | null;
    audienceVkAdGroupId?: number | null;
  } = {},
) {
  const campaignId = overrides.vkCampaignId ?? 401;
  const variantAdGroupId =
    overrides.variantVkAdGroupId === undefined
      ? 501
      : overrides.variantVkAdGroupId;
  const audienceAdGroupId =
    overrides.audienceVkAdGroupId === undefined
      ? variantAdGroupId
      : overrides.audienceVkAdGroupId;

  return {
    id: 10,
    testId: 1,
    status: overrides.status ?? 'active',
    budgetLimitDay: new Prisma.Decimal('100'),
    vkCampaignId: campaignId,
    vkAdGroupId: variantAdGroupId,
    vkBannerId: overrides.vkBannerId ?? null,
    test: {
      id: 1,
      accountIntegrationId: 5,
      vkCampaignId: campaignId,
      accountIntegration: {
        id: 5,
      },
    },
    audience: {
      id: 20,
      vkAdGroupId: audienceAdGroupId,
    },
  };
}
