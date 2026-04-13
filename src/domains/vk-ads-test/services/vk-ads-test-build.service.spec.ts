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
  it('builds variants sequentially and keeps going after a failed variant', async () => {
    const repository = createRepositoryMock([
      createVariant(10),
      createVariant(11),
      createVariant(12, { creativeStatus: 'archived' }),
    ]);
    const builder = createBuilderMock();
    builder.buildOneVariant
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

    const service = new VkAdsTestBuildService(repository as any, builder as any);

    const report = await service.buildTest(1, {});

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
    expect(builder.buildOneVariant).toHaveBeenCalledTimes(2);
    expect(repository.updateVariant.mock.calls).toEqual([
      [10, { status: 'building' }],
      [
        10,
        {
          vkCampaignId: 401,
          vkAdGroupId: 501,
          vkBannerId: 601,
          vkPrimaryUrlId: 301,
          launchDate: expect.any(Date),
          status: 'active',
        },
      ],
      [11, { status: 'building' }],
      [11, { status: 'error' }],
    ]);
    expect(repository.updateTest).toHaveBeenCalledWith(1, { status: 'active' });
  });

  it('skips active variants and error variants unless rebuildErrors is enabled', async () => {
    const repository = createRepositoryMock([
      createVariant(10, { status: 'active', vkCampaignId: 401 }),
      createVariant(11, { status: 'error' }),
    ]);
    const builder = createBuilderMock();
    builder.buildOneVariant.mockResolvedValueOnce({
      testId: 1,
      audienceId: 201,
      creativeId: 101,
      variantId: 11,
      variantKey: 'vat_1_201_101',
      vkIds: {
        urlId: 301,
        campaignId: 402,
        adGroupId: 502,
        bannerId: 602,
        templateAdGroupId: 702,
        templateBannerId: 802,
      },
    });
    const service = new VkAdsTestBuildService(repository as any, builder as any);

    const skippedReport = await service.buildTest(1, {});
    expect(skippedReport.attempted).toBe(0);
    expect(builder.buildOneVariant).toHaveBeenCalledTimes(0);

    const rebuildReport = await service.buildTest(1, { rebuildErrors: true });
    expect(rebuildReport).toMatchObject({
      attempted: 1,
      succeeded: 1,
      skipped: 1,
    });
    expect(builder.buildOneVariant).toHaveBeenCalledTimes(1);
  });
});

function createRepositoryMock(variants: any[]) {
  return {
    getTestForBuild: jest.fn().mockResolvedValue({
      id: 1,
      accountIntegrationId: 5,
      accountIntegration: {
        id: 5,
        accountId: 15,
      },
      name: 'Test',
      objective: 'leadads',
      packageId: 3127,
      startBudget: new Prisma.Decimal('100'),
      landingUrl: 'https://example.com',
      variants,
    }),
    updateVariant: jest.fn().mockResolvedValue(null),
    updateTest: jest.fn().mockResolvedValue(null),
    countActiveVariants: jest.fn().mockResolvedValue(0),
    logAction: jest.fn().mockResolvedValue(null),
  };
}

function createBuilderMock() {
  return {
    buildOneVariant: jest.fn(),
  };
}

function createVariant(
  id: number,
  overrides: {
    status?: string;
    creativeStatus?: string;
    audienceStatus?: string;
    vkCampaignId?: number | null;
  } = {},
) {
  return {
    id,
    testId: 1,
    creativeId: 101,
    audienceId: 201,
    variantKey: `vat_1_201_${id}`,
    status: overrides.status ?? 'draft',
    budgetLimitDay: new Prisma.Decimal('100'),
    vkCampaignId: overrides.vkCampaignId ?? null,
    vkAdGroupId: null,
    vkBannerId: null,
    vkPrimaryUrlId: null,
    creative: {
      id: 101,
      name: 'Creative',
      title: 'Title',
      text: 'Text',
      status: overrides.creativeStatus ?? 'draft',
    },
    audience: {
      id: 201,
      name: 'Audience',
      status: overrides.audienceStatus ?? 'draft',
      sex: null,
      ageFrom: null,
      ageTo: null,
      geoJson: null,
      interestsJson: null,
    },
  };
}
