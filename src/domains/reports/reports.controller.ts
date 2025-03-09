// src/controllers/manager-report.controller.ts
import {
  Controller,
  Post,
  Body,
  Delete,
  Param,
  ParseIntPipe,
  Get,
  Query,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CreateManagerReportDto } from './dto/create-manager-report.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDto } from '../users/dto/user.dto';

@UseGuards(RolesGuard)
@ApiTags('manager-reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportService: ReportsService) {}

  @Post('manager')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP')
  @ApiOperation({ summary: 'Создать отчет менеджера' })
  @ApiResponse({ status: 201, description: 'Отчет успешно создан' })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  async create(@Body() createManagerReportDto: CreateManagerReportDto) {
    const report = await this.reportService.create(createManagerReportDto);
    return report;
  }

  @Get('managers')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP')
  async getManagersReports(
    @CurrentUser() user: UserDto,
    @Query('period') period: string,
  ) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.reportService.getManagersReports(period, user);
  }

  @Get('manager/:id/data')
  @ApiOperation({ summary: 'Получить данные менеджера за дату' })
  @ApiQuery({
    name: 'date',
    required: true,
    description: 'Дата в формате YYYY-MM-DD',
  })
  @ApiResponse({
    status: 200,
    description: 'Данные менеджера успешно получены',
  })
  @ApiResponse({ status: 404, description: 'Пользователь не найден' })
  async getManagerData(
    @Param('id', ParseIntPipe) id: number,
    @Query('date') date: string,
  ) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException(
        'Параметр date обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.reportService.getManagerData(id, date);
  }

  @Delete('manager-report/:id')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROP')
  @ApiOperation({ summary: 'Удалить отчет менеджера' })
  @ApiResponse({ status: 200, description: 'Отчет успешно удален' })
  @ApiResponse({ status: 404, description: 'Отчет не найден' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.reportService.delete(id);
  }
}
