import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
  Get,
  Query,
  BadRequestException,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { DeliveriesService } from './deliveries.service';
import { DeliveryCreateDto } from './dto/delivery-create.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDto } from '../users/dto/user.dto';
import { DeliveryUpdateDto } from './dto/delivery-update.dto';

@UseGuards(RolesGuard)
@ApiTags('deliveries')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get('/checkTrack')
  async checkTrack(@Query('track') track: string) {
    return this.deliveriesService.checkTrack(track);
  }

  @Get('/registers')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV', 'LOGIST')
  async checkRegisters(@Query('period') period: string) {
    if (
      !period ||
      (!/^\d{4}-\d{2}-\d{2}$/.test(period) && !/^\d{4}-\d{2}$/.test(period))
    ) {
      throw new BadRequestException(
        'Параметры period обязательны и должны быть в формате YYYY-MM-DD',
      );
    }
    return this.deliveriesService.checkRegisters(period);
  }

  @Get('')
  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DO',
    'MOP',
    'ROP',
    'ROV',
    'MOV',
    'LOGIST',
    'MARKETER',
    'ASSISTANT',
  )
  @ApiOperation({ summary: 'Получить список доставок' })
  async getList(
    @CurrentUser() user: UserDto,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('take', new DefaultValuePipe(20), ParseIntPipe) take: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('groupId', new ParseIntPipe({ optional: true }))
    groupId?: number,
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
    return this.deliveriesService.getList(user, from, to, take, page, groupId);
  }

  // Создание записи
  @Post()
  @ApiOperation({ summary: 'Создать запись о доставке' })
  @ApiResponse({ status: 201, description: 'Запись успешно создана' })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV', 'LOGIST')
  async create(
    @Body() createDto: DeliveryCreateDto,
    @CurrentUser() user: UserDto,
  ) {
    return this.deliveriesService.create(createDto, user);
  }

  // Редактирование записи
  @Patch(':id')
  @ApiOperation({ summary: 'Редактировать запись о доставке' })
  @ApiParam({ name: 'id', description: 'ID доставки', type: 'integer' })
  @ApiResponse({ status: 200, description: 'Запись успешно обновлена' })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV', 'LOGIST', 'DP')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: DeliveryUpdateDto,
    @CurrentUser() user: UserDto,
  ) {
    return this.deliveriesService.update(id, updateDto, user);
  }

  // Удаление записи
  @Delete(':id')
  @ApiOperation({ summary: 'Удалить запись о доставке' })
  @ApiParam({ name: 'id', description: 'ID доставки', type: 'integer' })
  @ApiNoContentResponse({ description: 'Запись успешно удалена' })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROV', 'LOGIST')
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserDto,
  ) {
    await this.deliveriesService.delete(id, user);
  }
}
