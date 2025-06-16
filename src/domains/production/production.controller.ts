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

@UseGuards(RolesGuard)
@Controller('production')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Get('predata')
  @Roles('ADMIN', 'G', 'DP', 'MASTER', 'LOGIST')
  async getPredata(@CurrentUser() user: UserDto) {
    return this.productionService.getPredata(user);
  }

  @Get('masters')
  @Roles('ADMIN', 'G', 'DP', 'MASTER')
  async getMasters(@CurrentUser() user: UserDto) {
    return this.productionService.getMasters(user);
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
  async findAll(@Query('period') period: string, @Param('id') id: string) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.productionService.getMasterReports(+id, period);
  }

  @Patch('master-report/:id')
  @Roles('ADMIN', 'G', 'DP', 'MASTER')
  async update(
    @Param('id') id: string,
    @Body() updateMasterReportDto: UpdateMasterReportDto,
  ) {
    return this.productionService.updateMasterReport(
      +id,
      updateMasterReportDto,
    );
  }

  @Delete('master-report/:id')
  @Roles('ADMIN', 'G', 'DP')
  async remove(@Param('id') id: string) {
    return this.productionService.deleteMasterReport(+id);
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
}
