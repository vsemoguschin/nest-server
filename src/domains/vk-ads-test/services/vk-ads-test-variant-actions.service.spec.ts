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
  it('pauses variant through campaign status and updates local status', async () => {
    const repository = createRepositoryMock(createVariant());
    const client = createClientMock();
    const service = new VkAdsTestVariantActionsService(
      repository as any,
      client as any,
    );

    await service.pauseVariant(10);

    expect(client.updateCampaignStatus).toHaveBeenCalledWith(5, 401, 'blocked');
    expect(repository.updateVariant).toHaveBeenCalledWith(10, {
      status: 'paused',
    });
    expect(repository.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'variant_paused',
        payloadJson: { vkCampaignId: 401 },
      }),
    );
  });

  it('does not resume variant unless it is paused', async () => {
    const repository = createRepositoryMock(createVariant({ status: 'active' }));
    const client = createClientMock();
    const service = new VkAdsTestVariantActionsService(
      repository as any,
      client as any,
    );

    await expect(service.resumeVariant(10)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(client.updateCampaignStatus).not.toHaveBeenCalled();
    expect(repository.updateVariant).not.toHaveBeenCalled();
  });

  it('updates ad group budget and local variant budget', async () => {
    const repository = createRepositoryMock(createVariant());
    const client = createClientMock();
    const service = new VkAdsTestVariantActionsService(
      repository as any,
      client as any,
    );

    await service.updateBudget(10, 150);

    expect(client.updateAdGroupBudget).toHaveBeenCalledWith(5, 501, '150');
    expect(repository.updateVariant).toHaveBeenCalledWith(10, {
      budgetLimitDay: new Prisma.Decimal('150'),
    });
    expect(repository.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'variant_budget_updated',
        payloadJson: {
          vkAdGroupId: 501,
          oldBudget: '100',
          newBudget: '150',
        },
      }),
    );
  });

  it('logs failed budget action and does not update local budget', async () => {
    const repository = createRepositoryMock(createVariant());
    const client = createClientMock();
    client.updateAdGroupBudget.mockRejectedValueOnce(new Error('VK failed'));
    const service = new VkAdsTestVariantActionsService(
      repository as any,
      client as any,
    );

    await expect(service.updateBudget(10, 150)).rejects.toThrow('VK failed');

    expect(client.updateAdGroupBudget).toHaveBeenCalledWith(5, 501, '150');
    expect(repository.updateVariant).not.toHaveBeenCalled();
    expect(repository.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'variant_action_failed',
        reason: 'update_budget',
        payloadJson: expect.objectContaining({
          action: 'update_budget',
          oldBudget: '100',
          newBudget: '150',
          vkAdGroupId: 501,
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
  };
}

function createVariant(
  overrides: {
    status?: string;
    vkCampaignId?: number | null;
    vkAdGroupId?: number | null;
  } = {},
) {
  return {
    id: 10,
    testId: 1,
    status: overrides.status ?? 'active',
    budgetLimitDay: new Prisma.Decimal('100'),
    vkCampaignId: overrides.vkCampaignId ?? 401,
    vkAdGroupId: overrides.vkAdGroupId ?? 501,
    test: {
      id: 1,
      accountIntegrationId: 5,
      accountIntegration: {
        id: 5,
      },
    },
  };
}
