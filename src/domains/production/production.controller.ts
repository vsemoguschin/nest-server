import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { ProductionService } from './production.service';
import { CreateMasterReportDto } from './dto/create-master-report.dto';
import { UpdateMasterReportDto } from './dto/update-master-report.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDto } from '../users/dto/user.dto';
import { CreateMasterShiftsDto } from './dto/create-master-shifts.dto';
import { MasterShiftResponseDto } from './dto/master-shift.dto';
import { CreatePackerReportDto } from './dto/create-packer-report.dto';
import { PackerShiftResponseDto } from './dto/packer-shift.dto';
import { UpdatePackerReportDto } from './dto/update-packer-report.dto';
import { CreatePackerShiftsDto } from './dto/create-packer-shifts.dto';
import {
  CreateMasterRepairReportDto,
  UpdateMasterRepairReportDto,
} from './dto/create-master-repair-report.dto';
import {
  CreateOtherReportDto,
  UpdateOtherReportDto,
} from './dto/other-report.dto';
import { CreateFrezerReportDto } from './dto/create-frezer-report.dto';
import { UpdateFrezerReportDto } from './dto/update-frezer-report.dto';

@UseGuards(RolesGuard)
@Controller('production')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Get('predata')
  @Roles('ADMIN', 'G', 'DP', 'MASTER', 'LOGIST', 'PACKER', 'FINANCIER')
  async getPredata(@CurrentUser() user: UserDto) {
    return this.productionService.getPredata(user);
  }

  @Get('orders')
  @Roles('ADMIN', 'G', 'DP')
  async getOrders(@Query('from') from: string, @Query('to') to: string) {
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      throw new BadRequestException(
        'Параметр from обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException(
        'Параметр to обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    return this.productionService.getOrders(from, to);
  }

  @Get('reports/search')
  @Roles('ADMIN', 'G', 'DP')
  async findOrders(@Query('name') name: string) {
    if (!name || name.trim() === '') {
      throw new BadRequestException('Параметр name обязателен.');
    }
    return this.productionService.findOrders(name);
  }

  @Get('masters')
  @Roles('ADMIN', 'G', 'DP', 'MASTER')
  async getMasters(@CurrentUser() user: UserDto) {
    return this.productionService.getMasters(user);
  }

  @Get('frezers')
  @Roles('ADMIN', 'G', 'DP', 'FRZ')
  async getFrezers(@CurrentUser() user: UserDto) {
    return this.productionService.getFrezers(user);
  }

  @Post('master-report')
  @Roles('ADMIN', 'G', 'DP', 'MASTER')
  async create(
    @Body() createMasterReportDto: CreateMasterReportDto,
    // @CurrentUser() user: UserDto,
  ) {
    return this.productionService.createMasterReport(
      createMasterReportDto,
      //   user,
    );
  }

  @Get('master/:id/reports')
  @Roles('ADMIN', 'G', 'DP', 'MASTER')
  async findAll(
    @Query('from') from: string,
    @Query('to') to: string,
    @Param('id') id: string,
  ) {
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      throw new BadRequestException(
        'Параметр from обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException(
        'Параметр to обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    return this.productionService.getMasterReports(+id, from, to);
  }

  @Get('frezer/:id/reports')
  @Roles('ADMIN', 'G', 'DP', 'MASTER')
  async getFrezerReports(
    @Query('from') from: string,
    @Query('to') to: string,
    @Param('id') id: string,
  ) {
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      throw new BadRequestException(
        'Параметр from обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException(
        'Параметр to обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    return this.productionService.getFrezerReports(+id, from, to);
  }

  @Patch('frezer-report/:id')
  @Roles('ADMIN', 'G', 'DP', 'FRZ')
  async updateFrezerReport(
    @Param('id') id: string,
    @Body() updateFrezerReport: UpdateFrezerReportDto,
    @CurrentUser() user: UserDto,
  ) {
    return this.productionService.updateFrezerReport(
      +id,
      updateFrezerReport,
      user,
    );
  }

  @Patch('master-report/:id')
  @Roles('ADMIN', 'G', 'DP', 'MASTER')
  async update(
    @Param('id') id: string,
    @Body() updateMasterReportDto: UpdateMasterReportDto,
    @CurrentUser() user: UserDto,
  ) {
    return this.productionService.updateMasterReport(
      +id,
      updateMasterReportDto,
      user,
    );
  }

  @Delete('master-report/:id')
  @Roles('ADMIN', 'G', 'DP')
  async remove(@Param('id') id: string) {
    return this.productionService.deleteMasterReport(+id);
  }

  @Delete('frezer-report/:id')
  @Roles('ADMIN', 'G', 'DP')
  async deleteFrezerReport(@Param('id') id: string) {
    return this.productionService.deleteFrezerReport(+id);
  }

  @Post('master/:masterId/shifts')
  async createMasterShifts(
    @Param('masterId', ParseIntPipe) masterId: number,
    @Body() dto: CreateMasterShiftsDto,
  ): Promise<MasterShiftResponseDto[]> {
    return this.productionService.createMasterShifts(masterId, dto);
  }

  @Get('master/:masterId/shifts')
  async getMasterShifts(
    @Param('masterId', ParseIntPipe) masterId: number,
    @Query('period') period: string,
  ): Promise<MasterShiftResponseDto[]> {
    // console.log(period);
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.productionService.getMasterShifts(masterId, period);
  }

  @Post('master-repair')
  @Roles('ADMIN', 'G', 'DP', 'MASTER')
  async createRepairReport(
    @Body() createMasterRepairReportDto: CreateMasterRepairReportDto,
  ) {
    return this.productionService.createMasterRepairReport(
      createMasterRepairReportDto,
    );
  }

  @Patch('master-repair/:id')
  @Roles('ADMIN', 'G', 'DP', 'MASTER')
  async updateRepairReport(
    @Param('id') id: string,
    @Body() updateMasterRepairReportDto: UpdateMasterRepairReportDto,
  ) {
    return this.productionService.updateMasterRepairReport(
      +id,
      updateMasterRepairReportDto,
    );
  }

  @Delete('master-repair/:id')
  @Roles('ADMIN', 'G', 'DP')
  async removeRepairReport(@Param('id') id: string) {
    return this.productionService.deleteMasterRepairReport(+id);
  }

  @Get('stat')
  @Roles('ADMIN', 'G', 'DP')
  async getStat(@Query('period') period: string) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.productionService.getStat(period);
  }

  @Post('packer-report')
  @Roles('ADMIN', 'G', 'DP', 'PACKER', 'LOGIST')
  async createPackerReport(
    @Body() createPackerReportDto: CreatePackerReportDto,
  ) {
    return this.productionService.createPackerReport(createPackerReportDto);
  }

  @Get('packer/:id/reports')
  @Roles('ADMIN', 'G', 'DP', 'PACKER', 'LOGIST')
  async getPackerReports(
    @Query('from') from: string,
    @Query('to') to: string,
    @Param('id') id: string,
  ) {
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      throw new BadRequestException(
        'Параметр from обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException(
        'Параметр to обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    return this.productionService.getPackerReports(+id, from, to);
  }

  @Patch('packer-report/:id')
  @Roles('ADMIN', 'G', 'DP', 'PACKER', 'LOGIST')
  async updatePackerReport(
    @Param('id') id: string,
    @Body() updatePackerReportDto: UpdatePackerReportDto,
    @CurrentUser() user: UserDto,
  ) {
    return this.productionService.updatePackerReport(
      +id,
      updatePackerReportDto,
      user,
    );
  }

  @Delete('packer-report/:id')
  @Roles('ADMIN', 'G', 'DP')
  async removePackerReport(@Param('id') id: string) {
    return this.productionService.deletePackerReport(+id);
  }

  @Post('packer/:packerId/shifts')
  @Roles('ADMIN', 'G', 'DP', 'PACKER', 'LOGIST')
  async createPackerShifts(
    @Param('packerId', ParseIntPipe) packerId: number,
    @Body() dto: CreatePackerShiftsDto,
  ): Promise<PackerShiftResponseDto[]> {
    return this.productionService.createPackerShifts(packerId, dto);
  }

  @Get('packer/:packerId/shifts')
  @Roles('ADMIN', 'G', 'DP', 'PACKER', 'LOGIST')
  async getPackerShifts(
    @Param('packerId', ParseIntPipe) packerId: number,
    @Query('period') period: string,
  ): Promise<PackerShiftResponseDto[]> {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.productionService.getPackerShifts(packerId, period);
  }

  @Get('packers')
  @Roles('ADMIN', 'G', 'DP', 'PACKER')
  async getPackers(@CurrentUser() user: UserDto) {
    return this.productionService.getPackers(user);
  }

  @Get('packer-stat')
  @Roles('ADMIN', 'G', 'DP')
  async getPackerStat(@Query('period') period: string) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.productionService.getPackerStat(period);
  }

  @Post('other-report')
  @Roles('ADMIN', 'G', 'DP', 'MASTER', 'PACKER')
  async createOtherReport(@Body() createOtherReportDto: CreateOtherReportDto) {
    return this.productionService.createOtherReport(createOtherReportDto);
  }

  @Patch('other-report/:id')
  @Roles('ADMIN', 'G', 'DP', 'MASTER', 'PACKER')
  async updateOtherReport(
    @Param('id') id: string,
    @Body() updateOtherReportDto: UpdateOtherReportDto,
  ) {
    return this.productionService.updateOtherReport(+id, updateOtherReportDto);
  }

  @Delete('other-report/:id')
  @Roles('ADMIN', 'G', 'DP')
  async removeOtherReport(@Param('id') id: string) {
    return this.productionService.deleteOtherReport(+id);
  }

  // LOGIST

  @Get('logists')
  @Roles('ADMIN', 'G', 'DP', 'LOGIST')
  async getLogists(@CurrentUser() user: UserDto) {
    return this.productionService.getLogists(user);
  }

  @Get('logist/:logistId/shifts')
  @Roles('ADMIN', 'G', 'DP', 'LOGIST')
  async getlogistShifts(
    @Param('logistId', ParseIntPipe) logistId: number,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<PackerShiftResponseDto[]> {
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      throw new BadRequestException(
        'Параметр from обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException(
        'Параметр to обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    return this.productionService.getlogistShifts(logistId, from, to);
  }

  @Post('logists/:logistId/shifts')
  @Roles('ADMIN', 'G', 'DP', 'LOGIST')
  async createLogistShifts(
    @Param('logistId', ParseIntPipe) logistId: number,
    @Body() dto: CreatePackerShiftsDto,
  ): Promise<PackerShiftResponseDto[]> {
    return this.productionService.createLogistShifts(logistId, dto);
  }

  // FRZ ---------------------

  @Post('frezer-report')
  @Roles('ADMIN', 'G', 'DP', 'FRZ')
  async createFrezerReport(
    @Body() createFrezerReportDto: CreateFrezerReportDto,
    // @CurrentUser() user: UserDto,
  ) {
    return this.productionService.createFrezerReport(
      createFrezerReportDto,
      //   user,
    );
  }
}
