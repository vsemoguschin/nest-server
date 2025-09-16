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
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';

import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TasksService } from './board_tasks.service';
import { UserDto } from '../users/dto/user.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { UpdateTaskTagsDto } from './dto/update-task-tags.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateTaskOrderDto } from './dto/order.dto';
import { UpdateTaskOrderDto } from './dto/update-order.dto';
import { TaskAuditService } from 'src/services/boards/task-audit.service';
import { TaskCommentsService } from 'src/services/boards/task-comments.service';
import { TaskNotifyService } from 'src/services/task-notify.service';
import { TaskFilesService } from 'src/services/boards/task-files.service';
import { AttachmentsService } from '../kanban/attachments/attachments.service';
import { TaskMembersService } from '../kanban/members/members.service';
import { SearchTasksDto } from './dto/search-tasks.dto';
import { ApiBody, ApiOperation } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { CopyTaskToBoardDto } from './dto/copy-to-board.dto';

class UpdateCoverDto {
  @IsString()
  @IsNotEmpty()
  path!: string;
}

@UseGuards(RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly attachmentsService: AttachmentsService,
    private readonly membersService: TaskMembersService,
    private readonly audit: TaskAuditService,
    private readonly comments: TaskCommentsService,
    private readonly notify: TaskNotifyService,
    private readonly filesService: TaskFilesService,
  ) {}

  @Get('search')
  async search(
    @CurrentUser() user: UserDto,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    dto: SearchTasksDto,
  ) {
    // поиск по chatLink среди всех задач (без фильтра по доскам)
    return this.tasksService.searchByChatLink(dto, user);
  }

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV', 'MOP', 'MOV', 'DIZ')
  @Post()
  async createTask(@CurrentUser() user: UserDto, @Body() dto: CreateTaskDto) {
    const column = await this.tasksService.ensureTaskColumn(dto.columnId);
    const task = await this.tasksService.create(user, dto, column.boardId);
    await this.audit.log({
      userId: user.id,
      taskId: task.id,
      action: 'TASK_CREATED',
      description: `${user.fullName} создал карточку`,
    });
    return task;
  }

  // Полная информация по карточке
  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DO',
    'ROD',
    'DP',
    'ROV',
    'MOP',
    'MOV',
    'DIZ',
    'ASSISTANT',
    'LOGIST'
  )
  @Get(':taskId')
  async getOne(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.tasksService.getOne(user.id, taskId);
  }

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV', 'MOP', 'MOV', 'DIZ', 'LOGIST')
  @Patch(':taskId')
  async updateTask(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateTaskDto,
  ) {
    const task = await this.tasksService.ensureTask(taskId);

    const res = await this.tasksService.updateTask(user.id, task, dto);
    const { updated, field, fromVal, toVal } = res; // всё типобезопасно
    await this.tasksService.ensureMember(task.id, user.id);
    if (res.changed) {
      await this.audit.log({
        userId: user.id,
        taskId,
        action: 'UPDATE_TASK',
        description: `Изменено поле: ${field}. Было - "${fromVal}", стало - "${toVal}"`,
      });

      await this.notify.notifyParticipants({
        taskId,
        actorUserId: user.id,
        message: `Изменено поле: ${field}. Было - "${fromVal}", стало - "${toVal}"`,
        // link опционально, если не передашь — сгенерится автоматически
      });
    }
    return updated;
  }

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Delete(':taskId')
  async deleteTask(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    const task = await this.tasksService.ensureTask(taskId);
    return this.tasksService.deleteTask(user.id, task);
  }

  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DO',
    'ROD',
    'DP',
    'ROV',
    'MOP',
    'MOV',
    'DIZ',
    'ASSISTANT',
    'LOGIST'
  )
  @Get(':taskId/attachments')
  async getAttachmentsByTaskId(@Param('taskId', ParseIntPipe) taskId: number) {
    return this.attachmentsService.getAttachmentsByTaskId(taskId);
  }

  @Patch(':taskId/move')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV', 'MOP', 'MOV', 'DIZ', 'LOGIST')
  async updateTaskColumnId(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: MoveTaskDto,
  ) {
    const task = await this.tasksService.ensureTask(taskId);
    const { updated, movedBetweenColumns, fromColumn, targetColumn } =
      await this.tasksService.updateTaskColumnId(user, task, dto);
    await this.tasksService.ensureMember(task.id, user.id);
    const msg = `Перемещение: «${fromColumn?.title ?? '—'}» → «${targetColumn.title}»`;
    await this.audit.log({
      userId: user.id,
      taskId,
      action: 'MOVE_TASK',
      description: movedBetweenColumns
        ? msg
        : `Изменение позиции в колонке «${targetColumn.title}»`,
      payload: {
        fromColumnId: fromColumn?.id ?? null,
        fromColumnTitle: fromColumn?.title ?? null,
        toColumnId: targetColumn.id,
        toColumnTitle: targetColumn.title,
        positionBefore: task.position,
        positionAfter: updated.position,
        afterTaskId: dto.afterTaskId ?? null,
      },
    });

    await this.notify.notifyParticipants({
      taskId,
      actorUserId: user.id,
      message: msg,
      // link опционально, если не передашь — сгенерится автоматически
    });
    return { updated, message: msg };
  }

  @Patch(':taskId/move-to-next-column')
  @ApiOperation({ summary: 'Переместить задачу в следующую колонку' })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV', 'MOP', 'MOV', 'DIZ', 'LOGIST')
  async moveToNextColumn(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    // const task = await this.tasksService.ensureTask(taskId);
    const { updated, fromColumn, targetColumn } =
      await this.tasksService.moveToNextColumn(taskId);
    await this.tasksService.ensureMember(taskId, user.id);
    const msg = `Перемещение: «${fromColumn?.title ?? '—'}» → «${targetColumn.title}»`;
    await this.audit.log({
      userId: user.id,
      taskId,
      action: 'MOVE_TASK',
      description: msg,
    });
    return updated;
  }

  @Post(':taskId/copy-to-board')
  @ApiOperation({
    summary:
      'Копировать задачу на другую доску (без cover), с дубликатами orders',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROV', 'MOV')
  async copyToBoard(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CopyTaskToBoardDto,
  ) {
    const created = await this.tasksService.copyToBoard(user, taskId, dto);
    await this.audit.log({
      userId: user.id,
      taskId: created.id,
      action: 'TASK_CREATED',
      description: `Скопировано из #${taskId} → доска ${dto.boardId}`,
      payload: { fromTaskId: taskId, toBoardId: dto.boardId },
    });
    return created;
  }

  /**
   * Заменить теги у задачи на присланный список имён.
   * Пример тела: { "tags": ["bug", "urgent"] }
   */
  @Post(':taskId/tags')
  async replaceTaskTags(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateTaskTagsDto,
  ) {
    const task = await this.tasksService.ensureTask(taskId);
    const { tags, removedNames, addedNames, names } =
      await this.tasksService.replaceTaskTags(user.id, task, dto);

    if (removedNames.length) {
      await this.audit.log({
        userId: user.id,
        taskId: task.id,
        action: 'UPDATE_TAGS',
        description: `Убраны метки: ${removedNames.join(', ')}`,
        payload: { added: [], removed: removedNames },
      });
      await this.notify.notifyParticipants({
        taskId: task.id,
        actorUserId: user.id,
        message: `Убраны метки: ${removedNames.join(', ')}`,
      });
    }

    const hasAdded = !!addedNames?.length;
    if (hasAdded || removedNames.length > 0) {
      // восстановим «человеческие» имена как они были в запросе, для added
      const addedHuman = hasAdded
        ? names.filter((n) => addedNames!.includes(n.toLowerCase()))
        : [];
      await this.audit.log({
        userId: user.id,
        taskId: task.id,
        action: 'UPDATE_TAGS',
        description: [
          addedHuman.length ? `Добавлены метки: ${addedHuman.join(', ')}` : '',
          removedNames.length
            ? `Удалены метки: ${removedNames.join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join('; '),
        payload: { added: addedHuman, removed: removedNames, addedNames },
      });
      await this.notify.notifyParticipants({
        taskId: task.id,
        actorUserId: user.id,
        message: [
          addedHuman.length ? `Добавлены метки: ${addedHuman.join(', ')}` : '',
          removedNames.length
            ? `Удалены метки: ${removedNames.join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join('; '),
      });
    }

    return { taskId, tags };
  }

  /** Список комментариев задачи (с файлами и автором) */
  @Get(':taskId/comments')
  async listForTask(@Param('taskId', ParseIntPipe) taskId: number) {
    await this.tasksService.ensureTask(taskId);
    return this.comments.listForTask(taskId);
  }

  /** Создать комментарий к задаче */
  @Post(':taskId/comments')
  async createForTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: UserDto,
  ) {
    await this.tasksService.ensureTask(taskId);
    const comment = await this.comments.createForTask(
      taskId,
      user.id,
      dto.text,
    );
    await this.notify.notifyParticipants({
      taskId,
      actorUserId: user.id,
      message: `Оставил комментарий: ${comment.text}`,
    });
    // компонент ожидает id, чтобы затем грузить файлы
    return { id: comment.id };
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
    const comment = await this.comments.ensureComment(commentId);
    const task = await this.tasksService.ensureTask(comment.task.id);
    const dbFile = await this.filesService.uploadFile(
      file,
      user.id,
      task.boardId,
      comment.id,
    );
    await this.attachmentsService.create(task.id, dbFile.id);
    await this.tasksService.ensureMember(task.id, user.id);
    await this.notify.notifyParticipants({
      taskId: comment.task.id,
      actorUserId: user.id,
      message: 'Добавлено вложение',
    });

    await this.audit.log({
      userId: user.id,
      description: 'Добавил вложение ' + dbFile.name,
      taskId: comment.task.id,
      action: 'ADD_ATTACHMENTS',
    });
    return dbFile;
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

  @Get(':taskId/members')
  async getTaskMembers(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    await this.tasksService.ensureTask(taskId);
    return this.membersService.getMembers(user.id, taskId);
  }

  @Get(':taskId/avaliable-members')
  async getAvaliableMembers(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    const task = await this.tasksService.ensureTask(taskId);
    return await this.membersService.getAvaliableMembers(taskId, task.boardId);
  }

  @Get(':taskId/avaliable-columns')
  async getAvaliableColumns(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    const task = await this.tasksService.ensureTask(taskId);
    return await this.tasksService.getAvaliableColumns(
      task.columnId,
      task.boardId,
    );
  }

  @Post(':id/column/:columnId')
  async moveTaskToColumn(
    @Param('id', ParseIntPipe) id: number,
    @Param('columnId', ParseIntPipe) columnId: number,
    // @CurrentUser('user') user: UserDto,
  ) {
    const task = await this.tasksService.updateColumn(id, columnId);
    return { task };
  }

  @Post(':taskId/members/:userId')
  async addMemberToTask(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    const task = await this.tasksService.ensureTask(taskId);
    const newMember = await this.membersService.addMemberToTask(task, userId);
    await this.audit.log({
      userId: user.id,
      taskId,
      action: 'ADD_MEMBER',
      description: `${user.fullName} добавил ${newMember.fullName}`,
    });

    await this.notify.notifyParticipants({
      taskId,
      actorUserId: user.id,
      message: `${user.fullName} добавил ${newMember.fullName}`,
      // link опционально, если не передашь — сгенерится автоматически
    });
    return newMember;
  }
  @Delete(':taskId/members/:userId')
  async deleteMemberFromTask(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    const task = await this.tasksService.ensureTask(taskId);
    const deletedMember = await this.membersService.deleteMemberFromTask(
      task,
      userId,
    );
    await this.audit.log({
      userId: user.id,
      taskId,
      action: 'ADD_MEMBER',
      description: `${user.fullName} удалил ${deletedMember.fullName}`,
    });

    await this.notify.notifyParticipants({
      taskId,
      actorUserId: user.id,
      message: `${user.fullName} удалил ${deletedMember.fullName}`,
    });
    return deletedMember;
  }

  @Get(':taskId/audit')
  async getTaskAudit(@Param('taskId', ParseIntPipe) taskId: number) {
    await this.tasksService.ensureTask(taskId);
    return this.audit.getTaskAudit(taskId);
  }

  @Patch(':id/cover')
  @ApiOperation({ summary: 'Установить обложку задачи' })
  @ApiBody({ schema: { properties: { path: { type: 'string' } } } })
  async setCover(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCoverDto,
  ) {
    // сервис обновит поле cover путём из dto.path и вернёт обновлённую задачу
    const task = await this.tasksService.updateCover(id, dto.path);
    return { message: 'Обложка обновлена' };
  }
}
