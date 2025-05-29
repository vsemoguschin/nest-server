import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { DealsService } from '../deals/deals.service';

@Module({
  controllers: [ClientsController],
  providers: [ClientsService, DealsService]
})
export class ClientsModule {}
