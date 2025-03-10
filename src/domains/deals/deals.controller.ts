import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DealsService } from './deals.service';
import { CreateDealDto } from './dto/deal-create.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDto } from '../users/dto/user.dto';
import { DealDto } from './dto/deal.dto';
import { UpdateDealDto } from './dto/deal-update.dto';
import { UpdateDealersDto } from './dto/dealers-update.dto';

@UseGuards(RolesGuard)
@ApiTags('deals')
@Controller('deals')
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get('/datas')
  @ApiOperation({
    summary: 'Получить данные',
    description: 'Endpoint: GET /deals/datas. Получить данные.',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async getDatas(): Promise<any> {
    return this.dealsService.getDatas();
  }

  @Get('sources')
  async getSources() {
    return this.dealsService.getSources()
  }

  @Post()
  @ApiOperation({
    summary: 'Создать сделку',
    description: 'Endpoint: POST /deals. Создает новое сделку.',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async create(
    @Body() createDealDto: CreateDealDto,
    @CurrentUser() user: UserDto,
  ): Promise<CreateDealDto> {
    console.log(createDealDto);
    return this.dealsService.create(createDealDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Получить все сделки',
    description:
      'Endpoint: GET /deals?period=YYYY-MM. Получить все сделки за указанный период.',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async getList(
    @CurrentUser() user: UserDto,
    @Query('start') start: string,
    @Query('end') end: string,
  ): Promise<any> {
    if (
      !start ||
      !end ||
      !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end)
    ) {
      throw new BadRequestException(
        'Параметры start и end обязательны и должны быть в формате YYYY-MM-DD',
      );
    }
    return this.dealsService.getList(user, start, end);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Получить сделку',
    description: 'Endpoint: GET /deals/:id. Получить все сделки.',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async getOne(@Param('id', ParseIntPipe) id: number): Promise<DealDto> {
    return this.dealsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Редактировать сделку',
    description: 'Endpoint: PATCH /clients. Редактировать сделку.',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDealDto: UpdateDealDto,
  ) {
    return this.dealsService.update(id, updateDealDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить сделку',
    description: 'Endpoint: DELETE /groups/:id. Удаляет сделку по id.',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROP')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.dealsService.delete(id);
  }

  @Patch(':dealId/dealers')
  @ApiOperation({ summary: 'Обновить список дилеров сделки', description: 'Обновляет список дилеров для указанной сделки.' })
  @ApiResponse({ status: 200, description: 'Список дилеров успешно обновлен.' })
  @ApiResponse({ status: 400, description: 'Неверные данные или сумма не совпадает.' })
  @ApiResponse({ status: 404, description: 'Сделка не найдена.' })
  async updateDealers(
    @Param('dealId', ParseIntPipe) dealId: number,
    @Body() updateDealersDto: UpdateDealersDto,
  ) {
    return this.dealsService.updateDealers(dealId, updateDealersDto);
  }

}
