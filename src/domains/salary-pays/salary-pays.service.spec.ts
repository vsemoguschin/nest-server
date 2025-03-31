import { Test, TestingModule } from '@nestjs/testing';
import { SalaryPaysService } from './salary-pays.service';

describe('SalaryPaysService', () => {
  let service: SalaryPaysService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SalaryPaysService],
    }).compile();

    service = module.get<SalaryPaysService>(SalaryPaysService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
