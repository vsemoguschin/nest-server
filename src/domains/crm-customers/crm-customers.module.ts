import { Module } from '@nestjs/common';
import { CrmCustomersController } from './crm-customers.controller';
import { CrmCustomersService } from './crm-customers.service';

@Module({
  controllers: [CrmCustomersController],
  providers: [CrmCustomersService],
})
export class CrmCustomersModule {}

