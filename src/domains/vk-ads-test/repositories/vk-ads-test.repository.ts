import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class VkAdsTestRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: PrismaTx) => Promise<T>) {
    return this.prisma.$transaction(fn);
  }

  createIntegration(data: Prisma.VkAdsAccountIntegrationCreateInput) {
    return this.prisma.vkAdsAccountIntegration.create({ data });
  }

  findActiveIntegrationByAccountId(accountId: number) {
    return this.prisma.vkAdsAccountIntegration.findFirst({
      where: {
        accountId,
        isActive: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
  }

  findIntegrationById(id: number) {
    return this.prisma.vkAdsAccountIntegration.findUnique({
      where: { id },
    });
  }

  listActiveIntegrations() {
    return this.prisma.vkAdsAccountIntegration.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      include: {
        account: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });
  }

  listAudiencesForSelection(accountIntegrationId?: number) {
    return this.prisma.vkAdsTestAudience.findMany({
      where: {
        status: {
          not: 'archived',
        },
        ...(accountIntegrationId !== undefined
          ? {
              test: {
                accountIntegrationId,
              },
            }
          : {}),
      },
      orderBy: [{ testId: 'desc' }, { id: 'asc' }],
      include: {
        test: {
          select: {
            id: true,
            name: true,
            accountIntegrationId: true,
          },
        },
      },
    });
  }

  findTestById(id: number, tx: PrismaTx | PrismaService = this.prisma) {
    return tx.vkAdsTest.findUnique({
      where: { id },
    });
  }

  findTestRuntimeIds(id: number, tx: PrismaTx | PrismaService = this.prisma) {
    return tx.vkAdsTest.findUnique({
      where: { id },
      select: {
        id: true,
        vkPrimaryUrlId: true,
        vkCampaignId: true,
      },
    });
  }

  createTest(data: Prisma.VkAdsTestCreateInput | Record<string, any>) {
    return this.prisma.vkAdsTest.create({
      data: this.normalizeTestCreateInput(data),
    });
  }

  listTests() {
    return this.prisma.vkAdsTest.findMany({
      orderBy: { id: 'desc' },
      include: {
        _count: {
          select: {
            creatives: true,
            audiences: true,
            variants: true,
          },
        },
        actionLogs: {
          where: {
            action: 'cities_flow_created',
          },
          select: {
            action: true,
            payloadJson: true,
          },
          take: 1,
        },
      },
    });
  }

  getTestCard(id: number) {
    return this.prisma.vkAdsTest.findUnique({
      where: { id },
      include: {
        creatives: {
          orderBy: { id: 'asc' },
          include: {
            videoAsset: true,
          },
        },
        audiences: { orderBy: { id: 'asc' } },
        videoAssets: { orderBy: { id: 'desc' } },
        accountIntegration: {
          include: {
            account: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        variants: {
          orderBy: { id: 'asc' },
          include: {
            creative: {
              include: {
                videoAsset: true,
              },
            },
            audience: true,
          },
        },
        actionLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
  }

  getTestForBuild(id: number) {
    return this.prisma.vkAdsTest.findUnique({
      where: { id },
      include: {
        accountIntegration: true,
        creatives: {
          orderBy: { id: 'asc' },
          include: {
            videoAsset: true,
          },
        },
        audiences: {
          orderBy: { id: 'asc' },
        },
        variants: {
          orderBy: { id: 'asc' },
          include: {
            creative: {
              include: {
                videoAsset: true,
              },
            },
            audience: true,
          },
        },
      },
    });
  }

  getTestForActions(id: number) {
    return this.prisma.vkAdsTest.findUnique({
      where: { id },
      include: {
        variants: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            runtimePauseReason: true,
            vkBannerId: true,
          },
        },
      },
    });
  }

  getTestForRuntimeActions(id: number) {
    return this.prisma.vkAdsTest.findUnique({
      where: { id },
      select: {
        id: true,
        accountIntegrationId: true,
        vkCampaignId: true,
        audiences: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            runtimePauseReason: true,
            vkAdGroupId: true,
          },
        },
        variants: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            runtimePauseReason: true,
            vkBannerId: true,
          },
        },
      },
    });
  }

  getTestForCitiesSettings(id: number) {
    return this.prisma.vkAdsTest.findUnique({
      where: { id },
      select: {
        id: true,
        vkCampaignId: true,
        accountIntegrationId: true,
        flowType: true,
        status: true,
        startBudget: true,
        audiences: {
          where: {
            vkAdGroupId: { not: null },
            status: { notIn: ['archived', 'deleted'] },
          },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            vkAdGroupId: true,
            sex: true,
            ageFrom: true,
            ageTo: true,
            status: true,
          },
        },
      },
    });
  }

  updateAudiencesCitiesSettings(
    audienceIds: number[],
    data: { sex?: string | null; ageFrom?: number | null; ageTo?: number | null },
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return tx.vkAdsTestAudience.updateMany({
      where: { id: { in: audienceIds } },
      data,
    });
  }

  getTestVariantsForReadModel(id: number) {
    return this.prisma.vkAdsTest.findUnique({
      where: { id },
      select: {
        id: true,
        variants: {
          orderBy: { id: 'asc' },
          include: {
            creative: true,
            audience: true,
          },
        },
      },
    });
  }

  getTestForOwnershipReadModel(id: number) {
    return this.prisma.vkAdsTest.findUnique({
      where: { id },
      include: {
        audiences: {
          orderBy: { id: 'asc' },
        },
        variants: {
          orderBy: { id: 'asc' },
          include: {
            creative: true,
            audience: true,
          },
        },
      },
    });
  }

  createAudience(
    data: Prisma.VkAdsTestAudienceCreateInput | Record<string, any>,
  ) {
    return this.prisma.vkAdsTestAudience.create({
      data: this.normalizeAudienceCreateInput(data),
    });
  }

  updateAudience(
    id: number,
    data: Prisma.VkAdsTestAudienceUpdateInput | Record<string, any>,
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return tx.vkAdsTestAudience.update({
      where: { id },
      data,
    });
  }

  findAudience(testId: number, id: number) {
    return this.prisma.vkAdsTestAudience.findFirst({
      where: { id, testId },
    });
  }

  findAudienceRuntimeIds(testId: number, id: number) {
    return this.prisma.vkAdsTestAudience.findFirst({
      where: { id, testId },
      select: {
        id: true,
        vkAdGroupId: true,
      },
    });
  }

  createCreative(
    data: Prisma.VkAdsTestCreativeCreateInput | Record<string, any>,
  ) {
    return this.prisma.vkAdsTestCreative.create({
      data: this.normalizeCreativeCreateInput(data),
    });
  }

  updateCreative(
    id: number,
    data: Prisma.VkAdsTestCreativeUpdateInput,
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return tx.vkAdsTestCreative.update({
      where: { id },
      data,
    });
  }

  findCreative(testId: number, id: number) {
    return this.prisma.vkAdsTestCreative.findFirst({
      where: { id, testId },
      include: {
        videoAsset: true,
      },
    });
  }

  findCreativeById(id: number) {
    return this.prisma.vkAdsTestCreative.findUnique({
      where: { id },
      include: {
        test: true,
        videoAsset: true,
      },
    });
  }

  createVideoAsset(
    data: Prisma.VkAdsTestVideoAssetCreateInput,
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return tx.vkAdsTestVideoAsset.create({ data });
  }

  updateVideoAsset(
    id: number,
    data: Prisma.VkAdsTestVideoAssetUpdateInput,
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return tx.vkAdsTestVideoAsset.update({
      where: { id },
      data,
    });
  }

  findVideoAsset(id: number) {
    return this.prisma.vkAdsTestVideoAsset.findUnique({
      where: { id },
      include: {
        test: true,
      },
    });
  }

  findVideoAssetByTest(testId: number, id: number) {
    return this.prisma.vkAdsTestVideoAsset.findFirst({
      where: {
        id,
        testId,
      },
    });
  }

  findVideoAssetByIntegration(accountIntegrationId: number, id: number) {
    return this.prisma.vkAdsTestVideoAsset.findFirst({
      where: {
        id,
        accountIntegrationId,
      },
    });
  }

  listVideoAssetsByTest(testId: number) {
    return this.prisma.vkAdsTestVideoAsset.findMany({
      where: { testId },
      orderBy: { id: 'desc' },
    });
  }

  listVideoAssetsByIntegration(accountIntegrationId: number) {
    return this.prisma.vkAdsTestVideoAsset.findMany({
      where: { accountIntegrationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  createVariant(
    data: Prisma.VkAdsTestVariantCreateInput | Record<string, any>,
  ) {
    return this.prisma.vkAdsTestVariant.create({
      data: this.normalizeVariantCreateInput(data),
    });
  }

  updateVariant(
    id: number,
    data: Prisma.VkAdsTestVariantUpdateInput | Record<string, any>,
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return tx.vkAdsTestVariant.update({
      where: { id },
      data,
    });
  }

  findVariantForAction(id: number) {
    return this.prisma.vkAdsTestVariant.findUnique({
      where: { id },
      include: {
        test: {
          include: {
            accountIntegration: true,
          },
        },
        creative: true,
        audience: true,
      },
    });
  }

  findComposedInput(
    testId: number,
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return tx.vkAdsTest.findUnique({
      where: { id: testId },
      include: {
        creatives: {
          where: { status: { in: ['draft', 'ready'] } },
          orderBy: { id: 'asc' },
        },
        audiences: {
          where: { status: { in: ['draft', 'ready'] } },
          orderBy: { id: 'asc' },
        },
      },
    });
  }

  createVariantsMany(
    data: Prisma.VkAdsTestVariantCreateManyInput[],
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return tx.vkAdsTestVariant.createMany({
      data,
      skipDuplicates: true,
    });
  }

  countVariants(testId: number, tx: PrismaTx | PrismaService = this.prisma) {
    return tx.vkAdsTestVariant.count({
      where: { testId },
    });
  }

  countActiveVariants(
    testId: number,
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return tx.vkAdsTestVariant.count({
      where: {
        testId,
        status: 'active',
      },
    });
  }

  updateTest(
    id: number,
    data: Prisma.VkAdsTestUpdateInput,
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return tx.vkAdsTest.update({
      where: { id },
      data,
    });
  }

  updateTestRuntimeIds(
    id: number,
    data: Partial<
      Pick<Prisma.VkAdsTestUpdateInput, 'vkCampaignId' | 'vkPrimaryUrlId'>
    >,
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return this.updateTest(id, data, tx);
  }

  updateAudienceRuntimeIds(
    id: number,
    data: Pick<Prisma.VkAdsTestAudienceUpdateInput, 'vkAdGroupId'>,
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return this.updateAudience(id, data, tx);
  }

  logAction(
    data: Prisma.VkAdsTestActionLogCreateInput,
    tx: PrismaTx | PrismaService = this.prisma,
  ) {
    return tx.vkAdsTestActionLog.create({ data });
  }

  private normalizeTestCreateInput(
    data: Prisma.VkAdsTestCreateInput | Record<string, any>,
  ): Prisma.VkAdsTestCreateInput {
    const raw = data as Record<string, any>;
    const accountIntegrationId =
      raw.accountIntegration?.connect?.id ??
      raw.integration?.connect?.id ??
      raw.accountIntegrationId;

    return {
      accountIntegration: { connect: { id: accountIntegrationId } },
      flowType: raw.flowType ?? 'vk_ads',
      name: raw.name,
      status: raw.status ?? 'draft',
      objective: raw.objective ?? 'socialengagement',
      packageId: raw.packageId ?? 3127,
      startBudget: raw.startBudget ?? raw.budgetDay ?? 0.01,
      landingUrl: raw.landingUrl,
    };
  }

  private normalizeAudienceCreateInput(
    data: Prisma.VkAdsTestAudienceCreateInput | Record<string, any>,
  ): Prisma.VkAdsTestAudienceCreateInput {
    const raw = data as Record<string, any>;

    return {
      test: data.test,
      name: data.name,
      vkSegmentId: data.vkSegmentId,
      includeSegmentIds: data.includeSegmentIds,
      excludeSegmentIds: data.excludeSegmentIds,
      sex: data.sex,
      ageFrom: data.ageFrom,
      ageTo: data.ageTo,
      geoJson: data.geoJson,
      interestsJson: data.interestsJson,
      status: data.status ?? 'draft',
      runtimePauseReason: raw.runtimePauseReason,
    } as Prisma.VkAdsTestAudienceCreateInput;
  }

  private normalizeCreativeCreateInput(
    data: Prisma.VkAdsTestCreativeCreateInput | Record<string, any>,
  ): Prisma.VkAdsTestCreativeCreateInput {
    const raw = data as Record<string, any>;
    const vkContentId =
      raw.vkContentId ??
      raw.videoContentId ??
      raw.imageContentId ??
      raw.iconContentId ??
      raw.leadFormId;

    return {
      test: raw.test,
      ...(raw.videoAssetId !== undefined
        ? { videoAsset: { connect: { id: raw.videoAssetId } } }
        : {}),
      name: raw.name,
      title: raw.title,
      text: raw.text,
      videoSourceUrl: raw.videoSourceUrl,
      vkContentId: vkContentId === undefined ? undefined : String(vkContentId),
      status: raw.status ?? 'draft',
    };
  }

  private normalizeVariantCreateInput(
    data: Prisma.VkAdsTestVariantCreateInput | Record<string, any>,
  ): Prisma.VkAdsTestVariantCreateInput {
    const raw = data as Record<string, any>;

    return {
      test: raw.test,
      audience: raw.audience,
      creative: raw.creative,
      variantKey: raw.variantKey,
      ref: raw.ref,
      status: raw.status ?? 'draft',
      budgetLimitDay: raw.budgetLimitDay ?? raw.currentBudgetDay ?? 0.01,
      runtimePauseReason: raw.runtimePauseReason,
      vkCampaignId: raw.vkCampaignId,
      vkAdGroupId: raw.vkAdGroupId,
      vkBannerId: raw.vkBannerId,
      vkPrimaryUrlId: raw.vkPrimaryUrlId,
      launchDate: raw.launchDate,
    } as Prisma.VkAdsTestVariantCreateInput;
  }
}
