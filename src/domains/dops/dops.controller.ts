import { Controller, Post, Get, Body, Delete, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DopsService } from './dops.service';
import { CreateDopDto } from './dto/dop-create.dto';

@ApiTags('dops') // Добавляем тег для Swagger
@Controller('dops')
export class DopsController {
  constructor(private readonly dopService: DopsService) {}

  @Post()
  @ApiOperation({ summary: 'Создать доп. услугу', description: 'Создает новую доп. услугу.' })
  @ApiResponse({ status: 201, description: 'Доп. услуга успешно создана.' })
  @ApiResponse({ status: 404, description: 'Сделка или пользователь не найдены.' })
  async create(
    @Body() createDopDto: CreateDopDto,
  ) {
    return this.dopService.create(createDopDto);
  }

  @Get('types')
  @ApiOperation({ summary: 'Получить список типов допов', description: 'Возвращает все типы допов.' })
  @ApiResponse({ status: 200, description: 'Список типов допов успешно получен.' })
  async getDopTypes() {
    return this.dopService.getDopTypes();
  }
    
  @Delete(':id')
  @ApiOperation({ summary: 'Удалить доп. услугу', description: 'Удаляет доп. услугу по ID.' })
  @ApiResponse({ status: 200, description: 'Доп. услуга успешно удалена.' })
  @ApiResponse({ status: 404, description: 'Доп. услуга не найдена.' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.dopService.delete(id);
  }
}