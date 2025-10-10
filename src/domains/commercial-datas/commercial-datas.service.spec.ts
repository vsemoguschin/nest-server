import { Test, TestingModule } from '@nestjs/testing';
import { CommercialDatasService } from './commercial-datas.service';

describe('CommercialDatasService', () => {
  let service: CommercialDatasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommercialDatasService],
    }).compile();

    service = module.get<CommercialDatasService>(CommercialDatasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
