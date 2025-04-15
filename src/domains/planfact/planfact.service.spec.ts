import { Test, TestingModule } from '@nestjs/testing';
import { PlanfactService } from './planfact.service';

describe('PlanfactService', () => {
  let service: PlanfactService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlanfactService],
    }).compile();

    service = module.get<PlanfactService>(PlanfactService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
