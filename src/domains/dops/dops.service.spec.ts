import { Test, TestingModule } from '@nestjs/testing';
import { DopsService } from './dops.service';

describe('DopsService', () => {
  let service: DopsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DopsService],
    }).compile();

    service = module.get<DopsService>(DopsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
