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

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: KanbanFilesService,
  ) {}

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

  async create(userId: number, dto: CreateTaskDto) {
    // убеждаемся, что колонка принадлежит этой доске и не удалена
    const column = await this.prisma.column.findFirst({
      where: { id: dto.columnId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!column) throw new NotFoundException('Column not found');
    await this.assertBoardAccess(userId, column.boardId);

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
        creatorId: userId,
        ...(connectMembers.length
          ? { members: { connect: connectMembers } }
          : {}),
      },
      include: {
        tags: true,
        members: { select: { id: true, email: true, fullName: true } },
        _count: { select: { comments: true, attachments: true } },
      },
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
        members: { select: { id: true, email: true, fullName: true } },

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
    const exists = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!exists) throw new NotFoundException('Task not found');
    await this.assertBoardAccess(userId, exists.boardId);

    return this.prisma.kanbanTask.update({
      where: { id: taskId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        chatLink: dto.chatLink ?? '',
      },
      select: { id: true, title: true, description: true, updatedAt: true },
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
  async move(userId: number, taskId: number, dto: MoveTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.kanbanTask.findFirst({
        where: { id: taskId, deletedAt: null },
        select: { id: true, columnId: true, position: true, boardId: true },
      });
      if (!task) throw new NotFoundException('Task not found');
      const boardId = task.boardId;
      await this.assertBoardAccess(userId, boardId);

      const targetColumn = await tx.column.findFirst({
        where: { id: dto.toColumnId, boardId, deletedAt: null },
        select: { id: true },
      });
      if (!targetColumn) throw new NotFoundException('Target column not found');

      // 1) Определяем новую position
      let newPos: any;
      if (dto.afterTaskId) {
        const after = await tx.kanbanTask.findFirst({
          where: {
            id: dto.afterTaskId,
            boardId,
            columnId: targetColumn.id,
            deletedAt: null,
          },
          select: { position: true },
        });
        const next = await tx.kanbanTask.findFirst({
          where: {
            boardId,
            columnId: targetColumn.id,
            deletedAt: null,
            // первая позиция строго больше after.position
            position: { gt: after?.position ?? 0 },
          },
          orderBy: { position: 'asc' },
          select: { position: true },
        });
        if (!after) {
          // если afterTaskId не нашли — в конец
          const last = await tx.kanbanTask.findFirst({
            where: { boardId, columnId: targetColumn.id, deletedAt: null },
            orderBy: { position: 'desc' },
            select: { position: true },
          });
          newPos = (Number(last?.position ?? 0) + 1000).toFixed(4);
        } else if (!next) {
          newPos = (Number(after.position) + 1000).toFixed(4);
        } else {
          // среднее между after и next
          newPos = (
            (Number(after.position) + Number(next.position)) /
            2
          ).toFixed(4);
        }
      } else if (dto.position) {
        // простая нумерация 1..N — пересчёт позиций в целых числах
        // (если оставляешь decimal-гепы — можно тоже вычислять среднее)
        const tasks = await tx.kanbanTask.findMany({
          where: {
            boardId,
            columnId: targetColumn.id,
            deletedAt: null,
            NOT: { id: taskId },
          },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        // вставим на индекс (position-1)
        const arr = tasks.map((t) => t.id);
        const idx = Math.max(0, Math.min(arr.length, dto.position - 1));
        arr.splice(idx, 0, taskId);
        // перенумерация 1..N
        await Promise.all(
          arr.map((id, i) =>
            tx.kanbanTask.update({ where: { id }, data: { position: i + 1 } }),
          ),
        );
        newPos = idx + 1;
      } else {
        // по умолчанию — в конец
        const last = await tx.kanbanTask.findFirst({
          where: { boardId, columnId: targetColumn.id, deletedAt: null },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        newPos = (Number(last?.position ?? 0) + 1000).toFixed(4);
      }

      // 2) Обновляем колонку и позицию
      const updated = await tx.kanbanTask.update({
        where: { id: taskId },
        data: { columnId: targetColumn.id, position: newPos },
        select: { id: true, columnId: true, position: true, updatedAt: true },
      });

      return updated;
    });
  }

  /**
   * Полностью заменить теги у задачи на переданный список имён.
   * Отсутствие / пустой массив -> очистить все теги.
   * Новые имена будут созданы в справочнике kanbanTaskTags внутри boardId задачи.
   */
  async replaceTaskTags(taskId: number, dto: UpdateTaskTagsDto) {
    // 1) Найдём задачу и её boardId
    const task = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    // Нормализуем вход
    const names = Array.from(
      new Set(
        (dto.tags ?? [])
          .map((s) => (s ?? '').trim())
          .filter((s) => s.length > 0),
      ),
    );

    // 2) Если список пуст — просто снять все теги
    if (names.length === 0) {
      await this.prisma.kanbanTask.update({
        where: { id: taskId },
        data: { tags: { set: [] } },
      });
      return { taskId, tags: [] };
    }

    // 3) Найти существующие теги по имени (без учёта регистра) в рамках доски
    const existing = await this.prisma.kanbanTaskTags.findMany({
      where: {
        boardId: task.boardId,
        OR: names.map((n) => ({ name: { equals: n, mode: 'insensitive' } })),
      },
      select: { id: true, name: true, color: true },
    });

    const existingLower = new Map(
      existing.map((t) => [t.name.toLowerCase(), t]),
    );

    // 4) Какие нужно создать
    const toCreate = names.filter((n) => !existingLower.has(n.toLowerCase()));

    // 5) Транзакция: создать недостающие и выставить набор тегов у задачи
    const result = await this.prisma.$transaction(async (tx) => {
      if (toCreate.length) {
        await tx.kanbanTaskTags.createMany({
          data: toCreate.map((name) => ({
            boardId: task.boardId,
            name,
            color: '', // при необходимости принимайте цвет из DTO
          })),
          skipDuplicates: true, // на случай гонки
        });
      }

      // перечитать все нужные теги (чтобы получить id только что созданных)
      const all = await tx.kanbanTaskTags.findMany({
        where: {
          boardId: task.boardId,
          OR: names.map((n) => ({ name: { equals: n, mode: 'insensitive' } })),
        },
        select: { id: true, name: true, color: true },
      });

      // заменить связи "как есть"
      await tx.kanbanTask.update({
        where: { id: taskId },
        data: { tags: { set: all.map((t) => ({ id: t.id })) } },
      });

      // вернуть в удобном формате
      // (отсортируем по имени для стабильности)
      return all.sort((a, b) => a.name.localeCompare(b.name));
    });

    return {
      taskId,
      tags: result.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    };
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
    return this.prisma.kanbanTaskComments.create({
      data: { taskId, authorId, text: t },
      select: { id: true },
    });
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
      if (md.data?.sizes || md.data?.preview) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    // 3) запись файла в БД с привязкой к комменту
    const dbFile = await this.prisma.kanbanFile.create({
      data: {
        name: file.originalname || md.data?.name || yaName,
        ya_name: yaName,
        size: md.data?.size ?? file.size ?? 0,
        preview: md.data?.sizes?.[0]?.url || '',
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
}
