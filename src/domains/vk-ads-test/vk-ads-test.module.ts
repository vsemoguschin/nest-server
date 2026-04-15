import { Module } from '@nestjs/common';
import { VkAdsTestClient } from './clients/vk-ads-test.client';
import { VkAdsTestRepository } from './repositories/vk-ads-test.repository';
import { VkAdsTestAuthService } from './services/vk-ads-test-auth.service';
import { VkAdsTestBuildService } from './services/vk-ads-test-build.service';
import { VkAdsTestBuilderService } from './services/vk-ads-test-builder.service';
import { VkAdsTestPlacementPlannerService } from './services/vk-ads-test-placement-planner.service';
import { VkAdsTestReadModelService } from './services/vk-ads-test-read-model.service';
import { VkAdsTestTestActionsService } from './services/vk-ads-test-test-actions.service';
import { VkAdsTestVariantActionsService } from './services/vk-ads-test-variant-actions.service';
import { VkAdsTestVariantsService } from './services/vk-ads-test-variants.service';
import { VkAdsTestVideoAssetsService } from './services/vk-ads-test-video-assets.service';
import { VkAdsTestService } from './services/vk-ads-test.service';
import {
  VkAdsTestAudiencesController,
  VkAdsTestCreativesController,
  VkAdsTestController,
  VkAdsTestIntegrationsController,
  VkAdsTestSegmentsController,
  VkAdsTestVideosController,
  VkAdsTestVariantActionsController,
} from './vk-ads-test.controller';

@Module({
  controllers: [
    VkAdsTestAudiencesController,
    VkAdsTestCreativesController,
    VkAdsTestController,
    VkAdsTestIntegrationsController,
    VkAdsTestSegmentsController,
    VkAdsTestVideosController,
    VkAdsTestVariantActionsController,
  ],
  providers: [
    VkAdsTestRepository,
    VkAdsTestService,
    VkAdsTestVariantsService,
    VkAdsTestVariantActionsService,
    VkAdsTestTestActionsService,
    VkAdsTestBuildService,
    VkAdsTestPlacementPlannerService,
    VkAdsTestReadModelService,
    VkAdsTestAuthService,
    VkAdsTestClient,
    VkAdsTestBuilderService,
    VkAdsTestVideoAssetsService,
  ],
  exports: [
    VkAdsTestRepository,
    VkAdsTestService,
    VkAdsTestVariantsService,
    VkAdsTestVariantActionsService,
    VkAdsTestTestActionsService,
    VkAdsTestBuildService,
    VkAdsTestPlacementPlannerService,
    VkAdsTestReadModelService,
    VkAdsTestAuthService,
    VkAdsTestClient,
    VkAdsTestBuilderService,
    VkAdsTestVideoAssetsService,
  ],
})
export class VkAdsTestModule {}
