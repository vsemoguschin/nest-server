import { Module } from '@nestjs/common';
import { DopsController } from './dops.controller';
import { DopsService } from './dops.service';
import { DealsService } from '../deals/deals.service';

@Module({
  controllers: [DopsController],
  providers: [DopsService, DealsService]
})
export class DopsModule {}
