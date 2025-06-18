import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PlanfactService } from './planfact.service';
import { ApiTags } from '@nestjs/swagger';
import { PlanFactAccountCreateDto } from './dto/planfact-account-create.dto';

@UseGuards(RolesGuard)
@ApiTags('planfact')
@Controller('planfact')
export class PlanfactController {
  constructor(private readonly planfactService: PlanfactService) {}

  @Get('operations')
  @Roles('ADMIN', 'G', 'KD')
  async getOperationsFromRange(
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('limit') limit: number,
  ) {
    if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      throw new BadRequestException(
        'Параметр start обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      throw new BadRequestException(
        'Параметр end обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    return this.planfactService.getOperationsFromRange(
      { from: start, to: end },
      limit,
    );
  }

  @Get('operations')
  @Roles('ADMIN', 'G', 'KD')
  async getBankAccounts() {
    return this.planfactService.getBankAccounts();
  }

  @Get('categories')
  @Roles('ADMIN', 'G', 'KD')
  async getCategories() {
    return this.planfactService.getCategories();
  }

  @Post('accounts')
  @Roles('ADMIN', 'G', 'KD')
  async createAccount(@Body() dto: PlanFactAccountCreateDto) {
    return this.planfactService.createAccount(dto);
  }

  @Get('accounts')
  @Roles('ADMIN', 'G', 'KD')
  async createPaymentLink() {
    return this.planfactService.getBankAccounts();
  }

  @Get('pl')
  @Roles('ADMIN', 'G', 'KD')
  async getPLDatas(@Query('period') period: string) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.planfactService.getPLDatas(period);
  }
}
