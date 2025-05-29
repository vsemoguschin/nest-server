import { Module } from '@nestjs/common';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { CdekService } from 'src/services/cdek.service';
import { DealsService } from '../deals/deals.service';

@Module({
  controllers: [DeliveriesController],
  providers: [DeliveriesService, CdekService, DealsService]
})
export class DeliveriesModule {}
