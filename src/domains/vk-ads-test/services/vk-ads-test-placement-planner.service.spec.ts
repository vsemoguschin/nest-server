import { Prisma } from '@prisma/client';
import { VkAdsTestPlacementPlannerService } from './vk-ads-test-placement-planner.service';

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

describe('VkAdsTestPlacementPlannerService', () => {
  it('creates missing variant storage rows and plans placements directly from audiences x creatives', async () => {
    const repository = {
      createVariant: jest.fn().mockImplementation(async (data) => ({
        id: Math.floor(Math.random() * 1000) + 1,
        testId: data.test.connect.id,
        audienceId: data.audience.connect.id,
        creativeId: data.creative.connect.id,
        variantKey: data.variantKey,
        status: data.status,
        budgetLimitDay: data.budgetLimitDay,
      })),
    };

    const planner = new VkAdsTestPlacementPlannerService(repository as any);
    const test = {
      id: 1,
      startBudget: new Prisma.Decimal('100'),
      audiences: [
        { id: 201, name: 'Audience 1', status: 'active' },
        { id: 202, name: 'Audience 2', status: 'active' },
      ],
      creatives: [
        { id: 101, name: 'Creative 1', title: 'Title 1', text: 'Text 1' },
      ],
      variants: [],
    } as any;

    const placements = await planner.planPlacements(test);

    expect(repository.createVariant).toHaveBeenCalledTimes(2);
    expect(placements).toHaveLength(2);
    expect(placements.map((placement) => placement.placementKey)).toEqual([
      'vat_1_201_101',
      'vat_1_202_101',
    ]);
    expect(placements[0].variant.variantKey).toBe('vat_1_201_101');
    expect(placements[1].variant.variantKey).toBe('vat_1_202_101');
  });
});
