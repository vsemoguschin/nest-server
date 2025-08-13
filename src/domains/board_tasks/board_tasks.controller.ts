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
import { CreateTaskDto } from './dto/create-task.dto';

// ⚠️ Проверь пути к декораторам/гарду/DTO пользователя
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TasksService } from './board_tasks.service';
import { UserDto } from '../users/dto/user.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { KanbanFilesService } from '../kanban-files/kanban-files.service';
import { MoveTaskDto } from './dto/move-task.dto';

@UseGuards(RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly filesService: KanbanFilesService, // ← внедрили
  ) {}

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Post()
  async createTask(@CurrentUser() user: UserDto, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user.id, dto);
  }

  // Полная информация по карточке
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Get(':taskId')
  async getOne(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.tasksService.getOne(user.id, taskId);
  }

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Patch(':taskId')
  async updateTask(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(user.id, taskId, dto);
  }

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Delete(':taskId')
  async deleteTask(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.tasksService.remove(user.id, taskId);
  }

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Get(':taskId/attachments/refresh')
  async refreshAttachments(
    @CurrentUser() user: UserDto,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('columnId', ParseIntPipe) columnId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.filesService.refreshAndListForTask(
      user.id,
      boardId,
      columnId,
      taskId,
    );
  }

  @Patch(':taskId/move')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  async moveTask(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: MoveTaskDto,
  ) {
    return this.tasksService.move(user.id, taskId, dto);
  }
}
