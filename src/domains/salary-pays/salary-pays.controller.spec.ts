import { Test, TestingModule } from '@nestjs/testing';
import { SalaryPaysController } from './salary-pays.controller';

describe('SalaryPaysController', () => {
  let controller: SalaryPaysController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalaryPaysController],
    }).compile();

    controller = module.get<SalaryPaysController>(SalaryPaysController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
