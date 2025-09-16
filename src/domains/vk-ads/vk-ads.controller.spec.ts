import { Test, TestingModule } from '@nestjs/testing';
import { VkAdsController } from './vk-ads.controller';

describe('VkAdsController', () => {
  let controller: VkAdsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VkAdsController],
    }).compile();

    controller = module.get<VkAdsController>(VkAdsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
