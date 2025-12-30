import { Module } from '@nestjs/common';
import { PnlController } from './pnl.controller';
import { PnlService } from './pnl.service';
import { CommercialDatasModule } from '../commercial-datas/commercial-datas.module';

@Module({
  imports: [CommercialDatasModule],
  controllers: [PnlController],
  providers: [PnlService],
  exports: [PnlService],
})
export class PnlModule {}
