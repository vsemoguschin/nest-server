import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ColumnsService } from './columns.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDto } from '../users/dto/user.dto';

@UseGuards(RolesGuard)
@Controller('columns')
export class ColumnsController {
  constructor(private readonly columnsService: ColumnsService) {}

  // Получить колонки конкретной доски
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Get()
  async list(
    @CurrentUser() user: UserDto,
    @Param('boardId', ParseIntPipe) boardId: number,
  ) {
    return this.columnsService.listForBoard(user.id, boardId);
  }

  // Создать колонку в доске
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Post()
  async create(
    @CurrentUser() user: UserDto,
    @Body() dto: CreateColumnDto,
  ) {
    return this.columnsService.create(user.id, dto);
  }

  // Обновить колонку (название/позицию)
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Patch(':id')
  async update(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.columnsService.update(user.id, id, dto);
  }

  // Удалить (soft) колонку
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Delete(':id')
  async remove(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.columnsService.remove(user.id, id);
  }
}
