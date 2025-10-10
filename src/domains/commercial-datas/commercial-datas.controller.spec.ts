import { Test, TestingModule } from '@nestjs/testing';
import { CommercialDatasController } from './commercial-datas.controller';

describe('CommercialDatasController', () => {
  let controller: CommercialDatasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommercialDatasController],
    }).compile();

    controller = module.get<CommercialDatasController>(CommercialDatasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
