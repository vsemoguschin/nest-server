import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateAudienceDto } from './dto/create-audience.dto';
import { BuildTestDto } from './dto/build-test.dto';
import { CreateCreativeDto } from './dto/create-creative.dto';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateAudienceDto } from './dto/update-audience.dto';
import { UpdateCreativeDto } from './dto/update-creative.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { UpdateVariantBudgetDto } from './dto/update-variant-budget.dto';
import { VkAdsTestBuildService } from './services/vk-ads-test-build.service';
import { VkAdsTestReadModelService } from './services/vk-ads-test-read-model.service';
import { VkAdsTestTestActionsService } from './services/vk-ads-test-test-actions.service';
import { VkAdsTestVariantActionsService } from './services/vk-ads-test-variant-actions.service';
import { VkAdsTestVariantsService } from './services/vk-ads-test-variants.service';
import { VkAdsTestService } from './services/vk-ads-test.service';

@Controller('vk-ads-test/tests')
export class VkAdsTestController {
  constructor(
    private readonly vkAdsTestService: VkAdsTestService,
    private readonly variantsService: VkAdsTestVariantsService,
    private readonly buildService: VkAdsTestBuildService,
    private readonly readModelService: VkAdsTestReadModelService,
    private readonly testActionsService: VkAdsTestTestActionsService,
  ) {}

  @Post()
  createTest(@Body() dto: CreateTestDto) {
    return this.vkAdsTestService.createTest(dto);
  }

  @Get()
  listTests() {
    return this.vkAdsTestService.listTests();
  }

  @Get(':id/campaigns')
  getTestCampaigns(@Param('id', ParseIntPipe) id: number) {
    return this.readModelService.getCampaigns(id);
  }

  @Get(':id/ad-groups')
  getTestAdGroups(@Param('id', ParseIntPipe) id: number) {
    return this.readModelService.getAdGroups(id);
  }

  @Get(':id/banners')
  getTestBanners(@Param('id', ParseIntPipe) id: number) {
    return this.readModelService.getBanners(id);
  }

  @Get(':id')
  getTest(@Param('id', ParseIntPipe) id: number) {
    return this.vkAdsTestService.getTest(id);
  }

  @Patch(':id')
  updateTest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTestDto,
  ) {
    return this.vkAdsTestService.updateTest(id, dto);
  }

  @Post(':id/creatives')
  addCreative(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCreativeDto,
  ) {
    return this.vkAdsTestService.addCreative(id, dto);
  }

  @Patch(':id/creatives/:creativeId')
  updateCreative(
    @Param('id', ParseIntPipe) id: number,
    @Param('creativeId', ParseIntPipe) creativeId: number,
    @Body() dto: UpdateCreativeDto,
  ) {
    return this.vkAdsTestService.updateCreative(id, creativeId, dto);
  }

  @Delete(':id/creatives/:creativeId')
  removeCreative(
    @Param('id', ParseIntPipe) id: number,
    @Param('creativeId', ParseIntPipe) creativeId: number,
  ) {
    return this.vkAdsTestService.removeCreative(id, creativeId);
  }

  @Post(':id/audiences')
  addAudience(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAudienceDto,
  ) {
    return this.vkAdsTestService.addAudience(id, dto);
  }

  @Patch(':id/audiences/:audienceId')
  updateAudience(
    @Param('id', ParseIntPipe) id: number,
    @Param('audienceId', ParseIntPipe) audienceId: number,
    @Body() dto: UpdateAudienceDto,
  ) {
    return this.vkAdsTestService.updateAudience(id, audienceId, dto);
  }

  @Delete(':id/audiences/:audienceId')
  removeAudience(
    @Param('id', ParseIntPipe) id: number,
    @Param('audienceId', ParseIntPipe) audienceId: number,
  ) {
    return this.vkAdsTestService.removeAudience(id, audienceId);
  }

  @Post(':id/variants/compose')
  composeVariants(@Param('id', ParseIntPipe) id: number) {
    return this.variantsService.composeVariants(id);
  }

  @Post(':id/build')
  buildTest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BuildTestDto,
  ) {
    return this.buildService.buildTest(id, dto);
  }

  @Post(':id/pause')
  pauseTest(@Param('id', ParseIntPipe) id: number) {
    return this.testActionsService.pauseTest(id);
  }

  @Post(':id/resume')
  resumeTest(@Param('id', ParseIntPipe) id: number) {
    return this.testActionsService.resumeTest(id);
  }
}

@Controller('vk-ads-test/integrations')
export class VkAdsTestIntegrationsController {
  constructor(private readonly vkAdsTestService: VkAdsTestService) {}

  @Get()
  listIntegrations() {
    return this.vkAdsTestService.listIntegrations();
  }
}

@Controller('vk-ads-test/variants')
export class VkAdsTestVariantActionsController {
  constructor(private readonly actionsService: VkAdsTestVariantActionsService) {}

  @Post(':variantId/pause')
  pauseVariant(@Param('variantId', ParseIntPipe) variantId: number) {
    return this.actionsService.pauseVariant(variantId);
  }

  @Post(':variantId/resume')
  resumeVariant(@Param('variantId', ParseIntPipe) variantId: number) {
    return this.actionsService.resumeVariant(variantId);
  }

  @Patch(':variantId/budget')
  updateBudget(
    @Param('variantId', ParseIntPipe) variantId: number,
    @Body() dto: UpdateVariantBudgetDto,
  ) {
    return this.actionsService.updateBudget(variantId, dto.budgetLimitDay);
  }
}
