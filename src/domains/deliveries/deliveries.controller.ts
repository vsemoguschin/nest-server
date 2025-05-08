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
  ) {
    return this.deliveriesService.update(id, updateDto);
  }

  // Удаление записи
  @Delete(':id')
  @ApiOperation({ summary: 'Удалить запись о доставке' })
  @ApiParam({ name: 'id', description: 'ID доставки', type: 'integer' })
  @ApiNoContentResponse({ description: 'Запись успешно удалена' })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROV', 'LOGIST')
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.deliveriesService.delete(id);
  }
}
