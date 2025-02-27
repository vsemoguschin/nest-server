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
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { WorkSpaceDto } from './dto/workspace.dto';
import { Roles } from 'src/common/decorators/roles.decorator';

@ApiTags('workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly WorkspacesService: WorkspacesService) {}

  @Post()
  @ApiOperation({
    summary: 'Создать рабочее пространство',
    description:
      'Endpoint: POST /workspaces. Создает новое рабочее пространство с заданным названием и департаментом.',
  })
  async create(@Body() createWorkspaceDto: CreateWorkspaceDto) {
    return this.WorkspacesService.create(createWorkspaceDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Получить рабочее пространство с группами и пользователями',
    description:
      'Endpoint: GET /workspaces/:id. Возвращает рабочее пространство по id, включая группы этого пространства и пользователей внутри каждой группы.',
  })
  async getWorkSpaceWithGroups(@Param('id', ParseIntPipe) id: number) {
    return this.WorkspacesService.findOne(id);
  }

  @Get()
  @ApiOperation({
    summary: 'Получить список рабочих пространств',
    description:
      'Endpoint: GET /workspaces. Возвращает список всех активных рабочих пространств.',
  })
  @Roles( 'G', 'KD', 'DO', 'ROD')
  async findAll(@CurrentUser() user: User) :Promise<WorkSpaceDto[]> {
    return this.WorkspacesService.findAll(user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить рабочее пространство',
    description:
      'Endpoint: PATCH /workspaces/:id. Обновляет данные рабочего пространства по его id. Можно обновлять отдельные поля.',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateWorkspaceDto: UpdateWorkspaceDto,
  ) {
    return this.WorkspacesService.update(id, updateWorkspaceDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Мягкое удаление рабочего пространства',
    description:
      'Endpoint: DELETE /workspaces/:id. Выполняет мягкое удаление рабочего пространства, устанавливая значение deletedAt, чтобы оно не удалялось полностью из базы.',
  })
  async softDelete(@Param('id', ParseIntPipe) id: number) {
    return this.WorkspacesService.softDelete(id);
  }
}
