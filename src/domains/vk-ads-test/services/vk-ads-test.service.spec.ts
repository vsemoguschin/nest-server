import { VkAdsTestService } from './vk-ads-test.service';

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

describe('VkAdsTestService', () => {
  it('extends listTests output with runtime status metadata', async () => {
    const repository = {
      listTests: jest.fn().mockResolvedValue([
        {
          id: 1,
          name: 'Active test',
          status: 'draft',
          flowType: 'vk_ads',
          vkCampaignId: 401,
          audiences: [{ vkAdGroupId: 501 }],
          variants: [{ vkBannerId: 601 }],
          _count: { creatives: 1, audiences: 2, variants: 3 },
          actionLogs: [
            {
              action: 'cities_flow_created',
              payloadJson: { expectedCitiesCount: 12 },
            },
          ],
        },
        {
          id: 2,
          name: 'Missing campaign',
          status: 'draft',
          flowType: 'vk_ads',
          vkCampaignId: null,
          audiences: [],
          variants: [],
          _count: { creatives: 0, audiences: 0, variants: 0 },
          actionLogs: [],
        },
      ]),
    };

    const runtimeStatusService = {
      resolveManyTestsRuntimeState: jest.fn().mockResolvedValue([
        { testId: 1, runtimeStatus: 'active', runtimeIssue: null },
        {
          testId: 2,
          runtimeStatus: 'unknown',
          runtimeIssue: null,
        },
      ]),
    };

    const service = new VkAdsTestService(
      repository as any,
      {} as any,
      runtimeStatusService as any,
      {} as any,
      {} as any,
    );

    const tests = await service.listTests();

    expect(runtimeStatusService.resolveManyTestsRuntimeState).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 1, vkCampaignId: 401 }),
        expect.objectContaining({ id: 2, vkCampaignId: null }),
      ]),
    );
    expect(tests).toEqual([
        expect.objectContaining({
          id: 1,
          runtimeStatus: 'active',
          runtimeIssue: null,
          canToggleRuntime: true,
          expectedCitiesCount: 12,
          creativesCount: 1,
          audiencesCount: 2,
          variantsCount: 3,
        }),
      expect.objectContaining({
        id: 2,
        runtimeStatus: 'unknown',
        runtimeIssue: null,
        canToggleRuntime: false,
      }),
    ]);
  });
});
