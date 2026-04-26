import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
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
import * as multer from 'multer';
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
import { ListArchivedDto } from './dto/list-archived.dto';
import { ApiBody, ApiOperation } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';
import { CopyTaskToBoardDto } from './dto/copy-to-board.dto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DeliveryForTaskCreateDto } from '../deliveries/dto/delivery-for-task-create.dto';
import { AuditService } from '../../common/audit/audit.service';

const ONE_GB = 1024 * 1024 * 1024;
const TMP_DIR = path.join(os.tmpdir(), 'easycrm-uploads');
const ORDER_AUDIT_FIELD_LABELS: Record<string, string> = {
  title: 'Название',
  deadline: 'Дедлайн',
  material: 'Материал',
  boardWidth: 'Ширина',
  boardHeight: 'Высота',
  holeType: 'Тип отверстия',
  holeInfo: 'Инфо по отверстию',
  stand: 'Подставка',
  laminate: 'Ламинация',
  print: 'Печать',
  printQuality: 'Качество печати',
  isAcrylic: 'Акрил',
  acrylic: 'Акрил (описание)',
  type: 'Тип',
  wireInfo: 'Инфо по проводу',
  wireType: 'Тип провода',
  wireLength: 'Длина провода',
  elements: 'Элементы',
  gift: 'Подарок',
  adapter: 'Адаптер',
  adapterInfo: 'Инфо по адаптеру',
  adapterModel: 'Модель адаптера',
  plug: 'Вилка',
  plugColor: 'Цвет вилки',
  plugLength: 'Длина вилки',
  fitting: 'Крепёж',
  dimmer: 'Диммер',
  dimmerType: 'Тип диммера',
  switch: 'Выключатель',
  screen: 'Экран',
  giftPack: 'Подарочная упаковка',
  docs: 'Документы',
  description: 'Описание',
  dealId: 'Сделка',
  neons: 'Неон',
  lightings: 'Подсветка',
  packageItems: 'Комплектующие упаковки',
};

type OrderAuditChange = {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
};

class UpdateCoverDto {
  @IsString()
  @IsNotEmpty()
  path!: string;
}

class SetArchivedDto {
  @IsBoolean()
  archived!: boolean;
}

@UseGuards(RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly attachmentsService: AttachmentsService,
    private readonly membersService: TaskMembersService,
    private readonly audit: TaskAuditService,
    private readonly dealAudit: AuditService,
    private readonly comments: TaskCommentsService,
    private readonly notify: TaskNotifyService,
    private readonly filesService: TaskFilesService,
  ) {}

  private toPlainJson(value: unknown): unknown {
    if (value === undefined) return null;
    return JSON.parse(JSON.stringify(value));
  }

  private resolveOrderTitle(orderLike: { title?: unknown } | null | undefined) {
    const title = String(orderLike?.title ?? '').trim();
    return title.length ? title : null;
  }

  private resolveOrderDealId(
    orderLike:
      | { dealId?: unknown; task?: { dealId?: unknown } | null }
      | null
      | undefined,
  ): number | null {
    const direct = Number(orderLike?.dealId);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const fromTask = Number(orderLike?.task?.dealId);
    if (Number.isFinite(fromTask) && fromTask > 0) return fromTask;
    return null;
  }

  private assertMoveOrCopyBoardAccess(user: UserDto) {
    if (user.role?.shortName === 'DIZ' && user.id !== 54) {
      throw new ForbiddenException('У вас нет доступа к этой операции');
    }
  }

  private normalizeOrderForAudit(order: any) {
    const neons = (order?.neons ?? [])
      .map((n) => ({
        width: n?.width ?? '',
        length: n?.length ?? 0,
        color: n?.color ?? '',
      }))
      .sort((a, b) =>
        `${a.width}|${a.length}|${a.color}`.localeCompare(
          `${b.width}|${b.length}|${b.color}`,
        ),
      );

    const lightings = (order?.lightings ?? [])
      .map((l) => ({
        length: l?.length ?? 0,
        color: l?.color ?? '',
        elements: l?.elements ?? 0,
      }))
      .sort((a, b) =>
        `${a.length}|${a.color}|${a.elements}`.localeCompare(
          `${b.length}|${b.color}|${b.elements}`,
        ),
      );

    const packageItems = (order?.package?.items ?? [])
      .map((item) => ({
        name: item?.name ?? '',
        category: item?.category ?? '',
        quantity: item?.quantity ?? 0,
        cost: item?.cost ?? 0,
      }))
      .sort((a, b) =>
        `${a.category}|${a.name}|${a.quantity}|${a.cost}`.localeCompare(
          `${b.category}|${b.name}|${b.quantity}|${b.cost}`,
        ),
      );

    return {
      title: order?.title ?? '',
      deadline: order?.deadline ?? '',
      material: order?.material ?? '',
      boardWidth: order?.boardWidth ?? null,
      boardHeight: order?.boardHeight ?? null,
      holeType: order?.holeType ?? '',
      holeInfo: order?.holeInfo ?? '',
      stand: order?.stand ?? false,
      laminate: order?.laminate ?? '',
      print: order?.print ?? false,
      printQuality: order?.printQuality ?? false,
      isAcrylic: order?.isAcrylic ?? false,
      acrylic: order?.acrylic ?? '',
      type: order?.type ?? '',
      wireInfo: order?.wireInfo ?? '',
      wireType: order?.wireType ?? '',
      wireLength: order?.wireLength ?? 0,
      elements: order?.elements ?? 0,
      gift: order?.gift ?? false,
      adapter: order?.adapter ?? '',
      adapterInfo: order?.adapterInfo ?? '',
      adapterModel: order?.adapterModel ?? '',
      plug: order?.plug ?? '',
      plugColor: order?.plugColor ?? '',
      plugLength: order?.plugLength ?? 0,
      fitting: order?.fitting ?? '',
      dimmer: order?.dimmer ?? false,
      dimmerType: order?.dimmerType ?? '',
      switch: order?.switch ?? false,
      screen: order?.screen ?? false,
      giftPack: order?.giftPack ?? false,
      docs: order?.docs ?? false,
      description: order?.description ?? '',
      dealId: order?.dealId ?? null,
      neons,
      lightings,
      packageItems,
    };
  }

  private buildOrderChanges(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): OrderAuditChange[] {
    const keys = Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)]),
    ).sort();
    const changes: OrderAuditChange[] = [];

    for (const key of keys) {
      const from = before[key] ?? null;
      const to = after[key] ?? null;
      if (JSON.stringify(from) === JSON.stringify(to)) continue;
      changes.push({
        field: key,
        label: ORDER_AUDIT_FIELD_LABELS[key] ?? key,
        from,
        to,
      });
    }

    return changes;
  }

  private buildOrderChangesFromDto(
    dto: UpdateTaskOrderDto,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    includeUnchanged = false,
  ): OrderAuditChange[] {
    const dtoObj = (dto ?? {}) as Record<string, unknown>;
    const dtoPayload = this.toPlainJson(dtoObj) as Record<
      string,
      unknown
    > | null;
    if (!dtoPayload || typeof dtoPayload !== 'object') {
      return [];
    }

    const keySet = new Set<string>([
      ...Object.keys(dtoObj),
      ...Object.keys(dtoPayload),
    ]);

    const changes: OrderAuditChange[] = [];
    for (const key of keySet) {
      const field = key === 'packageItems' ? 'packageItems' : key;
      const from = before[field] ?? null;
      const to = after[field] ?? dtoPayload[key] ?? null;
      const changed = JSON.stringify(from) !== JSON.stringify(to);

      if (!changed && !includeUnchanged) continue;
      changes.push({
        field,
        label: ORDER_AUDIT_FIELD_LABELS[field] ?? field,
        from,
        to,
      });
    }

    return changes;
  }

  private formatOrderAuditValue(value: unknown): string {
    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      return 'пусто';
    }
    if (typeof value === 'boolean') {
      return value ? 'Да' : 'Нет';
    }
    if (Array.isArray(value) || typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private buildOrderUpdateComment(
    orderLabel: string,
    changes: OrderAuditChange[],
  ) {
    if (!changes.length) {
      return `Обновлён заказ ${orderLabel} (без изменений)`;
    }

    return [
      `Обновлён заказ ${orderLabel}`,
      ...changes.map(
        (change) =>
          `${change.label}: "${this.formatOrderAuditValue(change.from)}" -> "${this.formatOrderAuditValue(change.to)}"`,
      ),
    ].join('\n');
  }

  @Get('search')
  async search(
    @CurrentUser() user: UserDto,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    dto: SearchTasksDto,
  ) {
    // поиск по chatLink среди всех задач (без фильтра по доскам)
    return this.tasksService.searchByChatLink(dto, user);
  }

  @Get('archived')
  async listArchived(
    @CurrentUser() user: UserDto,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    dto: ListArchivedDto,
  ) {
    return this.tasksService.listArchived(user, {
      boardId: dto.boardId,
      take: dto.take,
      cursor: dto.cursor,
    });
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
    'LOGIST',
  )
  @Post()
  async createTask(@CurrentUser() user: UserDto, @Body() dto: CreateTaskDto) {
    const column = await this.tasksService.ensureTaskColumn(dto.columnId);
    const task = await this.tasksService.create(user, dto, column.boardId);
    const { subscriptions } = column;

    // Получаем участников задачи для фильтрации подписок
    const taskWithMembers = await this.tasksService.ensureTask(task.id);
    const memberIds = new Set(
      (taskWithMembers.members || []).map((m: { id: number }) => m.id),
    );

    // Фильтруем подписки: если noticeType === 'only_my', оставляем только тех, кто является участником
    const filteredSubscriptions = subscriptions.filter((sub) => {
      if (sub.noticeType === 'only_my') {
        return memberIds.has(sub.userId);
      }
      return true; // 'all' - отправляем всем
    });

    await this.audit.log({
      userId: user.id,
      taskId: task.id,
      action: 'TASK_CREATED',
      description: `${user.fullName} создал карточку`,
    });
    await this.notify.notifyColumnSubscribers({
      taskId: task.id,
      boardId: column.boardId,
      taskTitle: task.title,
      subscriptions: filteredSubscriptions,
      columnTitle: column.title,
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
    'LOGIST',
    'MASTER',
    'RP',
    'PACKER',
    'PRINTER',
    'FRZ',
    'GUEST',
  )
  @Get(':taskId')
  async getOne(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.tasksService.getOne(user.id, taskId);
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
    'LOGIST',
  )
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

      // await this.notify.notifyParticipants({
      //   taskId,
      //   actorUserId: user.id,
      //   message: `Изменено поле: ${field}. Было - "${fromVal}", стало - "${toVal}"`,
      //   // link опционально, если не передашь — сгенерится автоматически
      // });
    }
    return updated;
  }

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV', 'LOGIST')
  @Delete(':taskId')
  async deleteTask(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    const task = await this.tasksService.ensureTask(taskId);
    await this.audit.log({
      userId: user.id,
      taskId: task.id,
      action: 'TASK_DELETED',
      description: `Задача удалена`,
    });
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
    'LOGIST',
    'MASTER',
    'RP',
    'PACKER',
    'PRINTER',
    'FRZ',
    'GUEST',
  )
  @Get(':taskId/attachments')
  async getAttachmentsByTaskId(@Param('taskId', ParseIntPipe) taskId: number) {
    return this.attachmentsService.getAttachmentsByTaskId(taskId);
  }

  @Patch(':taskId/move')
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
    'LOGIST',
    'MASTER',
    'RP',
    'PACKER',
    'PRINTER',
    'FRZ',
    'GUEST',
  )
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

    // await this.notify.notifyParticipants({
    //   taskId,
    //   actorUserId: user.id,
    //   message: msg,
    //   // link опционально, если не передашь — сгенерится автоматически
    // });
    if (movedBetweenColumns && targetColumn.subscriptions?.length) {
      // Получаем участников задачи для фильтрации подписок
      const taskWithMembers = await this.tasksService.ensureTask(taskId);
      const memberIds = new Set(
        (taskWithMembers.members || []).map((m: { id: number }) => m.id),
      );

      // Фильтруем подписки: если noticeType === 'only_my', оставляем только тех, кто является участником
      const filteredSubscriptions = targetColumn.subscriptions.filter((sub) => {
        if (sub.noticeType === 'only_my') {
          return memberIds.has(sub.userId);
        }
        return true; // 'all' - отправляем всем
      });

      await this.notify.notifyColumnSubscribers({
        taskId,
        boardId: targetColumn.boardId,
        taskTitle: updated.title,
        subscriptions: filteredSubscriptions,
        columnTitle: targetColumn.title,
      });
    }
    return { updated, message: msg };
  }

  @Patch(':taskId/move-to-next-column')
  @ApiOperation({ summary: 'Переместить задачу в следующую колонку' })
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
    'LOGIST',
    'MASTER',
    'RP',
    'PACKER',
    'PRINTER',
    'FRZ',
    'GUEST',
  )
  async moveToNextColumn(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    // const task = await this.tasksService.ensureTask(taskId);
    const { updated, fromColumn, targetColumn } =
      await this.tasksService.moveToNextColumn(taskId, user);
    await this.tasksService.ensureMember(taskId, user.id);
    const msg = `Перемещение: «${fromColumn?.title ?? '—'}» → «${targetColumn.title}»`;
    await this.audit.log({
      userId: user.id,
      taskId,
      action: 'MOVE_TASK',
      description: msg,
    });
    if (targetColumn.subscriptions?.length) {
      // Получаем участников задачи для фильтрации подписок
      const taskWithMembers = await this.tasksService.ensureTask(taskId);
      const memberIds = new Set(
        (taskWithMembers.members || []).map((m: { id: number }) => m.id),
      );

      // Фильтруем подписки: если noticeType === 'only_my', оставляем только тех, кто является участником
      const filteredSubscriptions = targetColumn.subscriptions.filter((sub) => {
        if (sub.noticeType === 'only_my') {
          return memberIds.has(sub.userId);
        }
        return true; // 'all' - отправляем всем
      });

      await this.notify.notifyColumnSubscribers({
        taskId,
        boardId: targetColumn.boardId,
        taskTitle: updated.title,
        subscriptions: filteredSubscriptions,
        columnTitle: targetColumn.title,
      });
    }
    return {
      taskId: updated.id,
      fromColumnId: fromColumn?.id ?? null,
      fromColumnTitle: fromColumn?.title ?? null,
      toColumnId: targetColumn.id,
      toColumnTitle: targetColumn.title,
      updatedTask: updated,
    };
  }

  // Архивировать/разархивировать карточку
  @Patch(':taskId/archived')
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
    'LOGIST',
  )
  async setArchived(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: SetArchivedDto,
  ) {
    const task = await this.tasksService.ensureTask(taskId);
    const updated = await this.tasksService.setArchived(
      user.id,
      task,
      dto.archived,
    );
    await this.audit.log({
      userId: user.id,
      taskId: task.id,
      action: 'TASK_ARCHIVED',
      description: dto.archived
        ? 'Задача перемещена в архив'
        : `Задача перемещена из архива`,
    });
    return updated;
  }

  @Post(':taskId/copy-to-board')
  @ApiOperation({
    summary:
      'Копировать задачу на другую доску (без cover), с дубликатами orders',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROV', 'MOV', 'DP', 'LOGIST', 'DIZ')
  async copyToBoard(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CopyTaskToBoardDto,
  ) {
    this.assertMoveOrCopyBoardAccess(user);
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

  @Post('columns/:columnId/copy-to-board')
  @ApiOperation({ summary: 'Копировать все задачи колонки на другую доску' })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROV', 'MOV', 'DP', 'LOGIST', 'DIZ')
  async copyColumnToBoard(
    @CurrentUser() user: UserDto,
    @Param('columnId', ParseIntPipe) columnId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CopyTaskToBoardDto,
  ) {
    this.assertMoveOrCopyBoardAccess(user);
    const result = await this.tasksService.copyColumnToBoard(
      user,
      columnId,
      dto,
    );
    for (const item of result.created) {
      await this.audit.log({
        userId: user.id,
        taskId: item.id,
        action: 'TASK_CREATED',
        description: `Скопировано из колонки #${columnId} → доска ${dto.boardId}`,
        payload: {
          fromTaskId: item.fromTaskId,
          fromColumnId: columnId,
          toBoardId: dto.boardId,
        },
      });
    }
    return result;
  }

  @Post(':taskId/move-to-board')
  @ApiOperation({ summary: 'Переместить задачу на другую доску' })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROV', 'MOV', 'DP', 'LOGIST', 'DIZ')
  async moveToBoard(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CopyTaskToBoardDto,
  ) {
    this.assertMoveOrCopyBoardAccess(user);
    const updated = await this.tasksService.moveToBoard(user, taskId, dto);
    await this.audit.log({
      userId: user.id,
      taskId: updated.id,
      action: 'MOVE_TO_BOARD',
      description: `Перемещено #${taskId} → доска ${dto.boardId}`,
      payload: { taskId, toBoardId: dto.boardId },
    });
    // await this.notify.notifyParticipants({
    //   taskId: updated.id,
    //   actorUserId: user.id,
    //   message: `Перемещено на доску ${dto.boardId}`,
    // });
    return updated;
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
      // await this.notify.notifyParticipants({
      //   taskId: task.id,
      //   actorUserId: user.id,
      //   message: `Убраны метки: ${removedNames.join(', ')}`,
      // });
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
      // await this.notify.notifyParticipants({
      //   taskId: task.id,
      //   actorUserId: user.id,
      //   message: [
      //     addedHuman.length ? `Добавлены метки: ${addedHuman.join(', ')}` : '',
      //     removedNames.length
      //       ? `Удалены метки: ${removedNames.join(', ')}`
      //       : '',
      //   ]
      //     .filter(Boolean)
      //     .join('; '),
      // });
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
    // await this.notify.notifyParticipants({
    //   taskId,
    //   actorUserId: user.id,
    //   message: `Оставил комментарий: ${comment.text}`,
    // });
    // компонент ожидает id, чтобы затем грузить файлы
    return { id: comment.id };
  }

  /** Прикрепить файл к комментарию (1:N — файл получает commentId) */
  @Post('comments/:commentId/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          try {
            fs.mkdirSync(TMP_DIR, { recursive: true });
          } catch (e) {
            console.log(e);
          }
          cb(null, TMP_DIR);
        },
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname || '');
          const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
          cb(null, name);
        },
      }),
      limits: { fileSize: ONE_GB },
    }),
  )
  async attachFileToComment(
    @Param('commentId', ParseIntPipe) commentId: number,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: ONE_GB })],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: UserDto,
  ) {
    if (!file) throw new BadRequestException('File is required');

    const comment = await this.comments.ensureComment(commentId);
    const task = await this.tasksService.ensureTask(comment.task.id);

    const dbFile = await this.filesService.uploadFile(
      file, // теперь у файла есть file.path (путь на диске)
      user.id,
      task.boardId,
      comment.id,
    );

    await this.attachmentsService.create(task.id, dbFile.id);
    await this.tasksService.ensureMember(task.id, user.id);
    // await this.notify.notifyParticipants({
    //   taskId: comment.task.id,
    //   actorUserId: user.id,
    //   message: 'Добавлено вложение',
    // });

    await this.audit.log({
      userId: user.id,
      description: 'Добавил вложение ' + dbFile.name,
      taskId: comment.task.id,
      action: 'ADD_ATTACHMENTS',
    });

    return dbFile;
  }

  /** Список доставок задачи */
  @Get(':taskId/deliveries')
  deliveriesListForTask(@Param('taskId', ParseIntPipe) taskId: number) {
    return this.tasksService.deliveriesListForTask(taskId);
  }

  /** Создать доставку для задачи */
  @Post(':taskId/deliveries')
  async createDeliveryForTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: DeliveryForTaskCreateDto,
    @CurrentUser() user: UserDto,
  ) {
    return this.tasksService.createDeliveryForTask(taskId, dto, user);
  }

  /** Список заказов задачи */
  @Get(':taskId/orders')
  ordersListForTask(@Param('taskId', ParseIntPipe) taskId: number) {
    return this.tasksService.ordersListForTask(taskId);
  }

  /** Создать заказ для задачи */
  @Post(':taskId/orders')
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
    'LOGIST',
    'RP',
    'GUEST',
  )
  async createOrderForTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CreateTaskOrderDto,
    @CurrentUser() user: UserDto,
  ) {
    const created = await this.tasksService.createOrderForTask(taskId, dto);
    const orderTitle =
      this.resolveOrderTitle(created) ?? this.resolveOrderTitle(dto);
    const orderLabel = orderTitle ?? `#${created.id}`;
    const createdData = this.toPlainJson(dto);
    await this.audit.log({
      userId: user.id,
      taskId,
      action: 'ORDER_CREATED',
      description: `Создан заказ ${orderLabel}`,
      payload: this.toPlainJson({
        orderId: created.id,
        title: orderTitle,
        createdData,
      }) as any,
    });

    const dealId = this.resolveOrderDealId(created);
    if (dealId) {
      await this.dealAudit.createDealAudit(
        dealId,
        'Создание заказа',
        user.id,
        `Создан заказ ${orderLabel}`,
      );
    }

    return created;
  }

  /** Получить один заказ */
  @Get('orders/:orderId')
  getOneOrder(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.tasksService.getOneOrder(orderId);
  }

  /** Обновить заказ (полная замена массивов неонов/подсветок) */

  @Patch('orders/:orderId')
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
    'LOGIST',
    'RP',
    'GUEST',
    'MASTER',
    'PACKER',
    'PRINTER',
  )
  async updateOrder(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: UpdateTaskOrderDto,
    @CurrentUser() user: UserDto,
  ) {
    const current = await this.tasksService.getOneOrder(orderId);
    const before = this.normalizeOrderForAudit(this.toPlainJson(current));

    if (['MASTER', 'PACKER'].includes(user.role.shortName)) {
      dto = { adapterModel: dto.adapterModel };
    }

    const updated = await this.tasksService.updateOrder(orderId, dto);
    if (updated) {
      const after = this.normalizeOrderForAudit(this.toPlainJson(updated));
      let changes = this.buildOrderChanges(before, after);
      if (!changes.length) {
        changes = this.buildOrderChangesFromDto(dto, before, after, true);
      }
      const orderTitle =
        this.resolveOrderTitle(updated) ?? this.resolveOrderTitle(current);
      const orderLabel = orderTitle ?? `#${orderId}`;
      await this.audit.log({
        userId: user.id,
        taskId: current.taskId,
        action: 'ORDER_UPDATED',
        description: `Обновлён заказ ${orderLabel}`,
        payload: this.toPlainJson({
          orderId,
          title: orderTitle,
          changes,
          changedFields: changes.map((change) => change.field),
        }) as any,
      });

      const dealId =
        this.resolveOrderDealId(updated) ?? this.resolveOrderDealId(current);
      if (dealId) {
        const summaryComment = this.buildOrderUpdateComment(
          orderLabel,
          changes,
        );
        await this.dealAudit.createDealAudit(
          dealId,
          'Обновление заказа',
          user.id,
          summaryComment,
        );

        if (changes.length) {
          for (const change of changes) {
            await this.dealAudit.createDealAudit(
              dealId,
              'Обновление заказа',
              user.id,
              `Изменение в заказе ${orderLabel}: ${change.label}: "${this.formatOrderAuditValue(change.from)}" -> "${this.formatOrderAuditValue(change.to)}"`,
            );
          }
        }
      }
    }
    return updated;
  }

  /** Мягкое удаление заказа */
  @Delete('orders/:orderId')
  async removeOrder(
    @Param('orderId', ParseIntPipe) orderId: number,
    @CurrentUser() user: UserDto,
  ) {
    const current = await this.tasksService.getOneOrder(orderId);
    const snapshot = this.toPlainJson(current);
    const orderTitle = this.resolveOrderTitle(current);
    const orderLabel = orderTitle ?? `#${orderId}`;
    const result = await this.tasksService.removeOrder(orderId);
    await this.audit.log({
      userId: user.id,
      taskId: current.taskId,
      action: 'ORDER_DELETED',
      description: `Удалён заказ ${orderLabel}`,
      payload: this.toPlainJson({
        orderId,
        title: orderTitle,
        snapshot,
      }) as any,
    });

    const dealId = this.resolveOrderDealId(current);
    if (dealId) {
      await this.dealAudit.createDealAudit(
        dealId,
        'Удаление заказа',
        user.id,
        `Удалён заказ ${orderLabel}`,
      );
    }

    return result;
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

    // await this.notify.notifyParticipants({
    //   taskId,
    //   actorUserId: user.id,
    //   message: `${user.fullName} добавил ${newMember.fullName}`,
    //   // link опционально, если не передашь — сгенерится автоматически
    // });
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

    // await this.notify.notifyParticipants({
    //   taskId,
    //   actorUserId: user.id,
    //   message: `${user.fullName} удалил ${deletedMember.fullName}`,
    // });
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
    await this.tasksService.updateCover(id, dto.path);
    return { message: 'Обложка обновлена' };
  }
}
