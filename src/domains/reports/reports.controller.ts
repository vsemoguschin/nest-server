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
import { CreateRopReportDto } from './dto/create-rop-report.dto';

@UseGuards(RolesGuard)
@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportService: ReportsService) {}

  @Get('workspaces-list')
  @Roles('ADMIN', 'G', 'KD', 'DO')
  async getWorkSpaces(@CurrentUser() user: UserDto) {
    return this.reportService.getWorkSpaces(user);
  }

  @Post('manager')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP')
  @ApiOperation({ summary: 'Создать отчет менеджера' })
  @ApiResponse({ status: 201, description: 'Отчет успешно создан' })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  async create(
    @Body() createManagerReportDto: CreateManagerReportDto,
    @CurrentUser() user: UserDto,
  ) {
    const report = await this.reportService.create(
      createManagerReportDto,
      user,
    );
    return report;
  }

  @Post('rop')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP')
  @ApiOperation({ summary: 'Создать отчет менеджера' })
  @ApiResponse({ status: 201, description: 'Отчет успешно создан' })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  async createRopReport(@Body() createRopReportDto: CreateRopReportDto) {
    const report = await this.reportService.createRopReport(createRopReportDto);
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

  @Get('managers/range')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP')
  async getManagersReportsFromRange(
    @CurrentUser() user: UserDto,
    @Query('start') start: string,
    @Query('end') end: string,
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
    return this.reportService.getManagersReportsFromRange({ start, end }, user);
  }

  @Get('rops')
  @Roles('ADMIN', 'G', 'KD', 'DO')
  async getRopsReports(
    @CurrentUser() user: UserDto,
    @Query('period') period: string,
  ) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.reportService.getRopsReports(period, user);
  }

  @Get('rops/range')
  @Roles('ADMIN', 'G', 'KD', 'DO')
  async getRopsReportsFromRange(
    @CurrentUser() user: UserDto,
    @Query('start') start: string,
    @Query('end') end: string,
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
    return this.reportService.getRopsReportsFromRange({ start, end }, user);
  }

  @Get('workspace/:id/data')
  @ApiOperation({ summary: 'Получить данные пространства за дату' })
  @ApiQuery({
    name: 'date',
    required: true,
    description: 'Дата в формате YYYY-MM-DD',
  })
  @ApiResponse({
    status: 200,
    description: 'Данные пространства успешно получены',
  })
  @ApiResponse({ status: 404, description: 'Пользователь не найден' })
  async getRopData(
    @Param('id', ParseIntPipe) id: number,
    @Query('date') date: string,
  ) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException(
        'Параметр date обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.reportService.getRopsReportsPredata(date, id);
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

  // @Delete('manager-report/:id')
  // @Roles('ADMIN', 'G', 'KD', 'DO', 'ROP')
  // @ApiOperation({ summary: 'Удалить отчет менеджера' })
  // @ApiResponse({ status: 200, description: 'Отчет успешно удален' })
  // @ApiResponse({ status: 404, description: 'Отчет не найден' })
  // async delete(@Param('id', ParseIntPipe) id: number) {
  //   return this.reportService.delete(id);
  // }

  @Delete('rop/:id')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROP')
  @ApiOperation({ summary: 'Удалить отчет менеджера' })
  @ApiResponse({ status: 200, description: 'Отчет успешно удален' })
  @ApiResponse({ status: 404, description: 'Отчет не найден' })
  async deleteRopReport(@Param('id', ParseIntPipe) id: number) {
    return this.reportService.deleteRopReport(id);
  }

  @Delete('manager/:id')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROP')
  @ApiOperation({ summary: 'Удалить отчет менеджера' })
  @ApiResponse({ status: 200, description: 'Отчет успешно удален' })
  @ApiResponse({ status: 404, description: 'Отчет не найден' })
  async deleteManagerReport(@Param('id', ParseIntPipe) id: number) {
    return this.reportService.deleteManagerReport(id);
  }
}
