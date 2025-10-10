import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { AdService } from './ad.service';
import { AdExpenseCreateDto } from './dto/ad-expense-create.dto';
import { Roles } from 'src/common/decorators/roles.decorator';

@UseGuards(RolesGuard)
@ApiTags('ads')
@Controller('ads')
export class AdController {
  constructor(private readonly adService: AdService) { }

  @Get('sources')
  async getSources() {
    return this.adService.getSources()
  }

  @Post('expenses')
  @ApiOperation({
    summary: 'Создать расход',
    description: 'Endpoint: POST ads/expenses. Создает новый расход.',
  })
  @Roles('ADMIN', 'G', 'KD', 'MARKETER')
  async create(
    @Body() adExpenseCreateDto: AdExpenseCreateDto,
  ): Promise<AdExpenseCreateDto> {
    return this.adService.createAdExpense(adExpenseCreateDto);
  }

  @Get('expenses')
  @ApiOperation({
    summary: 'Получить список расходов',
    description:
      'Endpoint: GET /deals?period=YYYY-MM. Получить список расходов за указанный период.',
  })
  @Roles('ADMIN', 'G', 'KD', 'MARKETER')
  async getList(
    @Query('period') period: string,
  ): Promise<AdExpenseCreateDto[]> {
    if (
      !period ||
      (!/^\d{4}-\d{2}-\d{2}$/.test(period) && !/^\d{4}-\d{2}$/.test(period))
    ) {
      throw new BadRequestException(
        'Параметры period обязательны и должны быть в формате YYYY-MM-DD',
      );
    }
    return this.adService.getAdExpensesList(period);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить запись',
    description: 'Удаляет запись по ID.',
  })
  @ApiResponse({ status: 200, description: 'Запись успешно удалена.' })
  @ApiResponse({ status: 404, description: 'Запись не найдена.' })
  @Roles('ADMIN', 'G', 'KD', 'MARKETER')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.adService.delete(id);
  }
}
