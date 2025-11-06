import {
  Controller,
  Post,
  Get,
  Body,
  Delete,
  Param,
  ParseIntPipe,
  UseGuards,
  Query,
  BadRequestException,
  DefaultValuePipe,
  ParseArrayPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DopsService } from './dops.service';
import { CreateDopDto } from './dto/dop-create.dto';
import { UserDto } from '../users/dto/user.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';

type GroupDopItem = {
  id: number;
  dealId: number;
  dealTitle: string;
  dealSaleDate: string;
  saleDate: string;
  userId: number;
  price: number;
  type: string;
  userFullName: string;
};

type GroupDopListResponse = {
  totalDopPrice: number;
  items: GroupDopItem[];
};

@UseGuards(RolesGuard)
@ApiTags('dops') // Добавляем тег для Swagger
@Controller('dops')
export class DopsController {
  constructor(private readonly dopService: DopsService) {}

  @Get('group')
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
    @Query('take', new DefaultValuePipe(20), ParseIntPipe) take: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('groupId', new ParseIntPipe({ optional: true }))
    groupId?: number,
    @Query(
      'managersIds',
      new ParseArrayPipe({ items: Number, optional: true, separator: ',' }),
    )
    managersIds?: number[],
  ): Promise<GroupDopListResponse> {
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
    return this.dopService.getList(
      user,
      from,
      to,
      take,
      page,
      groupId,
      managersIds,
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Создать доп. услугу',
    description: 'Создает новую доп. услугу.',
  })
  @ApiResponse({ status: 201, description: 'Доп. услуга успешно создана.' })
  @ApiResponse({
    status: 404,
    description: 'Сделка или пользователь не найдены.',
  })
  async create(
    @Body() createDopDto: CreateDopDto,
    @CurrentUser() user: UserDto,
  ) {
    return this.dopService.create(createDopDto, user);
  }

  @Get('types')
  @ApiOperation({
    summary: 'Получить список типов допов',
    description: 'Возвращает все типы допов.',
  })
  @ApiResponse({
    status: 200,
    description: 'Список типов допов успешно получен.',
  })
  async getDopTypes() {
    return this.dopService.getDopTypes();
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить доп. услугу',
    description: 'Удаляет доп. услугу по ID.',
  })
  @ApiResponse({ status: 200, description: 'Доп. услуга успешно удалена.' })
  @ApiResponse({ status: 404, description: 'Доп. услуга не найдена.' })
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserDto,
  ) {
    return this.dopService.delete(id, user);
  }
}
