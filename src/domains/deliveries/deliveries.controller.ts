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

@UseGuards(RolesGuard)
@ApiTags('deliveries')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get('/checkTrack')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV', 'LOGIST')
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
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV', 'LOGIST')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: DeliveryCreateDto,
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
