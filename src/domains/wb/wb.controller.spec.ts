import { Test, TestingModule } from '@nestjs/testing';
import { WbController } from './wb.controller';

describe('WbController', () => {
  let controller: WbController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WbController],
    }).compile();

    controller = module.get<WbController>(WbController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
