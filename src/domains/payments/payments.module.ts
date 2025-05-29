import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { DealsService } from '../deals/deals.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, DealsService]
})
export class PaymentsModule {}
