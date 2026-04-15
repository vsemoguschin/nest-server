import { VkAdsTestTestActionsService } from './vk-ads-test-test-actions.service';

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

describe('VkAdsTestTestActionsService', () => {
  it('pauses the test through campaign ownership and updates matching local variants', async () => {
    const repository = createRepositoryMock([
      { id: 10, status: 'active' },
      { id: 11, status: 'active' },
      { id: 12, status: 'paused' },
    ]);
    const client = createClientMock();
    const service = new VkAdsTestTestActionsService(repository as any, client as any);

    const report = await service.pauseTest(1);

    expect(client.updateCampaignStatus).toHaveBeenCalledWith(5, 401, 'blocked');
    expect(repository.updateVariant.mock.calls).toEqual([
      [10, { status: 'paused' }],
      [11, { status: 'paused' }],
    ]);
    expect(repository.updateTest).toHaveBeenCalledWith(1, { status: 'paused' });
    expect(report).toMatchObject({
      testId: 1,
      action: 'pause',
      total: 3,
      attempted: 2,
      succeeded: 2,
      failed: 0,
      skipped: 1,
    });
    expect(report.results).toEqual([
      { variantId: 10, status: 'succeeded' },
      { variantId: 11, status: 'succeeded' },
      {
        variantId: 12,
        status: 'skipped',
        errorMessage: 'variant_status_not_active',
      },
    ]);
    expect(repository.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'test_paused',
      }),
    );
    expect(repository.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'test_action_completed',
        reason: 'pause',
      }),
    );
  });

  it('resumes the test through campaign fallback when ownership ids are not backfilled', async () => {
    const repository = createRepositoryMock([
      { id: 10, status: 'paused', vkCampaignId: 401 },
      { id: 11, status: 'active' },
    ], null);
    const client = createClientMock();
    const service = new VkAdsTestTestActionsService(repository as any, client as any);

    await service.resumeTest(1);

    expect(client.updateCampaignStatus).toHaveBeenCalledWith(5, 401, 'active');
    expect(repository.updateVariant.mock.calls).toEqual([[10, { status: 'active' }]]);
    expect(repository.updateTest).toHaveBeenCalledWith(1, { status: 'active' });
  });
});

function createRepositoryMock(
  variants: Array<{ id: number; status: string; vkCampaignId?: number }>,
  vkCampaignId: number | null = 401,
) {
  return {
    getTestForActions: jest.fn().mockResolvedValue({
      id: 1,
      accountIntegrationId: 5,
      vkCampaignId,
      variants,
    }),
    updateTest: jest.fn().mockResolvedValue(null),
    updateVariant: jest.fn().mockResolvedValue(null),
    logAction: jest.fn().mockResolvedValue(null),
  };
}

function createClientMock() {
  return {
    updateCampaignStatus: jest.fn().mockResolvedValue(null),
  };
}
