import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
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

@ApiTags('deliveries')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  // Создание записи
  @Post()
  @ApiOperation({ summary: 'Создать запись о доставке' })
  @ApiResponse({ status: 201, description: 'Запись успешно создана' })
  async create(@Body() createDto: DeliveryCreateDto) {
    return this.deliveriesService.create(createDto);
  }

  // Редактирование записи
  @Patch(':id')
  @ApiOperation({ summary: 'Редактировать запись о доставке' })
  @ApiParam({ name: 'id', description: 'ID доставки', type: 'integer' })
  @ApiResponse({ status: 200, description: 'Запись успешно обновлена' })
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
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.deliveriesService.delete(id);
  }
}
