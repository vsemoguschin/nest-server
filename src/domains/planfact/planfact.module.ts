import { Module } from '@nestjs/common';
import { PlanfactController } from './planfact.controller';
import { PlanfactDdsReportController } from './planfact-dds-report.controller';
import { PlanfactService } from './planfact.service';
import { DashboardsService } from '../dashboards/dashboards.service';
import { CommercialDatasService } from '../commercial-datas/commercial-datas.service';

@Module({
  controllers: [PlanfactController, PlanfactDdsReportController],
  providers: [PlanfactService, DashboardsService, CommercialDatasService]
})
export class PlanfactModule {}
