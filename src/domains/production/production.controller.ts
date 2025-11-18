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
import { PrismaService } from '../../prisma/prisma.service';

@UseGuards(RolesGuard)
@Controller('production')
export class ProductionController {
  constructor(
    private readonly productionService: ProductionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('predata')
  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DP',
    'RP',
    'MASTER',
    'LOGIST',
    'PACKER',
    'FINANCIER',
    'FRZ',
  )
  async getPredata(@CurrentUser() user: UserDto) {
    return this.productionService.getPredata(user);
  }
  @Get('workspaces')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP')
  async getWorkSpaces(@CurrentUser() user: UserDto) {
    return this.productionService.getWorkSpaces(user);
  }

  @Get('orders')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP')
  async getOrders(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: UserDto,
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
    return this.productionService.getOrders(from, to, user);
  }

  @Get(':id/orders')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP')
  async getWorkSpaceOrders(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: UserDto,
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
    return this.productionService.getWorkSpaceOrders(from, to, user, +id);
  }

  @Get('reports/search')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP')
  async findOrders(@Query('name') name: string) {
    if (!name || name.trim() === '') {
      throw new BadRequestException('Параметр name обязателен.');
    }
    return this.productionService.findOrders(name);
  }

  @Get('masters')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'MASTER', 'PACKER')
  async getMasters(@CurrentUser() user: UserDto) {
    return this.productionService.getMasters(user);
  }

  @Get('frezers')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'FRZ')
  async getFrezers(@CurrentUser() user: UserDto) {
    return this.productionService.getFrezers(user);
  }

  @Post('master-report')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'MASTER', 'PACKER')
  async create(
    @Body() createMasterReportDto: CreateMasterReportDto,
    // @CurrentUser() user: UserDto,
  ) {
    // Получаем пользователя отчета для проверки workSpaceId
    const reportUser = await this.prisma.user.findUnique({
      where: { id: createMasterReportDto.userId },
      select: { workSpaceId: true },
    });

    if (!reportUser) {
      throw new BadRequestException('Пользователь не найден');
    }

    // Пересчитываем основную стоимость на основе workSpaceId пользователя отчета
    if (
      createMasterReportDto.metrs &&
      createMasterReportDto.els &&
      createMasterReportDto.type
    ) {
      let cost = 0;
      const { metrs, els, type } = createMasterReportDto;

      if (reportUser.workSpaceId === 8) {
        switch (type) {
          case 'Стандартная':
          case 'ВБ':
          case 'ОЗОН':
          case 'Подарок':
            cost = metrs * 60 + els * 30;
            break;
          case 'Уличная':
            cost = metrs * 90 + els * 45;
            break;
          case 'Уличный контражур':
            cost = metrs * 54 + els * 37;
            break;
          case 'РГБ Контражур':
            cost = metrs * 80 + els * 67;
            break;
          case 'РГБ':
          case 'Смарт':
            cost = metrs * 84 + els * 42;
            break;
          case 'Контражур':
            cost = metrs * 36 + els * 18;
            break;
          default:
            cost = 0;
        }
      } else {
        switch (type) {
          case 'Стандартная':
          case 'ВБ':
          case 'ОЗОН':
          case 'Подарок':
            cost = metrs * 100 + els * 50;
            break;
          case 'Уличная':
          case 'РГБ Контражур':
            cost = metrs * 130 + els * 70;
            break;
          case 'РГБ':
          case 'Смарт':
            cost = metrs * 140 + els * 150;
            break;
          case 'Контражур':
            cost = metrs * 60 + els * 30;
            break;
          default:
            cost = 0;
        }
      }

      createMasterReportDto.cost = cost;
    }

    // Пересчитываем стоимость подсветки на основе workSpaceId пользователя отчета
    if (
      createMasterReportDto.lightingType &&
      createMasterReportDto.lightingType !== 'none' &&
      createMasterReportDto.lightingType !== '' &&
      createMasterReportDto.lightingLength &&
      createMasterReportDto.lightingElements
    ) {
      let lightingCost = 0;
      const { lightingType, lightingLength, lightingElements } =
        createMasterReportDto;

      if (reportUser.workSpaceId === 8) {
        switch (lightingType) {
          case 'Контражур':
            lightingCost = lightingLength * 36 + lightingElements * 18;
            break;
          case 'РГБ Контражур':
            lightingCost = lightingLength * 80 + lightingElements * 67;
            break;
          default:
            lightingCost = 0;
        }
      } else {
        switch (lightingType) {
          case 'Контражур':
            lightingCost = lightingLength * 60 + lightingElements * 30;
            break;
          case 'РГБ Контражур':
            lightingCost = lightingLength * 130 + lightingElements * 70;
            break;
          default:
            lightingCost = 0;
        }
      }

      createMasterReportDto.lightingCost = lightingCost;
    } else {
      createMasterReportDto.lightingCost = 0;
    }

    return this.productionService.createMasterReport(
      createMasterReportDto,
      //   user,
    );
  }

  @Patch('master-report/:id')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'MASTER', 'PACKER')
  async update(
    @Param('id') id: string,
    @Body() updateMasterReportDto: UpdateMasterReportDto,
    @CurrentUser() user: UserDto,
  ) {
    // Получаем существующий отчет для получения userId и других полей
    const existingReport = await this.prisma.masterReport.findUnique({
      where: { id: +id },
      select: { userId: true, metrs: true, els: true, type: true },
    });

    if (!existingReport) {
      throw new BadRequestException('Отчет не найден');
    }

    // Получаем пользователя отчета для проверки workSpaceId
    const reportUser = await this.prisma.user.findUnique({
      where: { id: existingReport.userId },
      select: { workSpaceId: true },
    });

    if (!reportUser) {
      throw new BadRequestException('Пользователь не найден');
    }

    // Пересчитываем основную стоимость на основе workSpaceId пользователя отчета
    // Используем значения из DTO, если они есть, иначе из существующего отчета
    const metrs = updateMasterReportDto.metrs ?? existingReport.metrs;
    const els = updateMasterReportDto.els ?? existingReport.els;
    const type = updateMasterReportDto.type ?? existingReport.type;

    if (metrs && els && type) {
      let cost = 0;

      if (reportUser.workSpaceId === 8) {
        switch (type) {
          case 'Стандартная':
          case 'ВБ':
          case 'ОЗОН':
          case 'Подарок':
            cost = metrs * 60 + els * 30;
            break;
          case 'Уличная':
            cost = metrs * 90 + els * 45;
            break;
          case 'Уличный контражур':
            cost = metrs * 54 + els * 37;
            break;
          case 'РГБ Контражур':
            cost = metrs * 80 + els * 67;
            break;
          case 'РГБ':
          case 'Смарт':
            cost = metrs * 84 + els * 42;
            break;
          case 'Контражур':
            cost = metrs * 36 + els * 18;
            break;
          default:
            cost = 0;
        }
      } else {
        switch (type) {
          case 'Стандартная':
          case 'ВБ':
          case 'ОЗОН':
          case 'Подарок':
            cost = metrs * 100 + els * 50;
            break;
          case 'Уличная':
          case 'РГБ Контражур':
            cost = metrs * 130 + els * 70;
            break;
          case 'РГБ':
          case 'Смарт':
            cost = metrs * 140 + els * 150;
            break;
          case 'Контражур':
            cost = metrs * 60 + els * 30;
            break;
          default:
            cost = 0;
        }
      }

      updateMasterReportDto.cost = cost;
    }

    // Пересчитываем стоимость подсветки на основе workSpaceId пользователя отчета
    if (
      updateMasterReportDto.lightingType &&
      updateMasterReportDto.lightingType !== 'none' &&
      updateMasterReportDto.lightingType !== '' &&
      updateMasterReportDto.lightingLength &&
      updateMasterReportDto.lightingElements
    ) {
      let lightingCost = 0;
      const { lightingType, lightingLength, lightingElements } =
        updateMasterReportDto;

      if (reportUser.workSpaceId === 8) {
        switch (lightingType) {
          case 'Контражур':
            lightingCost = lightingLength * 36 + lightingElements * 18;
            break;
          case 'РГБ Контражур':
            lightingCost = lightingLength * 80 + lightingElements * 67;
            break;
          default:
            lightingCost = 0;
        }
      } else {
        switch (lightingType) {
          case 'Контражур':
            lightingCost = lightingLength * 60 + lightingElements * 30;
            break;
          case 'РГБ Контражур':
            lightingCost = lightingLength * 130 + lightingElements * 70;
            break;
          default:
            lightingCost = 0;
        }
      }

      updateMasterReportDto.lightingCost = lightingCost;
    } else if (
      updateMasterReportDto.lightingType === 'none' ||
      updateMasterReportDto.lightingType === '' ||
      !updateMasterReportDto.lightingType
    ) {
      // Если тип подсветки пустой или "none", обнуляем стоимость
      updateMasterReportDto.lightingCost = 0;
    }

    return this.productionService.updateMasterReport(
      +id,
      updateMasterReportDto,
      user,
    );
  }

  @Get('master/:id/reports')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'MASTER', 'PACKER')
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
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'MASTER', 'FRZ')
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
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'FRZ')
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

  @Delete('master-report/:id')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP')
  async remove(@Param('id') id: string) {
    return this.productionService.deleteMasterReport(+id);
  }

  @Delete('frezer-report/:id')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP')
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
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'MASTER', 'PACKER')
  async createRepairReport(
    @Body() createMasterRepairReportDto: CreateMasterRepairReportDto,
  ) {
    return this.productionService.createMasterRepairReport(
      createMasterRepairReportDto,
    );
  }

  @Patch('master-repair/:id')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'MASTER', 'PACKER')
  async updateRepairReport(
    @CurrentUser() user: UserDto,
    @Param('id') id: string,
    @Body() updateMasterRepairReportDto: UpdateMasterRepairReportDto,
  ) {
    return this.productionService.updateMasterRepairReport(
      +id,
      updateMasterRepairReportDto,
      user,
    );
  }

  @Delete('master-repair/:id')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP')
  async removeRepairReport(@Param('id') id: string) {
    return this.productionService.deleteMasterRepairReport(+id);
  }

  @Get('stat')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP')
  async getStat(@Query('period') period: string, @CurrentUser() user: UserDto) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.productionService.getStat(period, user);
  }

  @Post('packer-report')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'PACKER', 'LOGIST', 'MASTER')
  async createPackerReport(
    @Body() createPackerReportDto: CreatePackerReportDto,
  ) {
    return this.productionService.createPackerReport(createPackerReportDto);
  }

  @Get('packer/:id/reports')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'PACKER', 'LOGIST', 'MASTER')
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
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'PACKER', 'LOGIST', 'MASTER')
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
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP')
  async removePackerReport(@Param('id') id: string) {
    return this.productionService.deletePackerReport(+id);
  }

  @Post('packer/:packerId/shifts')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'PACKER', 'LOGIST', 'MASTER')
  async createPackerShifts(
    @Param('packerId', ParseIntPipe) packerId: number,
    @Body() dto: CreatePackerShiftsDto,
  ): Promise<PackerShiftResponseDto[]> {
    return this.productionService.createPackerShifts(packerId, dto);
  }

  @Get('packer/:packerId/shifts')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'PACKER', 'LOGIST', 'MASTER')
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
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'PACKER', 'MASTER', 'LOGIST')
  async getPackers(@CurrentUser() user: UserDto) {
    return this.productionService.getPackers(user);
  }

  @Get('packer-stat')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP')
  async getPackerStat(
    @Query('period') period: string,
    @CurrentUser() user: UserDto,
  ) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.productionService.getPackerStat(period, user);
  }

  @Post('other-report')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'MASTER', 'PACKER', 'LOGIST')
  async createOtherReport(@Body() createOtherReportDto: CreateOtherReportDto) {
    return this.productionService.createOtherReport(createOtherReportDto);
  }

  @Patch('other-report/:id')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'MASTER', 'PACKER', 'LOGIST')
  async updateOtherReport(
    @CurrentUser('user') user: UserDto,
    @Param('id') id: string,
    @Body() updateOtherReportDto: UpdateOtherReportDto,
  ) {
    return this.productionService.updateOtherReport(
      +id,
      updateOtherReportDto,
      user,
    );
  }

  @Delete('other-report/:id')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP')
  async removeOtherReport(@Param('id') id: string) {
    return this.productionService.deleteOtherReport(+id);
  }

  // LOGIST

  @Get('logists')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'LOGIST')
  async getLogists(@CurrentUser() user: UserDto) {
    return this.productionService.getLogists(user);
  }

  @Get('logist/:logistId/shifts')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'LOGIST')
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
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'LOGIST')
  async createLogistShifts(
    @Param('logistId', ParseIntPipe) logistId: number,
    @Body() dto: CreatePackerShiftsDto,
  ): Promise<PackerShiftResponseDto[]> {
    return this.productionService.createLogistShifts(logistId, dto);
  }

  // FRZ ---------------------

  @Post('frezer-report')
  @Roles('ADMIN', 'G', 'KD', 'DP', 'RP', 'FRZ')
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
