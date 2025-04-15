import { Test, TestingModule } from '@nestjs/testing';
import { PlanfactController } from './planfact.controller';

describe('PlanfactController', () => {
  let controller: PlanfactController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlanfactController],
    }).compile();

    controller = module.get<PlanfactController>(PlanfactController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
