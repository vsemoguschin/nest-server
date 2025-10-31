import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserDto } from '../users/dto/user.dto';
import { CommercialDatasService } from './commercial-datas.service';

@Controller('commercial-datas')
@UseGuards(RolesGuard)
export class CommercialDatasController {
  constructor(
    private readonly commercialDatasService: CommercialDatasService,
  ) {}

  @Get('groups')
  async getGroups(@CurrentUser() user: UserDto) {
    return this.commercialDatasService.getGroups(user);
  }

  @Get('tops/:groupId')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async getManagerGroupDatas(
    @CurrentUser() user: UserDto,
    @Query('period') period: string,
    @Param('groupId', ParseIntPipe) groupId: number,
  ): Promise<any> {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.commercialDatasService.getManagerGroupDatas(groupId, period);
  }

  @Get('')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async getManagersDatas(
    @CurrentUser() user: UserDto,
    @Query('period') period: string,
    @Query('groupId') groupId: number,
  ): Promise<any> {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.commercialDatasService.getManagersDatas(user, period, groupId);
  }

  @Get('/:managerId')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async getManagerDatas(
    @CurrentUser() user: UserDto,
    @Query('period') period: string,
    @Param('managerId', ParseIntPipe) managerId: number,
  ): Promise<any> {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.commercialDatasService.getManagerDatas(user, period, managerId);
  }



  @Get('/stat/all')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async getStatAllGroups(
    @CurrentUser() user: UserDto,
    @Query('period') period: string,
  ): Promise<any> {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.commercialDatasService.getStatAllGroups(user, period);
  }

  @Get('/statistics/:groupId')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async getStat(
    @CurrentUser() user: UserDto,
    @Query('period') period: string,
    @Param('groupId', ParseIntPipe) groupId: number,
  ): Promise<any> {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.commercialDatasService.getStat(user, period, groupId);
  }
}
