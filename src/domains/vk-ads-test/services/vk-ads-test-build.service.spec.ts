import { Prisma } from '@prisma/client';
import { VkAdsTestBuildService } from './vk-ads-test-build.service';

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

describe('VkAdsTestBuildService', () => {
  it('builds placements sequentially, keeps going after a failed placement and stores per-variant refs', async () => {
    const repository = createRepositoryMock([
      createVariant(10, 101, 201),
      createVariant(11, 102, 201),
      createVariant(12, 103, 201, { creativeStatus: 'archived' }),
    ]);
    const planner = createPlannerMock();
    const builder = createBuilderMock();
    builder.buildPlacement
      .mockResolvedValueOnce({
        testId: 1,
        audienceId: 201,
        creativeId: 101,
        variantId: 10,
        variantKey: 'vat_1_201_101',
        vkIds: {
          urlId: 301,
          campaignId: 401,
          adGroupId: 501,
          bannerId: 601,
          templateAdGroupId: 701,
          templateBannerId: 801,
        },
      })
      .mockRejectedValueOnce(new Error('VK runtime failed'));

    const service = new VkAdsTestBuildService(
      repository as any,
      planner as any,
      builder as any,
    );

    const report = await service.buildTest(1, {});

    expect(builder.buildPlacement).toHaveBeenCalledTimes(2);
    expect(builder.buildPlacement.mock.calls[0][0]).toMatchObject({
      ref: 'vat_1_201_101',
      existingIds: expect.objectContaining({
        testId: 1,
        audienceId: 201,
        creativeId: 101,
        variantId: 10,
      }),
    });
    expect(builder.buildPlacement.mock.calls[1][0]).toMatchObject({
      ref: 'vat_1_201_102',
      existingIds: expect.objectContaining({
        campaignId: 401,
        adGroupId: 501,
      }),
    });
    expect(repository.updateTestRuntimeIds.mock.calls).toEqual([
      [1, { vkPrimaryUrlId: 301 }, expect.any(Object)],
    ]);
    expect(report).toMatchObject({
      testId: 1,
      totalRequested: 3,
      attempted: 2,
      succeeded: 1,
      failed: 1,
      skipped: 1,
    });
    expect(report.results).toEqual([
      expect.objectContaining({
        variantId: 10,
        status: 'succeeded',
        vkCampaignId: 401,
      }),
      expect.objectContaining({
        variantId: 11,
        status: 'failed',
        errorMessage: 'VK runtime failed',
      }),
      expect.objectContaining({
        variantId: 12,
        status: 'skipped',
        errorMessage: 'creative_archived',
      }),
    ]);
    expect(repository.updateVariant.mock.calls).toEqual([
      [10, { status: 'building' }],
      [
        10,
        {
          vkCampaignId: 401,
          vkAdGroupId: 501,
          vkBannerId: 601,
          vkPrimaryUrlId: 301,
          ref: 'vat_1_201_101',
          launchDate: expect.any(Date),
          status: 'active',
        },
        expect.any(Object),
      ],
      [11, { status: 'building' }],
      [11, { status: 'error' }],
    ]);
    expect(repository.updateTest).toHaveBeenCalledWith(1, { status: 'active' });
  });

  it('skips active placements and error placements unless rebuildErrors is enabled', async () => {
    const repository = createRepositoryMock([
      createVariant(10, 101, 201, { status: 'active', vkCampaignId: 401 }),
      createVariant(11, 102, 201, { status: 'error' }),
      createVariant(12, 103, 201, { creativeStatus: 'archived' }),
    ]);
    const planner = createPlannerMock();
    const builder = createBuilderMock();
    builder.buildPlacement.mockResolvedValueOnce({
      testId: 1,
      audienceId: 201,
      creativeId: 102,
      variantId: 11,
      variantKey: 'vat_1_201_102',
      vkIds: {
        urlId: 301,
        campaignId: 402,
        adGroupId: 502,
        bannerId: 602,
        templateAdGroupId: 702,
        templateBannerId: 802,
      },
    });
    const service = new VkAdsTestBuildService(
      repository as any,
      planner as any,
      builder as any,
    );

    const skippedReport = await service.buildTest(1, {});
    expect(skippedReport.attempted).toBe(0);
    expect(builder.buildPlacement).toHaveBeenCalledTimes(0);

    const rebuildReport = await service.buildTest(1, { rebuildErrors: true });
    expect(rebuildReport).toMatchObject({
      attempted: 1,
      succeeded: 1,
      skipped: 2,
    });
    expect(builder.buildPlacement).toHaveBeenCalledTimes(1);
  });
});

function createRepositoryMock(variants: any[]) {
  const tx = {
    vkAdsTest: {
      update: jest.fn().mockResolvedValue(null),
    },
    vkAdsTestAudience: {
      update: jest.fn().mockResolvedValue(null),
    },
    vkAdsTestVariant: {
      update: jest.fn().mockResolvedValue(null),
    },
    vkAdsTestActionLog: {
      create: jest.fn().mockResolvedValue(null),
    },
  };

  return {
    getTestForBuild: jest.fn().mockResolvedValue({
      id: 1,
      accountIntegrationId: 5,
      vkCampaignId: 401,
      vkPrimaryUrlId: null,
      accountIntegration: {
        id: 5,
        accountId: 15,
      },
      name: 'Test',
      objective: 'leadads',
      packageId: 3127,
      startBudget: new Prisma.Decimal('100'),
      landingUrl: 'https://example.com',
      creatives: [
        {
          id: 101,
          name: 'Creative 1',
          title: 'Title 1',
          text: 'Text 1',
          status: 'active',
        },
        {
          id: 102,
          name: 'Creative 2',
          title: 'Title 2',
          text: 'Text 2',
          status: 'active',
        },
        {
          id: 103,
          name: 'Creative 3',
          title: 'Title 3',
          text: 'Text 3',
          status: 'archived',
        },
      ],
      audiences: [
        {
          id: 201,
          name: 'Audience',
          status: 'active',
          sex: null,
          ageFrom: null,
          ageTo: null,
          geoJson: null,
          interestsJson: null,
        },
      ],
      variants,
    }),
    findTestRuntimeIds: jest.fn().mockResolvedValue({
      id: 1,
      vkCampaignId: 401,
      vkPrimaryUrlId: null,
    }),
    transaction: jest.fn(async (fn) => fn(tx as any)),
    updateVariant: jest.fn().mockResolvedValue(null),
    updateTestRuntimeIds: jest.fn().mockResolvedValue(null),
    updateAudienceRuntimeIds: jest.fn().mockResolvedValue(null),
    updateTest: jest.fn().mockResolvedValue(null),
    countActiveVariants: jest.fn().mockResolvedValue(0),
    logAction: jest.fn().mockResolvedValue(null),
  };
}

function createPlannerMock() {
  return {
    planPlacements: jest.fn().mockImplementation((test, variantIds?: number[]) => {
      const placements = test.creatives.flatMap((creative: any) =>
        test.audiences.map((audience: any) => {
          const variant = test.variants.find(
            (item: any) =>
              item.audienceId === audience.id && item.creativeId === creative.id,
          );

          if (!variant) {
            throw new Error(
              `VK Ads test is missing variant storage for placement vat_${test.id}_${audience.id}_${creative.id}`,
            );
          }

          return {
            placementKey: `vat_${test.id}_${audience.id}_${creative.id}`,
            audienceId: audience.id,
            creativeId: creative.id,
            audience,
            creative,
            variant,
          };
        }),
      );

      if (!variantIds?.length) {
        return placements;
      }

      const requested = new Set(variantIds);
      return placements.filter((placement: any) => requested.has(placement.variant.id));
    }),
  };
}

function createBuilderMock() {
  return {
    prepareLandingUrl: jest.fn().mockResolvedValue({ id: 999 }),
    buildPlacement: jest.fn(),
  };
}

function createVariant(
  id: number,
  creativeId: number,
  audienceId: number,
  overrides: {
    status?: string;
    creativeStatus?: string;
    audienceStatus?: string;
    vkCampaignId?: number | null;
    vkAdGroupId?: number | null;
  } = {},
) {
  return {
    id,
    testId: 1,
    creativeId,
    audienceId,
    variantKey: `vat_1_${audienceId}_${creativeId}`,
    status: overrides.status ?? 'draft',
    budgetLimitDay: new Prisma.Decimal('100'),
    vkCampaignId: overrides.vkCampaignId ?? null,
    vkAdGroupId: overrides.vkAdGroupId ?? null,
    vkBannerId: null,
    vkPrimaryUrlId: null,
    creative: {
      id: creativeId,
      name: `Creative ${creativeId}`,
      title: `Title ${creativeId}`,
      text: `Text ${creativeId}`,
      status: overrides.creativeStatus ?? 'draft',
    },
    audience: {
      id: audienceId,
      name: `Audience ${audienceId}`,
      status: overrides.audienceStatus ?? 'draft',
      sex: null,
      ageFrom: null,
      ageTo: null,
      geoJson: null,
      interestsJson: null,
    },
  };
}
