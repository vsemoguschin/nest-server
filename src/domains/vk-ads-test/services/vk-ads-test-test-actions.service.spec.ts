import { VkAdsTestTestActionsService } from './vk-ads-test-test-actions.service';

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

describe('VkAdsTestTestActionsService', () => {
  it('pauses the test switch as a full-tree toggle', async () => {
    const repository = createRepositoryMock();
    const client = createClientMock();
    const service = new VkAdsTestTestActionsService(
      repository as any,
      client as any,
    );

    const report = await service.pauseTest(1);

    expect(client.updateAdPlan).toHaveBeenCalledWith(5, 401, {
      status: 'blocked',
    });
    expect(client.updateAdGroup).toHaveBeenCalledTimes(2);
    expect(client.updateBanner).toHaveBeenCalledTimes(2);
    expect(repository.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'test_paused',
        payloadJson: {
          campaign: { id: 401, status: 'blocked' },
          adGroups: { total: 2, succeeded: 2, failed: 0 },
          banners: { total: 2, succeeded: 2, failed: 0 },
        },
      }),
    );
    expect(report).toEqual({
      testId: 1,
      action: 'pause',
      campaign: { id: 401, status: 'blocked' },
      adGroups: { total: 2, succeeded: 2, failed: 0 },
      banners: { total: 2, succeeded: 2, failed: 0 },
    });
  });

  it('resumes the full runtime tree', async () => {
    const repository = createRepositoryMock({
      vkCampaignId: 402,
      audiences: [
        { id: 21, vkAdGroupId: 502 },
        { id: 22, vkAdGroupId: 503 },
      ],
      variants: [
        { id: 31, vkBannerId: 602 },
        { id: 32, vkBannerId: 603 },
      ],
    });
    const client = createClientMock();
    const service = new VkAdsTestTestActionsService(
      repository as any,
      client as any,
    );

    const report = await service.resumeTest(1);

    expect(client.updateAdPlan).toHaveBeenCalledWith(5, 402, {
      status: 'active',
    });
    expect(client.updateAdGroup).toHaveBeenCalledTimes(2);
    expect(client.updateAdGroup).toHaveBeenCalledWith(5, 502, {
      status: 'active',
    });
    expect(client.updateAdGroup).toHaveBeenCalledWith(5, 503, {
      status: 'active',
    });
    expect(client.updateBanner).toHaveBeenCalledTimes(2);
    expect(client.updateBanner).toHaveBeenCalledWith(5, 602, {
      status: 'active',
    });
    expect(client.updateBanner).toHaveBeenCalledWith(5, 603, {
      status: 'active',
    });
    expect(report.adGroups).toEqual({ total: 2, succeeded: 2, failed: 0 });
    expect(report.banners).toEqual({ total: 2, succeeded: 2, failed: 0 });
  });

  it('rejects actions when vkCampaignId is missing', async () => {
    const repository = createRepositoryMock({
      vkCampaignId: null,
      audiences: [],
      variants: [],
    });
    const client = createClientMock();
    const service = new VkAdsTestTestActionsService(
      repository as any,
      client as any,
    );

    await expect(service.pauseTest(1)).rejects.toThrow(
      'VK Ads test has no vkCampaignId: id=1',
    );
    expect(client.updateAdPlan).not.toHaveBeenCalled();
  });
});

function createRepositoryMock(overrides: {
  vkCampaignId?: number | null;
  audiences?: Array<{
    id: number;
    vkAdGroupId: number | null;
  }>;
  variants?: Array<{
    id: number;
    vkBannerId: number | null;
  }>;
} = {}) {
  return {
    getTestForRuntimeActions: jest.fn().mockResolvedValue({
      id: 1,
      accountIntegrationId: 5,
      vkCampaignId:
        overrides.vkCampaignId === undefined ? 401 : overrides.vkCampaignId,
      audiences: overrides.audiences ?? [
        { id: 21, vkAdGroupId: 501 },
        { id: 22, vkAdGroupId: 502 },
      ],
      variants: overrides.variants ?? [
        { id: 31, vkBannerId: 601 },
        { id: 32, vkBannerId: 602 },
      ],
    }),
    logAction: jest.fn().mockResolvedValue(null),
  };
}

function createClientMock() {
  return {
    updateAdPlan: jest.fn().mockResolvedValue(null),
    updateAdGroup: jest.fn().mockResolvedValue(null),
    updateBanner: jest.fn().mockResolvedValue(null),
    getAdGroup: jest.fn().mockResolvedValue({ status: 'active' }),
    getBanner: jest.fn().mockResolvedValue({ status: 'active' }),
  };
}
