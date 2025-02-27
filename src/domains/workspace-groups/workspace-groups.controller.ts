import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GroupsService } from '../../domains/groups/groups.service';
import { CreateWorkspaceGroupDto } from './dto/create-workspace-group.dto';

@ApiTags('workspaces/id/groups')
@Controller('workspaces/:workspaceId/groups')
export class WorkspaceGroupsController {
  constructor(private readonly groupService: GroupsService) {}

  @Get()
  @ApiOperation({
    summary: 'Получить группы рабочего пространства',
    description:
      'Возвращает список всех групп, принадлежащих рабочему пространству с указанным id.',
  })
  async getGroupsByWorkspace(
    @Param('workspaceId', ParseIntPipe) workspaceId: number,
  ) {
    return this.groupService.findAllByWorkspace(workspaceId);
  }

  @Post()
  @ApiOperation({
    summary: 'Создать группу для рабочего пространства',
    description:
      'Создает новую группу для рабочего пространства с указанным id.',
  })
  async createGroupForWorkspace(
    @Param('workspaceId', ParseIntPipe) workspaceId: number,
    @Body() createGroupDto: CreateWorkspaceGroupDto,
  ) {
    return this.groupService.createGroupForWorkspace(
      workspaceId,
      createGroupDto,
    );
  }
}
