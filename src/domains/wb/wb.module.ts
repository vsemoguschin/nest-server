import { Module } from '@nestjs/common';
import { WbController } from './wb.controller';
import { WbService } from './wb.service';

@Module({
  controllers: [WbController],
  providers: [WbService]
})
export class WbModule {}
