import { Module } from '@nestjs/common';
import { PlanfactController } from './planfact.controller';
import { PlanfactService } from './planfact.service';
import { DashboardsService } from '../dashboards/dashboards.service';
import { CommercialDatasService } from '../commercial-datas/commercial-datas.service';

@Module({
  controllers: [PlanfactController],
  providers: [PlanfactService, DashboardsService, CommercialDatasService]
})
export class PlanfactModule {}
