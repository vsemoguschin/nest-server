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
import { UpdateTaskTagsDto } from './dto/update-task-tags.dto';
import { UpdateTaskOrderDto } from './dto/update-order.dto';
import { CreateTaskOrderDto } from './dto/order.dto';
import { Prisma } from '@prisma/client';
import { UserDto } from '../users/dto/user.dto';
import { SearchTasksDto } from './dto/search-tasks.dto';

type FieldKey = 'title' | 'description' | 'chatLink' | 'columnId';

type TaskSnapshot = {
  id: number;
  title: string;
  description: string;
  chatLink: string | null;
  columnId: number;
  updatedAt: Date;
};

type UpdateTaskResult = {
  changed: boolean;
  updated: TaskSnapshot;
  field: FieldKey | null;
  fromVal: unknown | null;
  toVal: unknown | null;
};

const searchSelect = {
  id: true,
  title: true,
  chatLink: true,
  cover: true,
  board: { select: { id: true, title: true } },
  boardId: true,
  column: { select: { id: true, title: true } },
  members: {
    select: {
      id: true,
      fullName: true,
      // если у User есть роль — раскомментируй:
      // role: { select: { fullName: true } },
    },
  },
} satisfies Prisma.KanbanTaskSelect;

export type SearchTaskItem = Prisma.KanbanTaskGetPayload<{
  select: typeof searchSelect;
}>;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Проверка задачи (если нужна) */
  async ensureTask(taskId: number) {
    const task = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      include: {
        members: true,
        column: true,
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  /** Установить флаг архивации */
  async setArchived(
    userId: number,
    task: { id: number; boardId: number },
    archived: boolean,
  ) {
    await this.assertBoardAccess(userId, task.boardId);
    const updated = await this.prisma.kanbanTask.update({
      where: { id: task.id },
      data: { archived },
      select: { id: true, archived: true, updatedAt: true },
    });
    return updated;
  }

  /** убеждаемся, что колонка принадлежит этой доске и не удалена */
  async ensureTaskColumn(columnId: number) {
    const column = await this.prisma.column.findFirst({
      where: { id: columnId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!column) throw new NotFoundException('Column not found');
    return column;
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

  /**
   * Скопировать задачу на другую доску (без cover) и дублировать все orders (с neons и lightings).
   * Целевая колонка выбирается первой по позиции на целевой доске.
   */
  async copyToBoard(user: UserDto, taskId: number, dto: { boardId: number }) {
    const srcTask = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      include: {
        orders: {
          where: { deletedAt: null },
          include: { neons: true, lightings: true },
        },
        // берем только zip-вложения
        attachments: {
          // берём только последний загруженный .cdr
          where: { file: { path: { endsWith: '.cdr' } } },
          select: { fileId: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!srcTask) throw new NotFoundException('Task not found');

    const board = await this.prisma.board.findFirst({
      where: { id: dto.boardId, deletedAt: null },
      select: { id: true },
    });
    if (!board) throw new NotFoundException('Target board not found');

    const targetColumn = await this.prisma.column.findFirst({
      where: { boardId: dto.boardId, deletedAt: null },
      orderBy: { position: 'asc' },
      select: { id: true, boardId: true },
    });
    if (!targetColumn)
      throw new NotFoundException('Target column not found on board');

    return this.prisma.$transaction(async (tx) => {
      const position = await this.nextPosition(
        targetColumn.boardId,
        targetColumn.id,
      );

      const created = await tx.kanbanTask.create({
        data: {
          title: srcTask.title,
          description: '',
          chatLink: srcTask.chatLink,
          cover: srcTask.cover,
          position,
          boardId: targetColumn.boardId,
          columnId: targetColumn.id,
          creatorId: user.id,
          members: { connect: [{ id: user.id }] },
        },
        select: { id: true, boardId: true, columnId: true, title: true },
      });

      // Дублируем все заказы и их дочерние записи
      for (const order of srcTask.orders ?? []) {
        await tx.taskOrder.create({
          data: {
            taskId: created.id,
            dealId: (order as any).dealId ?? null,
            title: order.title ?? '',
            deadline: order.deadline ?? '',
            material: order.material ?? '',
            boardWidth: order.boardWidth ?? 0,
            boardHeight: order.boardHeight ?? 0,
            holeType: order.holeType ?? '',
            stand: order.stand ?? false,
            laminate: order.laminate ?? '',
            print: order.print ?? false,
            printQuality: order.printQuality ?? false,
            acrylic: order.acrylic ?? '',
            type: order.type ?? '',
            wireLength: order.wireLength ?? '',
            elements: order.elements ?? 0,
            gift: order.gift ?? false,
            adapter: order.adapter ?? '',
            plug: order.plug ?? '',
            switch: order.switch ?? true,
            fitting: order.fitting ?? '',
            dimmer: order.dimmer ?? false,
            giftPack: order.giftPack ?? false,
            description: order.description ?? '',
            docs: (order as any).docs ?? false,

            neons:
              (order.neons?.length ?? 0)
                ? {
                    createMany: {
                      data: order.neons.map((n) => ({
                        width: n.width ?? '',
                        length: (n as any).length ?? 0,
                        color: n.color ?? '',
                      })),
                    },
                  }
                : undefined,
            lightings:
              (order.lightings?.length ?? 0)
                ? {
                    createMany: {
                      data: order.lightings.map((l) => ({
                        length: (l as any).length ?? 0,
                        color: l.color ?? '',
                        elements: l.elements ?? 0,
                      })),
                    },
                  }
                : undefined,
          },
        });
      }

      // Соберём файлы для переноса в новую карточку: все .cdr вложения + файл из cover (если есть)
      const cdrFileIds: number[] = [];
      if (srcTask.attachments && srcTask.attachments.length) {
        for (const a of srcTask.attachments) cdrFileIds.push(a.fileId);
      }
      let coverFileId: number | null = null;
      if (srcTask.cover) {
        const coverFile = await tx.kanbanFile.findFirst({
          where: { path: srcTask.cover, deletedAt: null },
          select: { id: true },
        });
        if (coverFile) {
          coverFileId = coverFile.id;
        }
      }

      // 1) прикрепим как вложения к задаче (сумма всех файлов)
      const toAttach = [...cdrFileIds, ...(coverFileId ? [coverFileId] : [])];
      if (toAttach.length) {
        await tx.kanbanTaskAttachment.createMany({
          data: toAttach.map((fid) => ({ taskId: created.id, fileId: fid })),
          skipDuplicates: true,
        });
      }

      // 2) создадим отдельные комментарии: один для изображения cover, другой для .cdr файлов
      if (coverFileId) {
        const coverComment = await tx.kanbanTaskComments.create({
          data: {
            taskId: created.id,
            authorId: user.id,
            text: '',
          },
          select: { id: true },
        });
        await tx.kanbanFile.update({
          where: { id: coverFileId },
          data: { commentId: coverComment.id },
          select: { id: true },
        });
      }
      if (cdrFileIds.length) {
        const cdrComment = await tx.kanbanTaskComments.create({
          data: {
            taskId: created.id,
            authorId: user.id,
            text: 'Макет',
          },
          select: { id: true },
        });
        await tx.kanbanFile.updateMany({
          where: { id: { in: cdrFileIds } },
          data: { commentId: cdrComment.id },
        });
      }

      return created;
    });
  }

  /**
   * Переместить задачу на другую доску: меняем boardId, назначаем первую колонку целевой доски,
   * ставим задачу в конец этой колонки (nextPosition). Вложения, метки, заказы и участники сохраняются.
   */
  async moveToBoard(user: UserDto, taskId: number, dto: { boardId: number }) {
    const srcTask = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, boardId: true, columnId: true, title: true },
    });
    if (!srcTask) throw new NotFoundException('Task not found');

    const board = await this.prisma.board.findFirst({
      where: { id: dto.boardId, deletedAt: null },
      select: { id: true },
    });
    if (!board) throw new NotFoundException('Target board not found');

    const targetColumn = await this.prisma.column.findFirst({
      where: { boardId: dto.boardId, deletedAt: null },
      orderBy: { position: 'asc' },
      select: { id: true, boardId: true },
    });
    if (!targetColumn)
      throw new NotFoundException('Target column not found on board');

    const position = await this.nextPosition(
      targetColumn.boardId,
      targetColumn.id,
    );

    const updated = await this.prisma.kanbanTask.update({
      where: { id: taskId },
      data: {
        boardId: targetColumn.boardId,
        columnId: targetColumn.id,
        position,
      },
      select: {
        id: true,
        title: true,
        boardId: true,
        columnId: true,
        position: true,
      },
    });

    return updated;
  }

  async create(user: UserDto, dto: CreateTaskDto, boardId: number) {
    const position =
      dto.position ?? (await this.nextPosition(boardId, dto.columnId));

    const task = await this.prisma.kanbanTask.create({
      data: {
        title: dto.title,
        description: dto.description ?? '',
        position,
        boardId: boardId,
        columnId: dto.columnId,
        creatorId: user.id,
        members: { connect: [{ id: user.id }] },
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
      cover: task.cover,
      archived: task.archived,

      comments: [],
      audits: [],
      board: task.board,
      column: task.column,
      creator: task.creator,
    };
  }

  /**
   * Поиск задач по подстроке в chatLink среди всех задач, без учёта доски.
   * Исключаем удалённые (deletedAt != null).
   */
  async searchByChatLink(
    dto: SearchTasksDto,
    user: UserDto,
  ): Promise<SearchTaskItem[]> {
    const q = dto.q.trim();
    if (q.length < 2) return [];
    const userBoards = user.boards.map((b) => b.id);

    const tasks = await this.prisma.kanbanTask.findMany({
      where: {
        deletedAt: null,
        OR: [
          {
            chatLink: { contains: q, mode: 'insensitive' },
          },
          {
            title: { contains: q, mode: 'insensitive' },
          },
        ],
        boardId: { in: userBoards },
      },
      select: { ...searchSelect, attachments: { select: { file: true } } },
      orderBy: { updatedAt: 'desc' },
      take: dto.take ?? 20,
    });

    return tasks.map((t) => {
      const previewPath = t.attachments[0]?.file.path ?? '';
      return {
        id: t.id,
        title: t.title,
        board: t.board,
        boardId: t.boardId,
        column: t.column,
        members: t.members,
        chatLink: t.chatLink,
        cover: t.cover ?? previewPath,
        // attachments: t.attachments,
      };
    });
  }

  /**
   * Список архивированных задач пользователя по его доскам.
   * Возвращает тот же набор полей, что и searchByChatLink.
   */
  async listArchived(
    user: UserDto,
    params: { boardId: number; take?: number; cursor?: string },
  ): Promise<{ items: SearchTaskItem[]; nextCursor: string | null }> {
    const userBoards = user.boards.map((b) => b.id);
    const take = params.take ?? 30;
    const boardId = params.boardId;

    // decode cursor if provided
    let cursorData: { id: number; updatedAt: string } | null = null;
    if (params.cursor) {
      try {
        const json = Buffer.from(params.cursor, 'base64').toString('utf-8');
        cursorData = JSON.parse(json);
      } catch {
        cursorData = null;
      }
    }

    const where: any = {
      deletedAt: null,
      archived: true,
      boardId: { in: userBoards, equals: boardId },
    };

    if (cursorData) {
      const dt = new Date(cursorData.updatedAt);
      where.OR = [
        { updatedAt: { lt: dt } },
        { updatedAt: dt, id: { lt: cursorData.id } },
      ];
    }

    // fetch take+1 to detect next page
    const rows = await this.prisma.kanbanTask.findMany({
      where,
      select: {
        ...searchSelect,
        attachments: { select: { file: true } },
        updatedAt: true,
        id: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const slice = hasMore ? rows.slice(0, take) : rows;

    const items: SearchTaskItem[] = slice.map((t) => {
      const previewPath = (t as any).attachments?.[0]?.file?.path ?? '';
      return {
        id: t.id,
        title: t.title,
        board: t.board,
        boardId: t.boardId,
        column: t.column,
        members: t.members,
        chatLink: t.chatLink,
        cover: t.cover ?? previewPath,
      } as SearchTaskItem;
    });

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = slice[slice.length - 1] as any;
      nextCursor = Buffer.from(
        JSON.stringify({
          id: last.id,
          updatedAt: last.updatedAt.toISOString(),
        }),
      ).toString('base64');
    }

    return { items, nextCursor };
  }

  /**Редактировать основную информацию задачи */
  // сервис
  async updateTask(
    userId: number,
    task: { id: number; boardId: number },
    dto: UpdateTaskDto,
  ): Promise<UpdateTaskResult> {
    await this.assertBoardAccess(userId, task.boardId);

    return await this.prisma.$transaction(async (tx) => {
      const keys = (
        ['title', 'description', 'chatLink', 'columnId'] as const
      ).filter((k) => (dto as any)[k] !== undefined);

      if (keys.length === 0) {
        const current = await tx.kanbanTask.findUniqueOrThrow({
          where: { id: task.id },
          select: {
            id: true,
            title: true,
            description: true,
            chatLink: true,
            columnId: true,
            updatedAt: true,
          },
        });
        return {
          changed: false,
          updated: current,
          field: null,
          fromVal: null,
          toVal: null,
        };
      }

      const field = keys[0];

      const before = await tx.kanbanTask.findUniqueOrThrow({
        where: { id: task.id },
        select: {
          id: true,
          title: true,
          description: true,
          chatLink: true,
          columnId: true,
        },
      });

      const data: Prisma.KanbanTaskUpdateInput = {};
      if (field === 'title') data.title = dto.title!;
      if (field === 'description') data.description = dto.description!;
      if (field === 'chatLink') data.chatLink = dto.chatLink ?? null;
      if (field === 'columnId')
        data.column = { connect: { id: dto.columnId! } };

      const updated = await tx.kanbanTask.update({
        where: { id: task.id },
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

      const fromVal = (before as any)[field] ?? null;
      const toVal = (updated as any)[field] ?? null;

      return { changed: true, updated, field, fromVal, toVal };
    });
  }

  /**Получить список доступных колонок для добавления в задачу */
  async getAvaliableColumns(columnId: number, boardId: number) {
    // подтягиваем участников
    const avalCol = await this.prisma.column.findMany({
      where: {
        id: {
          not: columnId,
        },
        boardId,
      },
      orderBy: {
        position: 'asc',
      },
    });

    // нормализуем ответ в плоский массив
    return (avalCol ?? []).map((c) => ({
      id: c.id,
      title: c.title,
    }));
  }
  // + метод в сервисе
  async updateColumn(taskId: number, columnId: number) {
    return this.prisma.kanbanTask.update({
      where: { id: taskId },
      data: { columnId },
      select: { id: true, title: true, columnId: true, updatedAt: true },
    });
  }

  /** Удалить задачу */
  async deleteTask(userId: number, task: { id: number; boardId: number }) {
    await this.assertBoardAccess(userId, task.boardId);

    await this.prisma.kanbanTask.update({
      where: { id: task.id },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }

  // src/domains/tasks/tasks.service.ts
  /**
   * Переместить задачу в указанную колонку и поставить её ПЕРВОЙ (минимальная позиция - STEP).
   */
  async updateTaskColumnId(
    user: UserDto,
    task: { id: number; columnId: number; boardId: number },
    dto: MoveTaskDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // исходная колонка (для аудита/ответа)
      const fromColumn = await tx.column.findFirst({
        where: { id: task.columnId, boardId: task.boardId },
        select: { id: true, title: true },
      });

      // целевая колонка
      const targetColumn = await tx.column.findFirst({
        where: { id: dto.toColumnId, boardId: task.boardId, deletedAt: null },
        select: { id: true, title: true },
      });
      if (!targetColumn) throw new NotFoundException('Target column not found');

      // --- позиция: сделать ПЕРВОЙ в целевой колонке ---
      const top = await tx.kanbanTask.findFirst({
        where: {
          boardId: task.boardId,
          columnId: targetColumn.id,
          deletedAt: null,
          NOT: { id: task.id },
        },
        orderBy: { position: 'asc' },
        select: { position: true },
      });

      const STEP = 1000;
      const newPos = top
        ? (Number(top.position) - STEP).toFixed(4) // меньше минимума → станет первой
        : (1).toFixed(4); // колонка пустая → 1.0000

      // обновление задачи
      const updated = await tx.kanbanTask.update({
        where: { id: task.id },
        data: { columnId: targetColumn.id, position: newPos },
        select: { id: true, columnId: true, position: true, updatedAt: true },
      });

      const movedBetweenColumns = fromColumn?.id !== targetColumn.id;

      return { updated, movedBetweenColumns, fromColumn, targetColumn };
    });
  }

  /**
   * Перемещает задачу в следующую колонку по возрастанию column.position (в рамках того же boardId)
   * и ставит задачу в начало колонки (минимальная позиция - 1 или 1, если колонка пустая).
   * Возвращает обновлённую задачу и информацию о колонках.
   */
  async moveToNextColumn(taskId: number): Promise<{
    updated: any;
    fromColumn: {
      id: number;
      title: string;
      position: Prisma.Decimal;
      boardId: number;
    };
    targetColumn: {
      id: number;
      title: string;
      position: Prisma.Decimal;
      boardId: number;
    };
  }> {
    // 1) Текущая задача + её колонка
    const task = await this.ensureTask(taskId);
    const fromColumn = task.column as {
      id: number;
      title: string;
      position: Prisma.Decimal;
      boardId: number;
    };

    // 2) Ищем следующую колонку в том же борде по position > текущей
    const targetColumn = await this.prisma.column.findFirst({
      where: {
        boardId: fromColumn.boardId, // при необходимости замените на ваш внешний ключ (projectId и т.п.)
        position: { gt: fromColumn.position },
      },
      orderBy: { position: 'asc' },
      select: { id: true, title: true, position: true, boardId: true },
    });

    if (!targetColumn) {
      throw new BadRequestException('Следующая колонка не найдена');
    }

    // 3) Определяем "верхнюю" позицию в целевой колонке
    const topInTarget = await this.prisma.kanbanTask.findFirst({
      where: { columnId: targetColumn.id },
      orderBy: { position: 'asc' },
      select: { position: true },
    });

    // Если колонка пустая -> ставим 1, иначе (минимальная - 1)
    // Prisma Decimal: используем Prisma.Decimal для корректной математики
    const newTopPosition = topInTarget
      ? new Prisma.Decimal(topInTarget.position).minus(1)
      : new Prisma.Decimal(1);

    // 4) Обновляем задачу: columnId и позицию
    const updated = await this.prisma.kanbanTask.update({
      where: { id: taskId },
      data: {
        columnId: targetColumn.id,
        position: newTopPosition, // карточка становится первой
      },
      // при желании ограничьте select
      // select: { id: true, columnId: true, position: true, title: true }
    });

    return { updated, fromColumn, targetColumn };
  }

  /**
   * Полностью заменить теги у задачи на переданный список имён.
   * Отсутствие / пустой массив -> очистить все теги.
   * Новые имена будут созданы в справочнике kanbanTaskTags внутри boardId задачи.
   * Аудит пишет отдельно, какие имена добавлены и удалены.
   */
  async replaceTaskTags(
    userId: number,
    task: { id: number; boardId: number },
    dto: UpdateTaskTagsDto,
  ): Promise<{
    taskId: number;
    tags: { id: number; name: string; color: string }[];
    names: string[];
    removedNames: string[];
    addedNames?: string[];
  }> {
    await this.assertBoardAccess(userId, task.boardId);

    // убедимся, что автор — участник
    // (лог ADD_MEMBER произойдёт внутри при необходимости)
    return this.prisma.$transaction(async (tx) => {
      await this.ensureMember(task.id, userId, tx);

      const names = Array.from(
        new Set(
          (dto.tags ?? [])
            .map((s) => (s ?? '').trim())
            .filter((s) => s.length > 0),
        ),
      );

      // текущие теги задачи (имена)
      const current = await tx.kanbanTask.findUnique({
        where: { id: task.id },
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
      // console.log(addedNames);

      // Если список пуст — снять все теги
      if (names.length === 0) {
        await tx.kanbanTask.update({
          where: { id: task.id },
          data: { tags: { set: [] } },
        });

        return { taskId: task.id, tags: [], removedNames, addedNames, names };
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
        where: { id: task.id },
        data: { tags: { set: all.map((t) => ({ id: t.id })) } },
      });

      // аудит, если есть изменения

      return {
        taskId: task.id,
        tags: all
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
          })),
        removedNames,
        addedNames,
        names,
      };
    });
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
    // console.log(dto);

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
    // console.log(dto);
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

  /**
   * Обновляет поле cover у задачи
   * @param id ID задачи
   * @param path Путь к изображению (attachment.path)
   */
  async updateCover(id: number, path: string) {
    try {
      const task = await this.prisma.kanbanTask.update({
        where: { id },
        data: { cover: path },
        // при желании укажите select, чтобы вернуть только нужные поля
        // select: { id: true, title: true, cover: true }
      });

      return task;
    } catch (e) {
      // P2025 — запись не найдена
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException(`Task ${id} not found`);
      }
      throw e;
    }
  }
}
