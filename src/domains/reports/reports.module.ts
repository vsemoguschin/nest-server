import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { DealsService } from '../deals/deals.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, DealsService]
})
export class ReportsModule {}
