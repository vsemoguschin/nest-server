import { Module } from '@nestjs/common';
import { DopsController } from './dops.controller';
import { DopsService } from './dops.service';

@Module({
  controllers: [DopsController],
  providers: [DopsService],
})
export class DopsModule {}
