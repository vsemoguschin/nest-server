import { Test, TestingModule } from '@nestjs/testing';
import { WbService } from './wb.service';

describe('WbService', () => {
  let service: WbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WbService],
    }).compile();

    service = module.get<WbService>(WbService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
