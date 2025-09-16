import { Test, TestingModule } from '@nestjs/testing';
import { VkAdsService } from './vk-ads.service';

describe('VkAdsService', () => {
  let service: VkAdsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VkAdsService],
    }).compile();

    service = module.get<VkAdsService>(VkAdsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
