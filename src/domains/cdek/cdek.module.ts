import { Module } from '@nestjs/common';
import { CdekController } from './cdek.controller';
import { CdekProxyService } from './cdek.service';

@Module({
  controllers: [CdekController],
  providers: [CdekProxyService],
  exports: [CdekProxyService],
})
export class CdekModule {}
