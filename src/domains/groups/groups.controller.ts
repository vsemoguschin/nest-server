import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDto } from '../users/dto/user.dto';

@ApiTags('groups')
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @ApiOperation({
    summary: 'Создать группу',
    description:
      'Endpoint: POST /groups. Создает новую группу с уникальным названием и связывает с рабочим пространством.',
  })
  async create(@Body() createGroupDto: CreateGroupDto) {
    return this.groupsService.create(createGroupDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Получить список групп',
    description: 'Endpoint: GET /groups. Возвращает список всех групп.',
  })
  async findAll(
    @CurrentUser() user: UserDto,
  ) {
    return this.groupsService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Получить группу по id',
    description:
      'Endpoint: GET /groups/:id. Возвращает данные группы по указанному id.',
  })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.groupsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить группу',
    description:
      'Endpoint: PATCH /groups/:id. Обновляет данные группы по ее id.',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateGroupDto: UpdateGroupDto,
  ) {
    return this.groupsService.update(id, updateGroupDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить группу',
    description: 'Endpoint: DELETE /groups/:id. Удаляет группу по id.',
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.groupsService.remove(id);
  }
}
