import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { KanbanFilesService } from '../kanban-files/kanban-files.service';
import { UpdateTaskTagsDto } from './dto/update-task-tags.dto';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'node:path';
import { UpdateTaskOrderDto } from './dto/update-order.dto';
import { CreateTaskOrderDto } from './dto/order.dto';
import { Prisma } from '@prisma/client';
import { UserDto } from '../users/dto/user.dto';
import { TelegramService } from 'src/services/telegram.service';
import { TaskNotifyService } from 'src/services/task-notify.service';

type JsonInput = Prisma.InputJsonValue;

export type AuditLogParams = {
  userId: number;
  taskId: number;
  action: string; // например: 'CREATE', 'UPDATE_TITLE', 'MOVE', 'ADD_MEMBER'
  payload?: JsonInput; // любые сериализуемые JSON-данные
  description?: string | null;
  tx?: Prisma.TransactionClient; // опционально — если пишешь в транзакции
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly files: KanbanFilesService,
    private readonly notify: TaskNotifyService,
  ) {}

  /** Проверка задачи (если нужна) */
  private async ensureTask(taskId: number) {
    const task = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  /** Проверяем доступ к доске — пользователь должен быть участником */
  private async assertBoardAccess(userId: number, boardId: number) {
    const board = await this.prisma.board.findFirst({
      where: {
        id: boardId,
        deletedAt: null,
        // users: { some: { id: userId } },
      },
      select: { id: true },
    });
    if (!board) throw new ForbiddenException('Access denied to board');
  }

  /** Следующая позиция в колонке */
  private async nextPosition(
    boardId: number,
    columnId: number,
  ): Promise<number> {
    const last = await this.prisma.kanbanTask.findFirst({
      where: { boardId, columnId, deletedAt: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    // Prisma Decimal -> приводим к числу
    return last ? Number(last.position) + 1 : 1;
  }

  async create(user: UserDto, dto: CreateTaskDto) {
    // убеждаемся, что колонка принадлежит этой доске и не удалена
    const column = await this.prisma.column.findFirst({
      where: { id: dto.columnId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!column) throw new NotFoundException('Column not found');
    await this.assertBoardAccess(user.id, column.boardId);

    const position =
      dto.position ?? (await this.nextPosition(column.boardId, column.id));

    // подготовка связей
    const connectMembers = dto.memberIds?.length
      ? dto.memberIds.map((id) => ({ id }))
      : [];

    const task = await this.prisma.kanbanTask.create({
      data: {
        title: dto.title,
        description: dto.description ?? '',
        position,
        boardId: column.boardId,
        columnId: column.id,
        creatorId: user.id,
        members: { connect: [{ id: user.id }] },
        // ...(connectMembers.length
        //   ? { members: { connect: connectMembers } }
        //   : {}),
      },
      include: {
        tags: true,
        members: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: { select: { fullName: true } },
          },
        },
        _count: { select: { comments: true, attachments: true } },
      },
    });

    await this.log({
      userId: user.id,
      taskId: task.id,
      action: 'Создана задача',
      description: `${user.fullName} создал карточку`,
    });

    return task;
  }

  async getOne(userId: number, taskId: number) {
    const task = await this.prisma.kanbanTask.findFirst({
      where: {
        id: taskId,
        deletedAt: null,
      },
      include: {
        tags: { select: { id: true, name: true } },
        members: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: { select: { fullName: true } },
          },
        },

        attachments: true,
        comments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            text: true,
            createdAt: true,
            author: { select: { id: true, fullName: true, email: true } },
          },
        },
        audits: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            action: true,
            payload: true,
            createdAt: true,
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
        board: true,
        column: true,
        creator: true,
      },
    });

    if (!task) throw new NotFoundException('Task not found');
    await this.assertBoardAccess(userId, task.boardId);

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      chatLink: task.chatLink,
      position: task.position,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      deletedAt: task.deletedAt,
      creatorId: task.creatorId,
      boardId: task.boardId,
      columnId: task.columnId,
      tags: task.tags,
      members: task.members,
      attachmentsLength: task.attachments.length,

      comments: [],
      audits: [],
      board: task.board,
      column: task.column,
      creator: task.creator,
    };
  }

  async update(userId: number, taskId: number, dto: UpdateTaskDto) {
    const task = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    await this.assertBoardAccess(userId, task.boardId);

    return this.prisma.$transaction(async (tx) => {
      await this.ensureMember(taskId, userId, tx);

      // выясняем ЕДИНСТВЕННОЕ поле, которое пришло
      const keys = (
        ['title', 'description', 'chatLink', 'columnId'] as const
      ).filter((k) => (dto as any)[k] !== undefined);

      if (keys.length === 0) {
        // ничего не пришло — просто вернём текущее состояние
        return tx.kanbanTask.findUnique({
          where: { id: taskId },
          select: {
            id: true,
            title: true,
            description: true,
            chatLink: true,
            columnId: true,
            updatedAt: true,
          },
        });
      }

      const field = keys[0];

      // снимок "до" (только необходимые поля)
      const before = await tx.kanbanTask.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          title: true,
          description: true,
          chatLink: true,
          columnId: true,
        },
      });

      // формируем апдейт ТОЛЬКО по одному полю
      const data: Prisma.KanbanTaskUpdateInput = {};
      if (field === 'title') data.title = dto.title!;
      if (field === 'description') data.description = dto.description!;
      if (field === 'chatLink') data.chatLink = dto.chatLink ?? null; // очищаем как null
      if (field === 'columnId')
        data.column = { connect: { id: dto.columnId! } };

      const updated = await tx.kanbanTask.update({
        where: { id: taskId },
        data,
        select: {
          id: true,
          title: true,
          description: true,
          chatLink: true,
          columnId: true,
          updatedAt: true,
        },
      });

      // аудит по одному полю (без общего сравнения)
      const fromVal = (before as any)?.[field] ?? null;
      const toVal = (updated as any)?.[field] ?? null;

      await this.log({
        tx,
        userId,
        taskId,
        action: 'UPDATE_TASK',
        description: `Изменено поле: ${field}`,
        payload: { field, from: fromVal, to: toVal },
      });

      await this.notify.notifyParticipants({
        taskId,
        actorUserId: userId,
        message: `Изменено: ${fromVal} на ${toVal}`,
        // link опционально, если не передашь — сгенерится автоматически
      });

      return updated;
    });
  }

  async remove(userId: number, taskId: number) {
    const exists = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!exists) throw new NotFoundException('Task not found');
    await this.assertBoardAccess(userId, exists.boardId);

    await this.prisma.kanbanTask.update({
      where: { id: taskId },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }

  // src/domains/tasks/tasks.service.ts
  async move(user: UserDto, taskId: number, dto: MoveTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.kanbanTask.findFirst({
        where: { id: taskId, deletedAt: null },
        select: { id: true, columnId: true, position: true, boardId: true },
      });
      if (!task) throw new NotFoundException('Task not found');

      await this.assertBoardAccess(user.id, task.boardId);
      // убедимся, что автор действия — участник
      await this.ensureMember(taskId, user.id, tx);

      // исходная колонка (название)
      const fromColumn = await tx.column.findFirst({
        where: { id: task.columnId, boardId: task.boardId },
        select: { id: true, title: true },
      });

      const targetColumn = await tx.column.findFirst({
        where: { id: dto.toColumnId, boardId: task.boardId, deletedAt: null },
        select: { id: true, title: true },
      });
      if (!targetColumn) throw new NotFoundException('Target column not found');

      // --- вычисление новой позиции (как у тебя) ---
      let newPos: any;
      if (dto.afterTaskId) {
        const after = await tx.kanbanTask.findFirst({
          where: {
            id: dto.afterTaskId,
            boardId: task.boardId,
            columnId: targetColumn.id,
            deletedAt: null,
          },
          select: { position: true },
        });
        const next = await tx.kanbanTask.findFirst({
          where: {
            boardId: task.boardId,
            columnId: targetColumn.id,
            deletedAt: null,
            position: { gt: after?.position ?? 0 },
          },
          orderBy: { position: 'asc' },
          select: { position: true },
        });
        if (!after) {
          const last = await tx.kanbanTask.findFirst({
            where: {
              boardId: task.boardId,
              columnId: targetColumn.id,
              deletedAt: null,
            },
            orderBy: { position: 'desc' },
            select: { position: true },
          });
          newPos = (Number(last?.position ?? 0) + 1000).toFixed(4);
        } else if (!next) {
          newPos = (Number(after.position) + 1000).toFixed(4);
        } else {
          newPos = (
            (Number(after.position) + Number(next.position)) /
            2
          ).toFixed(4);
        }
      } else if (dto.position) {
        const tasks = await tx.kanbanTask.findMany({
          where: {
            boardId: task.boardId,
            columnId: targetColumn.id,
            deletedAt: null,
            NOT: { id: taskId },
          },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        const arr = tasks.map((t) => t.id);
        const idx = Math.max(0, Math.min(arr.length, dto.position - 1));
        arr.splice(idx, 0, taskId);
        await Promise.all(
          arr.map((id, i) =>
            tx.kanbanTask.update({ where: { id }, data: { position: i + 1 } }),
          ),
        );
        newPos = idx + 1;
      } else {
        const last = await tx.kanbanTask.findFirst({
          where: {
            boardId: task.boardId,
            columnId: targetColumn.id,
            deletedAt: null,
          },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        newPos = (Number(last?.position ?? 0) + 1000).toFixed(4);
      }

      // --- обновление ---
      const updated = await tx.kanbanTask.update({
        where: { id: taskId },
        data: { columnId: targetColumn.id, position: newPos },
        select: { id: true, columnId: true, position: true, updatedAt: true },
      });

      // --- аудит ---
      const movedBetweenColumns = fromColumn?.id !== targetColumn.id;
      await this.log({
        tx,
        userId: user.id,
        taskId,
        action: 'MOVE_TASK',
        description: movedBetweenColumns
          ? `Перемещение: «${fromColumn?.title ?? '—'}» → «${targetColumn.title}»`
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
        message: `Перемещение: «${fromColumn?.title ?? '—'}» → «${targetColumn.title}»`,
        // link опционально, если не передашь — сгенерится автоматически
      });

      return updated;
    });
  }

  /**
   * Полностью заменить теги у задачи на переданный список имён.
   * Отсутствие / пустой массив -> очистить все теги.
   * Новые имена будут созданы в справочнике kanbanTaskTags внутри boardId задачи.
   * Аудит пишет отдельно, какие имена добавлены и удалены.
   */
  async replaceTaskTags(
    userId: number,
    taskId: number,
    dto: UpdateTaskTagsDto,
  ) {
    // найдём задачу и её boardId + доступ
    const task = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertBoardAccess(userId, task.boardId);

    // убедимся, что автор — участник
    // (лог ADD_MEMBER произойдёт внутри при необходимости)
    return this.prisma.$transaction(async (tx) => {
      await this.ensureMember(taskId, userId, tx);

      const names = Array.from(
        new Set(
          (dto.tags ?? [])
            .map((s) => (s ?? '').trim())
            .filter((s) => s.length > 0),
        ),
      );

      // текущие теги задачи (имена)
      const current = await tx.kanbanTask.findUnique({
        where: { id: taskId },
        select: { tags: { select: { id: true, name: true } } },
      });
      const currentNames = new Set(
        (current?.tags ?? []).map((t) => t.name.toLowerCase()),
      );

      // будущий набор (нижний регистр для сравнения)
      const futureNamesLower = new Set(names.map((n) => n.toLowerCase()));

      const removedNames = [...currentNames].filter(
        (n) => !futureNamesLower.has(n),
      );
      const addedNames = [...futureNamesLower].filter(
        (n) => !currentNames.has(n),
      );

      // Если список пуст — снять все теги
      if (names.length === 0) {
        await tx.kanbanTask.update({
          where: { id: taskId },
          data: { tags: { set: [] } },
        });

        if (removedNames.length) {
          await this.log({
            tx,
            userId,
            taskId,
            action: 'UPDATE_TAGS',
            description: `Убраны метки: ${removedNames.join(', ')}`,
            payload: { added: [], removed: removedNames },
          });
          await this.notify.notifyParticipants({
            taskId,
            actorUserId: userId,
            message: `Убраны метки: ${removedNames.join(', ')}`,
          });
        }
        // link опционально, если не передашь — сгенерится автоматически
        return { taskId, tags: [] };
      }

      // найти существующие теги по имени в рамках доски
      const existing = await tx.kanbanTaskTags.findMany({
        where: {
          boardId: task.boardId,
          OR: names.map((n) => ({ name: { equals: n, mode: 'insensitive' } })),
        },
        select: { id: true, name: true, color: true },
      });
      const existingLower = new Map(
        existing.map((t) => [t.name.toLowerCase(), t]),
      );
      const toCreate = names.filter((n) => !existingLower.has(n.toLowerCase()));

      // создать недостающие
      if (toCreate.length) {
        await tx.kanbanTaskTags.createMany({
          data: toCreate.map((name) => ({
            boardId: task.boardId,
            name,
            color: '',
          })),
          skipDuplicates: true,
        });
      }

      // перечитать все нужные для получения id
      const all = await tx.kanbanTaskTags.findMany({
        where: {
          boardId: task.boardId,
          OR: names.map((n) => ({ name: { equals: n, mode: 'insensitive' } })),
        },
        select: { id: true, name: true, color: true },
      });

      await tx.kanbanTask.update({
        where: { id: taskId },
        data: { tags: { set: all.map((t) => ({ id: t.id })) } },
      });

      // аудит, если есть изменения
      if (addedNames.length || removedNames.length) {
        // восстановим «человеческие» имена как они были в запросе, для added
        const addedHuman = names.filter((n) =>
          addedNames.includes(n.toLowerCase()),
        );
        await this.log({
          tx,
          userId,
          taskId,
          action: 'UPDATE_TAGS',
          description: [
            addedHuman.length
              ? `Добавлены метки: ${addedHuman.join(', ')}`
              : '',
            removedNames.length
              ? `Удалены метки: ${removedNames.join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join('; '),
          payload: { added: addedHuman, removed: removedNames },
        });
        await this.notify.notifyParticipants({
          taskId,
          actorUserId: userId,
          message: [
            addedHuman.length
              ? `Добавлены метки: ${addedHuman.join(', ')}`
              : '',
            removedNames.length
              ? `Удалены метки: ${removedNames.join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join('; '),
        });
      }

      return {
        taskId,
        tags: all
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
          })),
      };
    });
  }

  /** Вывести комментарии задачи с файлами и автором */
  async listForTask(taskId: number) {
    // убеждаемся, что задача существует
    const task = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const items = await this.prisma.kanbanTaskComments.findMany({
      where: { taskId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, fullName: true } },
        files: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            preview: true,
            path: true,
            size: true,
            mimeType: true,
            file: true,
          },
        },
      },
    });

    // фронт принимает как есть
    return items;
  }

  /** Создать комментарий */
  async createForTask(taskId: number, authorId: number, text: string) {
    const task = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const t = (text ?? '').trim();

    const comment = await this.prisma.kanbanTaskComments.create({
      data: { taskId, authorId, text: t },
      select: { id: true },
    });
    await this.notify.notifyParticipants({
      taskId: task.id,
      actorUserId: authorId,
      message: `Оставил комментарий: ${t}`,
    });

    return comment;
  }

  /** Определить категорию и расширение по mime/расширению */
  private resolveCategory(file: Express.Multer.File): {
    category: 'images' | 'pdf' | 'cdr';
    ext: string;
  } {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = (path.extname(file.originalname) || '').toLowerCase();

    if (mime.startsWith('image/'))
      return { category: 'images', ext: ext || '.bin' };
    if (mime === 'application/pdf' || ext === '.pdf')
      return { category: 'pdf', ext: '.pdf' };
    if (
      ext === '.cdr' ||
      mime === 'application/vnd.corel-draw' ||
      mime === 'image/x-cdr' ||
      mime === 'application/x-coreldraw'
    )
      return { category: 'cdr', ext: '.cdr' };

    throw new BadRequestException(
      'Unsupported file type. Allowed: images, pdf, cdr',
    );
  }

  /**
   * Загрузить файл на Я.Диск и привязать к комментарию (1:N: KanbanFile.commentId)
   * Возвращает объект в формате, удобном фронту.
   */
  async attachFileToComment(
    commentId: number,
    file: Express.Multer.File,
    userId: number,
  ) {
    const comment = await this.prisma.kanbanTaskComments.findFirst({
      where: { id: commentId, deletedAt: null },
      select: {
        id: true,
        task: { select: { id: true, boardId: true } },
      },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    const { category, ext } = this.resolveCategory(file);
    const yaName = `${uuidv4()}${ext}`;
    const directory = `boards/${comment.task.boardId}/${category}`;
    const absPath = `EasyCRM/${directory}/${yaName}`;

    // Загрузка на Я.Диск — используем те же эндпоинты, что и в вашем файловом сервисе
    // 1) получить href для загрузки
    const axios = (await import('axios')).default;
    const TOKEN = process.env.YA_TOKEN as string;
    const YD_UPLOAD = 'https://cloud-api.yandex.net/v1/disk/resources/upload';
    const YD_RES = 'https://cloud-api.yandex.net/v1/disk/resources';

    const up = await axios.get(YD_UPLOAD, {
      params: { path: absPath, overwrite: true },
      headers: { Authorization: `OAuth ${TOKEN}` },
    });
    await axios.put(up.data.href, file.buffer, {
      headers: { 'Content-Type': 'application/octet-stream' },
    });

    // 2) свежие метаданные (несколько попыток, чтобы появились sizes/preview)
    let md: any;
    for (let i = 0; i < 3; i++) {
      md = await axios.get(YD_RES, {
        params: {
          path: absPath,
          fields: 'name,path,size,mime_type,preview,sizes,file',
        },
        headers: { Authorization: `OAuth ${TOKEN}` },
      });
      if (md.data?.sizes) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    // 3) запись файла в БД с привязкой к комменту
    const dbFile = await this.prisma.kanbanFile.create({
      data: {
        name: file.originalname || md.data?.name || yaName,
        ya_name: yaName,
        size: md.data?.size ?? file.size ?? 0,
        preview: md.data?.sizes?.[0]?.url || md.data.preview || '',
        directory,
        path: absPath,
        mimeType: md.data?.mime_type || file.mimetype || null,
        uploadedById: userId,
        commentId: commentId, // ← ключ к комментарию (1:N)
        file: md.data.file ?? '',
      },
      select: {
        id: true,
        name: true,
        preview: true,
        path: true,
        size: true,
        mimeType: true,
        directory: true,
        createdAt: true,
        file: true,
      },
    });

    const taskAtt = await this.prisma.kanbanTaskAttachment.create({
      data: {
        taskId: comment.task.id,
        fileId: dbFile.id,
      },
    });

    await this.notify.notifyParticipants({
      taskId: comment.task.id,
      actorUserId: userId,
      message: 'Добавлено вложение',
    });

    // Формат как ожидает фронт
    return {
      id: dbFile.id,
      name: dbFile.name,
      preview: dbFile.preview,
      path: dbFile.path,
      size: dbFile.size,
      mimeType: dbFile.mimeType,
      createdAt: dbFile.createdAt,
      file: dbFile.file,
    };
  }

  /** Список заказов задачи */
  async ordersListForTask(taskId: number) {
    await this.ensureTask(taskId);
    const items = await this.prisma.taskOrder.findMany({
      where: { taskId, deletedAt: null },
      orderBy: { id: 'desc' },
      include: {
        neons: true,
        lightings: true,
      },
    });
    return items;
  }

  /** Один заказ */
  async getOneOrder(orderId: number) {
    const item = await this.prisma.taskOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        neons: true,
        lightings: true,
      },
    });
    if (!item) throw new NotFoundException('Order not found');
    return item;
  }

  /** Создать для задачи */
  async createOrderForTask(taskId: number, dto: CreateTaskOrderDto) {
    await this.ensureTask(taskId);
    console.log(dto);

    // дефолты / нормализация
    const {
      neons = [],
      lightings = [],
      dealId, // опционально
      ...rest
    } = dto;

    const created = await this.prisma.taskOrder.create({
      data: {
        taskId,
        ...(dealId !== undefined ? { dealId: dealId as any } : {}), // если dealId опционален в схеме — можно передать null
        ...rest,
        neons: neons.length
          ? {
              createMany: {
                data: neons.map((n) => ({
                  width: n.width ?? '',
                  length: n.length ?? 0,
                  color: n.color ?? '',
                })),
              },
            }
          : undefined,
        lightings: lightings.length
          ? {
              createMany: {
                data: lightings.map((l) => ({
                  length: l.length ?? 0,
                  color: l.color ?? '',
                  elements: l.elements ?? 0,
                })),
              },
            }
          : undefined,
      },
      include: { neons: true, lightings: true },
    });

    return created;
  }

  /** Обновить (полная замена массивов неонов/подсветок) */
  async updateOrder(orderId: number, dto: UpdateTaskOrderDto) {
    console.log(dto);
    const ex = await this.prisma.taskOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true },
    });
    if (!ex) throw new NotFoundException('Order not found');

    const { neons, lightings, dealId, ...rest } = dto;

    return await this.prisma.$transaction(async (tx) => {
      // 1) обновим плоские поля
      const updated = await tx.taskOrder.update({
        where: { id: orderId },
        data: {
          ...(dealId !== undefined ? { dealId: dealId as any } : {}),
          ...rest,
        },
        include: { neons: true, lightings: true },
      });

      // 2) если прислали массивы — заменим их содержимое
      if (neons) {
        await tx.neon.deleteMany({ where: { orderTaskId: orderId } });
        if (neons.length) {
          await tx.neon.createMany({
            data: neons.map((n) => ({
              orderTaskId: orderId,
              width: n.width ?? '',
              length: n.length ?? 0,
              color: n.color ?? '',
            })),
          });
        }
      }

      if (lightings) {
        await tx.lighting.deleteMany({ where: { orderTaskId: orderId } });
        if (lightings.length) {
          await tx.lighting.createMany({
            data: lightings.map((l) => ({
              orderTaskId: orderId,
              length: l.length ?? 0,
              color: l.color ?? '',
              elements: l.elements ?? 0,
            })),
          });
        }
      }

      // перечитать с вложениями
      const fresh = await tx.taskOrder.findUnique({
        where: { id: orderId },
        include: { neons: true, lightings: true },
      });
      return fresh;
    });
  }

  /** Мягкое удаление (+ подчистка дочерних записей) */
  async removeOrder(orderId: number) {
    const exists = await this.prisma.taskOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Order not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.neon.deleteMany({ where: { orderTaskId: orderId } });
      await tx.lighting.deleteMany({ where: { orderTaskId: orderId } });
      await tx.taskOrder.update({
        where: { id: orderId },
        data: { deletedAt: new Date() },
      });
    });

    return { success: true };
  }

  /**
   * Проверить, что userId является участником задачи.
   * Можно передать транзакционный клиент tx.
   */
  async isMember(
    taskId: number,
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const db = tx ?? this.prisma;
    const exists = await db.kanbanTask.findFirst({
      where: { id: taskId, members: { some: { id: userId } } },
      select: { id: true },
    });
    return !!exists;
  }

  /**
   * Гарантировать участие: если нет — добавить.
   * Возвращает true, если добавили, false — если уже был участником.
   */
  async ensureMember(
    taskId: number,
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const db = tx ?? this.prisma;

    const already = await this.isMember(taskId, userId, db);
    if (already) return false;

    await db.kanbanTask.update({
      where: { id: taskId },
      data: { members: { connect: { id: userId } } },
      select: { id: true },
    });

    return true;
  }

  /**
   * Батч-версия: обеспечить участие для массива userIds.
   * Возвращает список реально добавленных id.
   */
  async ensureMembers(
    taskId: number,
    userIds: number[],
    tx?: Prisma.TransactionClient,
  ): Promise<number[]> {
    const db = tx ?? this.prisma;

    const current = await db.kanbanTask.findUnique({
      where: { id: taskId },
      select: { members: { select: { id: true } } },
    });
    const have = new Set((current?.members ?? []).map((m) => m.id));
    const toAdd = userIds.filter((id) => !have.has(id));

    if (toAdd.length) {
      await db.kanbanTask.update({
        where: { id: taskId },
        data: { members: { connect: toAdd.map((id) => ({ id })) } },
        select: { id: true },
      });
    }
    return toAdd;
  }

  async getMembers(userId: number, taskId: number) {
    // проверяем существование и доступ к доске
    const task = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    await this.assertBoardAccess(userId, task.boardId);

    // подтягиваем участников
    const res = await this.prisma.kanbanTask.findUnique({
      where: { id: taskId },
      select: {
        members: {
          where: { deletedAt: null }, // если в User есть deletedAt — фильтруем "мёртвых"
          select: {
            id: true,
            fullName: true,
            email: true,
            role: { select: { id: true, shortName: true, fullName: true } },
          },
          orderBy: { fullName: 'asc' },
        },
      },
    });

    // нормализуем ответ в плоский массив
    return (res?.members ?? []).map((m) => ({
      id: m.id,
      fullName: m.fullName,
      email: m.email,
      role: {
        id: m.role?.id,
        shortName: m.role?.shortName,
        fullName: m.role?.fullName,
      },
    }));
  }

  /**
   * Базовая запись события аудита.
   * Можно передать tx для атомарной записи вместе с основной операцией.
   */
  async log(params: AuditLogParams) {
    const { userId, taskId, action, payload, description, tx } = params;
    const db = tx ?? this.prisma;

    await this.ensureTask(taskId);

    return db.kanbanTaskAudit.create({
      data: {
        userId,
        taskId,
        action,
        payload: payload ?? {},
        description: description ?? null,
      },
      select: {
        id: true,
        createdAt: true,
        action: true,
        description: true,
        payload: true,
        user: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async getTaskAudit(taskId: number) {
    // опционально проверим, что задача существует и не удалена
    const task = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    return this.prisma.kanbanTaskAudit.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        action: true,
        description: true,
        payload: true,
        user: { select: { id: true, fullName: true } },
      },
    });
  }
}
