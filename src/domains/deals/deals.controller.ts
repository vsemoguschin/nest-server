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
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV', 'MARKETER')
  async getDatas(@CurrentUser() user: UserDto): Promise<any> {
    return this.dealsService.getDatas(user);
  }

  @Get('sources')
  async getSources() {
    return this.dealsService.getSources();
  }

  @Post()
  @ApiOperation({
    summary: 'Создать сделку',
    description: 'Endpoint: POST /deals. Создает новое сделку.',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'MOV')
  async create(
    @Body() createDealDto: CreateDealDto,
    @CurrentUser() user: UserDto,
  ): Promise<CreateDealDto> {
    // console.log(createDealDto);
    return this.dealsService.create(createDealDto, user);
  }

  @Get('')
  @ApiOperation({
    summary: 'Получить все сделки группы',
    description:
      'Endpoint: GET /deals?period=YYYY-MM. Получить все сделки за указанный период.',
  })
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
  async getList(
    @CurrentUser() user: UserDto,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupId') groupId?: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('status') status?: string[] | string,
    @Query('maketType') maketType?: string[] | string,
    @Query('source') source?: string[] | string,
    @Query('adTag') adTag?: string[] | string,
    @Query('daysGone') daysGone?: string[] | string,
    @Query('dealers') dealers?: string[] | string,
    @Query('haveReviews') haveReviews?: string[] | string,
    @Query('isRegular') isRegular?: string[] | string,
    @Query('boxsize') boxsize?: string[] | string,
  ): Promise<any> {
    console.log(boxsize);
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
    const pageNumber = page !== undefined ? Number(page) : undefined;
    const limitNumber = limit !== undefined ? Number(limit) : undefined;

    const toArray = (value?: string | string[]) => {
      if (value === undefined) return undefined;
      const prepared = Array.isArray(value)
        ? value
        : value.split(',');
      const normalized = prepared
        .map((item) => item?.trim())
        .filter((item): item is string => !!item);
      return normalized.length ? normalized : undefined;
    };

    const numberArray = (value?: string | string[]) =>
      toArray(value)
        ?.map((item) => Number(item))
        .filter((item) => Number.isFinite(item));

    const filters = {
      status: toArray(status),
      maketType: toArray(maketType),
      source: toArray(source),
      adTag: toArray(adTag),
      daysGone: toArray(daysGone),
      dealers: numberArray(dealers),
      haveReviews: toArray(haveReviews),
      isRegular: toArray(isRegular),
      boxsize: toArray(boxsize),
    };

    return this.dealsService.getList(
      user,
      from,
      to,
      groupId,
      pageNumber,
      limitNumber,
      sortBy,
      sortOrder,
      filters,
    );
  }

  @Get('search')
  @ApiOperation({
    summary: 'Поиск сделок по названию',
    description:
      'Endpoint: GET /deals/search?name=Название. Поиск сделок по названию.',
  })
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
    'ASSISTANT',
  )
  async searchDealsByName(
    @CurrentUser() user: UserDto,
    @Query('name') name: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ): Promise<any> {
    if (!name || name.trim() === '') {
      throw new BadRequestException('Параметр name обязателен.');
    }
    const pageNumber = page !== undefined ? Number(page) : undefined;
    const limitNumber = limit !== undefined ? Number(limit) : undefined;

    return this.dealsService.searchByName(
      user,
      name,
      pageNumber,
      limitNumber,
      sortBy,
      sortOrder,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Получить сделку',
    description: 'Endpoint: GET /deals/:id. Получить все сделки.',
  })
  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DO',
    'MOP',
    'ROP',
    'ROV',
    'MOV',
    // 'LOGIST',
    'MARKETER',
    'ASSISTANT',
  )
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserDto,
  ): Promise<DealDto> {
    return this.dealsService.findOne(user, id);
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
    @CurrentUser() user: UserDto,
  ) {
    return this.dealsService.update(id, updateDealDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить сделку',
    description: 'Endpoint: DELETE /groups/:id. Удаляет сделку по id.',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROP')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserDto,
  ) {
    return this.dealsService.delete(id, user);
  }

  @Patch(':dealId/dealers')
  @ApiOperation({
    summary: 'Обновить список дилеров сделки',
    description: 'Обновляет список дилеров для указанной сделки.',
  })
  @ApiResponse({ status: 200, description: 'Список дилеров успешно обновлен.' })
  @ApiResponse({
    status: 400,
    description: 'Неверные данные или сумма не совпадает.',
  })
  @ApiResponse({ status: 404, description: 'Сделка не найдена.' })
  async updateDealers(
    @Param('dealId', ParseIntPipe) dealId: number,
    @Body() updateDealersDto: UpdateDealersDto,
    @CurrentUser() user: UserDto,
  ) {
    return this.dealsService.updateDealers(dealId, updateDealersDto, user);
  }

  @Get(':id/deal-history')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'LOGIST', 'ROV', 'MOV')
  async getHistory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserDto,
  ) {
    return this.dealsService.getHistory(id, user);
  }
}
