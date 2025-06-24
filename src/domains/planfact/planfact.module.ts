import { Module } from '@nestjs/common';
import { PlanfactController } from './planfact.controller';
import { PlanfactService } from './planfact.service';
import { DashboardsService } from '../dashboards/dashboards.service';

@Module({
  controllers: [PlanfactController],
  providers: [PlanfactService, DashboardsService]
})
export class PlanfactModule {}
