import { Test, TestingModule } from '@nestjs/testing';
import { DopsController } from './dops.controller';

describe('DopsController', () => {
  let controller: DopsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DopsController],
    }).compile();

    controller = module.get<DopsController>(DopsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
