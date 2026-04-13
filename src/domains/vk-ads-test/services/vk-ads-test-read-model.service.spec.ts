import { Prisma } from '@prisma/client';
import { VkAdsTestReadModelService } from './vk-ads-test-read-model.service';

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

describe('VkAdsTestReadModelService', () => {
  it('deduplicates campaigns, ad groups and banners by VK ids', async () => {
    const repository = {
      getTestVariantsForReadModel: jest.fn().mockResolvedValue({
        id: 1,
        variants: [
          createVariant(11, {
            vkCampaignId: 101,
            vkAdGroupId: 201,
            vkBannerId: 301,
            creativeName: 'Creative A',
            audienceName: 'Audience A',
            budgetLimitDay: '100',
            launchDate: new Date('2026-04-01T00:00:00.000Z'),
          }),
          createVariant(12, {
            vkCampaignId: 101,
            vkAdGroupId: 201,
            vkBannerId: 302,
            creativeName: 'Creative B',
            audienceName: 'Audience A',
            budgetLimitDay: '120',
            launchDate: new Date('2026-04-02T00:00:00.000Z'),
          }),
        ],
      }),
    };
    const service = new VkAdsTestReadModelService(repository as any);

    await expect(service.getCampaigns(1)).resolves.toEqual([
      expect.objectContaining({
        vkCampaignId: 101,
        variantCount: 2,
        creatives: ['Creative A', 'Creative B'],
        audiences: ['Audience A'],
        firstLaunchDate: '2026-04-01T00:00:00.000Z',
        lastLaunchDate: '2026-04-02T00:00:00.000Z',
      }),
    ]);
    await expect(service.getAdGroups(1)).resolves.toEqual([
      expect.objectContaining({
        vkAdGroupId: 201,
        variantCount: 2,
        currentBudgets: ['100', '120'],
      }),
    ]);
    await expect(service.getBanners(1)).resolves.toHaveLength(2);
  });
});

function createVariant(
  id: number,
  params: {
    vkCampaignId: number;
    vkAdGroupId: number;
    vkBannerId: number;
    creativeName: string;
    audienceName: string;
    budgetLimitDay: string;
    launchDate: Date;
  },
) {
  return {
    id,
    variantKey: `vat_1_${id}`,
    status: 'active',
    budgetLimitDay: new Prisma.Decimal(params.budgetLimitDay),
    launchDate: params.launchDate,
    vkCampaignId: params.vkCampaignId,
    vkAdGroupId: params.vkAdGroupId,
    vkBannerId: params.vkBannerId,
    creative: {
      name: params.creativeName,
    },
    audience: {
      name: params.audienceName,
    },
  };
}
