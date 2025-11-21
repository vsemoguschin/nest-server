import { Test, TestingModule } from '@nestjs/testing';
import { PnlController } from './pnl.controller';

describe('PnlController', () => {
  let controller: PnlController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PnlController],
    }).compile();

    controller = module.get<PnlController>(PnlController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
