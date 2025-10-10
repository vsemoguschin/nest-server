import { Module } from '@nestjs/common';
import { CommercialDatasController } from './commercial-datas.controller';
import { CommercialDatasService } from './commercial-datas.service';

@Module({
  controllers: [CommercialDatasController],
  providers: [CommercialDatasService]
})
export class CommercialDatasModule {}
