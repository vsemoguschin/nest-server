import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Delete,
  Patch,
  Param,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SalaryPayCreateDto } from './dto/salary-pay-create.dto';
import { SalaryPayUpdateStatusDto } from './dto/salary-pay-update-status.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { SalaryPaysService } from './salary-pays.service';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { salaryCorrection } from './dto/salary-correction-create.dto';

@UseGuards(RolesGuard)
@ApiTags('salary-pay')
@Controller('salary-pay')
export class SalaryPaysController {
  constructor(private readonly salaryPaysService: SalaryPaysService) {}

  // Создание записи
  @Post()
  @Roles('ADMIN', 'G', 'KD', 'DO', 'DP')
  @ApiOperation({ summary: 'Создать запись о выплате зарплаты' })
  @ApiResponse({ status: 201, description: 'Запись успешно создана' })
  async create(@Body() createDto: SalaryPayCreateDto) {
    return this.salaryPaysService.create(createDto);
  }

  // корректировка
  @Post('correction')
  @Roles('ADMIN', 'G', 'KD', 'DO')
  @ApiOperation({ summary: 'Создать запись о корректировке' })
  @ApiResponse({ status: 201, description: 'Запись успешно создана' })
  async createCorrection(@Body() createDto: salaryCorrection) {
    return this.salaryPaysService.createCorrection(createDto);
  }

  //удаление корректировки
  @Delete('correction/:id')
  @Roles('ADMIN', 'G', 'KD', 'DO')
  @ApiOperation({ summary: 'Удалить запись о корректировке' })
  @ApiParam({ name: 'id', description: 'ID записи', type: 'integer' })
  @ApiNoContentResponse({ description: 'Запись успешно удалена' })
  async deleteCorrection(@Param('id', ParseIntPipe) id: number) {
    await this.salaryPaysService.deleteCorrection(id);
  }

  // Получение записей по периоду
  @Get()
  @Roles('ADMIN', 'G', 'KD', 'DO', 'BUKH', 'DP')
  @ApiOperation({ summary: 'Получить записи о выплатах по периоду' })
  @ApiQuery({
    name: 'period',
    required: true,
    description: 'Период (например, 2025-01)',
  })
  @ApiResponse({ status: 200, description: 'Список записей' })
  async findByPeriod(@Query('period') period: string) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.salaryPaysService.findByPeriod(period);
  }

  // Удаление записи
  @Delete(':id')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'BUKH', 'DP')
  @ApiOperation({ summary: 'Удалить запись о выплате' })
  @ApiParam({ name: 'id', description: 'ID записи', type: 'integer' })
  @ApiNoContentResponse({ description: 'Запись успешно удалена' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.salaryPaysService.delete(id);
  }

  // Обновление статуса
  @Patch(':id/status')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  @ApiOperation({ summary: 'Обновить статус выплаты' })
  @ApiParam({ name: 'id', description: 'ID записи', type: 'integer' })
  @ApiResponse({ status: 200, description: 'Статус успешно обновлен' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStatusDto: SalaryPayUpdateStatusDto,
  ) {
    return this.salaryPaysService.updateStatus(id, updateStatusDto);
  }
}
