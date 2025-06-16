import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { WbService } from './wb.service';
import { Roles } from 'src/common/decorators/roles.decorator';

@UseGuards(RolesGuard)
@Controller('wb')
export class WbController {
  constructor(private readonly wbService: WbService) {}

  @Get('new-orders')
  @Roles('ADMIN', 'LOGIST', 'G')
  async getNewWbOrders() {
    return this.wbService.getNewWbOrders();
  }

  @Get('waiting-orders')
  @Roles('ADMIN', 'LOGIST', 'G')
  async getWaitingWbOrders() {
    return this.wbService.getWaitingWbOrders();
  }

  @Get('orders')
  @Roles('ADMIN', 'LOGIST', 'G')
  async getWbOrders(
    @Query('limit') limit: number = 1000,
    @Query('next') next: number = 0,
    @Query('dateFrom') dateFrom?: number,
    @Query('dateTo') dateTo?: number,
  ) {
    return this.wbService.getWbOrders({ limit, next, dateFrom, dateTo });
  }

  @Get('orders-stat')
  @Roles('ADMIN', 'LOGIST', 'G')
  async getWbOrdersStat(@Query('period') period: string) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.wbService.getWbOrdersStat(period);
  }

  @Get('supplies')
  @Roles('ADMIN', 'LOGIST', 'G')
  async getWbSupplies() {
    return this.wbService.getWbSupplies();
  }
}
