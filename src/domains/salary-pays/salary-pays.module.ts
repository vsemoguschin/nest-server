import { Module } from '@nestjs/common';
import { SalaryPaysController } from './salary-pays.controller';
import { SalaryPaysService } from './salary-pays.service';

@Module({
  controllers: [SalaryPaysController],
  providers: [SalaryPaysService]
})
export class SalaryPaysModule {}
