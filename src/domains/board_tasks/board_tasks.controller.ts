import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';

import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TasksService } from './board_tasks.service';
import { UserDto } from '../users/dto/user.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { KanbanFilesService } from '../kanban-files/kanban-files.service';
import { MoveTaskDto } from './dto/move-task.dto';
import { UpdateTaskTagsDto } from './dto/update-task-tags.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateTaskOrderDto } from './dto/order.dto';
import { UpdateTaskOrderDto } from './dto/update-order.dto';

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

  /**
   * Заменить теги у задачи на присланный список имён.
   * Пример тела: { "tags": ["bug", "urgent"] }
   */
  @Post(':taskId/tags')
  async replace(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateTaskTagsDto,
  ) {
    return this.tasksService.replaceTaskTags(taskId, dto);
  }

  /** Список комментариев задачи (с файлами и автором) */
  @Get(':taskId/comments')
  listForTask(@Param('taskId', ParseIntPipe) taskId: number) {
    return this.tasksService.listForTask(taskId);
  }

  /** Создать комментарий к задаче */
  @Post(':taskId/comments')
  async createForTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: UserDto,
  ) {
    const c = await this.tasksService.createForTask(taskId, user.id, dto.text);
    // компонент ожидает id, чтобы затем грузить файлы
    return { id: c.id };
  }

  /** Прикрепить файл к комментарию (1:N — файл получает commentId) */
  @Post('comments/:commentId/files')
  @UseInterceptors(FileInterceptor('file'))
  async attachFileToComment(
    @Param('commentId', ParseIntPipe) commentId: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserDto,
  ) {
    if (!file) throw new NotFoundException('No file provided');
    return this.tasksService.attachFileToComment(commentId, file, user.id);
  }

  /** Список заказов задачи */
  @Get(':taskId/orders')
  ordersListForTask(@Param('taskId', ParseIntPipe) taskId: number) {
    return this.tasksService.ordersListForTask(taskId);
  }

  /** Создать заказ для задачи */
  @Post(':taskId/orders')
  createOrderForTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CreateTaskOrderDto,
  ) {
    return this.tasksService.createOrderForTask(taskId, dto);
  }

  /** Получить один заказ */
  @Get('orders/:orderId')
  getOneOrder(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.tasksService.getOneOrder(orderId);
  }

  /** Обновить заказ (полная замена массивов неонов/подсветок) */
  @Patch('orders/:orderId')
  updateOrder(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: UpdateTaskOrderDto,
  ) {
    return this.tasksService.updateOrder(orderId, dto);
  }

  /** Мягкое удаление заказа */
  @Delete('orders/:orderId')
  removeOrder(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.tasksService.removeOrder(orderId);
  }
}
