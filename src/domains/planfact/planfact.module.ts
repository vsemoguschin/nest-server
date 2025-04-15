import { Module } from '@nestjs/common';
import { PlanfactController } from './planfact.controller';
import { PlanfactService } from './planfact.service';

@Module({
  controllers: [PlanfactController],
  providers: [PlanfactService]
})
export class PlanfactModule {}
