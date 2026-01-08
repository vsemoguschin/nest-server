import { Module } from '@nestjs/common';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { CdekService } from 'src/services/cdek.service';

@Module({
  controllers: [DeliveriesController],
  providers: [DeliveriesService, CdekService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
