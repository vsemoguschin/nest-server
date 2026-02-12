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
import { collectTaskWarnings } from './utils/task-warnings';
import { DeliveryForTaskCreateDto } from '../deliveries/dto/delivery-for-task-create.dto';

type FieldKey = 'title' | 'description' | 'chatLink' | 'columnId' | 'dealId';

type TaskSnapshot = {
  id: number;
  title: string;
  description: string;
  chatLink: string | null;
  columnId: number;
  updatedAt: Date;
  dealId: number | null;
};

type UpdateTaskResult = {
  changed: boolean;
  updated: TaskSnapshot;
  field: FieldKey | null;
  fromVal: unknown | null;
  toVal: unknown | null;
};

const POSITION_STEP = 1000;
const POSITION_SCALE = 4;
const POSITION_MAX_ABS = 999999.9999;
const POSITION_SAFE_LIMIT = POSITION_MAX_ABS - POSITION_STEP;
const LOCKED_COLUMN_ID = 25;
const TAG_REMOVAL_COLUMN_ID = 17;
const TAG_ID_TO_REMOVE = 9;
const BOOK_TAG_REMOVAL_COLUMN_ID = 92;
const BOOK_TAG_ID_TO_REMOVE = 25;
const PAYMENT_REQUIRED_COLUMN_IDS = [65, 79];

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

type NeonPriceKey = 'smart' | 'rgb' | 'rgb_8mm' | 'standart' | 'standart_8mm';

type NeonRates = Record<NeonPriceKey, { rate: number; controller: number }>;

type NeonCostInput = {
  color?: string | null;
  width?: string | null;
  length?: Prisma.Decimal | number | string | null;
};

type OrderCostSupplies = {
  adapters: Array<{
    name: string | null;
    priceForItem: Prisma.Decimal | number | null;
  }>;
  fittingsByName: Map<string, number>;
};

type OrderCostPayload = {
  taskId: number;
  dealId: number | null;
  boardId: number;
  computedAt: Date;
  calcVersion: number;
  priceForBoard: number;
  priceForScreen: number;
  neonPrice: number;
  lightingPrice: number;
  wirePrice: number;
  adapterPrice: number;
  plugPrice: number;
  packageCost: number;
  dimmerPrice: number;
  totalCost: number;
  boardWidth: number;
  boardHeight: number;
  polikSquare: number;
  policPerimetr: number;
  pazLength: number;
  lightingsLength: number;
  wireLength: number;
  print: boolean;
  screen: boolean;
  dimmer: boolean;
  wireType: string;
  adapterModel: string;
  plug: string;
};

type TaskOrderWithCostRelations = Prisma.TaskOrderGetPayload<{
  include: {
    neons: true;
    lightings: true;
    package: { include: { items: true } };
    task: { select: { boardId: true; dealId: true } };
  };
}>;

const ORDER_COST_HOLDER_NAMES = new Set([
  'Держатели стальные',
  'Держатели золотые',
  'Держатели черные',
]);

const ORDER_COST_VERSION = 1;

const ORDER_COST_PRICES = {
  perm: {
    polik: 2222,
    print: {
      polik: 1636,
      print: 1785,
      rezka: 30,
      package: 30,
      paz: 30,
    },
  },
  spb: {
    polik: 2700,
    print: {
      polik: 2700,
      print: 1600,
      rezka: 42,
      package: 0,
      paz: 42,
    },
  },
  neon: {
    smart: { rate: 548, controller: 1094 },
    rgb: { rate: 355, controller: 320 },
    rgb_8mm: { rate: 486, controller: 320 },
    standart: { rate: 190, controller: 0 },
    standart_8mm: { rate: 220, controller: 0 },
  },
  lightings: {
    rgb: { rate: 355, controller: 0 },
    standart: { rate: 190, controller: 0 },
  },
  wire: {
    ['Акустический']: 28,
    ['Черный']: 31,
    ['Белый']: 26,
  },
} as const;

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
        tags: true,
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
      select: {
        id: true,
        boardId: true,
        title: true,
        subscriptions: {
          where: {
            user: {
              deletedAt: null,
            },
          },
          select: {
            userId: true,
            noticeType: true,
            user: {
              select: {
                tg_id: true,
              },
            },
          },
        },
      },
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

  private formatPosition(value: number): string {
    return value.toFixed(POSITION_SCALE);
  }

  private async normalizeColumnPositions(
    tx: Prisma.TransactionClient,
    boardId: number,
    columnId: number,
  ) {
    const tasks = await tx.kanbanTask.findMany({
      where: { boardId, columnId, deletedAt: null },
      orderBy: { position: 'asc' },
      select: { id: true },
    });

    if (!tasks.length) return;

    // Проверяем, не превысит ли финальная позиция лимит DECIMAL(10,4)
    const maxPossiblePosition = tasks.length * POSITION_STEP;
    if (maxPossiblePosition >= POSITION_SAFE_LIMIT) {
      // Если превысит, используем меньший шаг
      const adjustedStep = Math.floor(POSITION_SAFE_LIMIT / tasks.length);
      let position = adjustedStep;
      for (const task of tasks) {
        await tx.kanbanTask.update({
          where: { id: task.id },
          data: { position: this.formatPosition(position) },
        });
        position += adjustedStep;
      }
    } else {
      // Обычная нормализация с POSITION_STEP
      let position = POSITION_STEP;
      for (const task of tasks) {
        await tx.kanbanTask.update({
          where: { id: task.id },
          data: { position: this.formatPosition(position) },
        });
        position += POSITION_STEP;
      }
    }
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
          include: {
            neons: true,
            lightings: true,
            package: { include: { items: true } },
          },
        },
        // берем только zip-вложения
        attachments: {
          // берём только последний загруженный .cdr
          where: { file: { path: { endsWith: '.cdr' } } },
          select: {
            file: {
              select: {
                id: true,
                name: true,
                ya_name: true,
                size: true,
                preview: true,
                path: true,
                directory: true,
                mimeType: true,
                file: true,
                uploadedById: true,
              },
            },
          },
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

      const createdOrderIds: number[] = [];

      // Дублируем все заказы и их дочерние записи
      for (const order of srcTask.orders ?? []) {
        const normalizedIsAcrylic =
          typeof (order as any).isAcrylic === 'boolean'
            ? (order as any).isAcrylic
            : String(order?.acrylic ?? '').trim() !== '';
        const normalizedAcrylic = normalizedIsAcrylic
          ? ((order as any).acrylic ?? '')
          : '';
        const normalizedStand = (order as any).stand ?? false;
        const packageItemsData = ((order as any).package?.items ?? [])
          .filter((item: any) => {
            const name = String(item?.name ?? '').trim();
            if (name === '' || name === 'Нет') return false;
            if (!normalizedIsAcrylic && item?.category === 'Акрил')
              return false;
            if (
              !normalizedStand &&
              item?.category === 'Поликарбонат' &&
              item?.name === 'Подставка'
            )
              return false;
            return true;
          })
          .map((item: any) => {
            const quantity = Number(item?.quantity ?? 0) || 0;
            const isAcrylic = item?.category === 'Акрил';
            const isStand =
              item?.category === 'Поликарбонат' && item?.name === 'Подставка';
            const minQuantity = isAcrylic || isStand ? 0.1 : 1;
            const normalizedQuantity = Math.max(minQuantity, quantity);
            return {
              name: item?.name ?? '',
              category: item?.category ?? 'Комплектующие для упаковки',
              quantity:
                isAcrylic || isStand
                  ? Math.round(normalizedQuantity * 100) / 100
                  : normalizedQuantity,
            };
          });

        const createdOrder = await tx.taskOrder.create({
          data: {
            taskId: created.id,
            dealId: (order as any).dealId ?? null,
            title: order.title ?? '',
            deadline: order.deadline ?? '',
            material: order.material ?? '',
            boardWidth: order.boardWidth ?? 0,
            boardHeight: order.boardHeight ?? 0,
            holeType: order.holeType ?? '',
            holeInfo: (order as any).holeInfo ?? '',
            stand: order.stand ?? false,
            laminate: order.laminate ?? '',
            print: order.print ?? false,
            printQuality: order.printQuality ?? false,
            acrylic: normalizedAcrylic,
            isAcrylic: normalizedIsAcrylic,
            type: order.type ?? '',
            wireInfo: order.wireInfo ?? '',
            wireType: order.wireType ?? 'Акустический',
            wireLength: order.wireLength ?? '',
            elements: order.elements ?? 0,
            gift: order.gift ?? false,
            adapter: order.adapter ?? '',
            adapterInfo: (order as any).adapterInfo ?? '',
            adapterModel: (order as any).adapterModel ?? '',
            plug: order.plug ?? '',
            plugColor: (order as any).plugColor ?? '',
            plugLength: (order as any).plugLength ?? 0,
            switch: order.switch ?? true,
            screen: (order as any).screen ?? false,
            fitting: order.fitting ?? '',
            dimmer: order.dimmer ?? false,
            giftPack: order.giftPack ?? false,
            description: order.description ?? '',
            docs: (order as any).docs ?? false,
            package: {
              create: {
                items: packageItemsData.length
                  ? {
                      createMany: {
                        data: packageItemsData,
                      },
                    }
                  : undefined,
              },
            },

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
          select: { id: true },
        });
        createdOrderIds.push(createdOrder.id);
      }

      await this.upsertOrdersCost(createdOrderIds, tx);

      // Соберём файлы для переноса в новую карточку: все .cdr вложения + файл из cover (если есть)
      const attachmentFiles = (srcTask.attachments ?? [])
        .map((a) => a.file)
        .filter((f): f is NonNullable<typeof f> => !!f);

      const duplicatedAttachmentIds: number[] = [];
      for (const file of attachmentFiles) {
        const duplicated = await tx.kanbanFile.create({
          data: {
            name: file.name,
            ya_name: file.ya_name,
            size: file.size,
            preview: file.preview,
            path: file.path,
            directory: file.directory,
            mimeType: file.mimeType,
            file: file.file,
            uploadedById: file.uploadedById,
          },
          select: { id: true },
        });
        duplicatedAttachmentIds.push(duplicated.id);
      }

      let newCoverFileId: number | null = null;
      if (srcTask.cover) {
        const coverFile = await tx.kanbanFile.findFirst({
          where: { path: srcTask.cover, deletedAt: null },
          select: {
            id: true,
            name: true,
            ya_name: true,
            size: true,
            preview: true,
            path: true,
            directory: true,
            mimeType: true,
            file: true,
            uploadedById: true,
          },
        });
        if (coverFile) {
          const duplicatedCover = await tx.kanbanFile.create({
            data: {
              name: coverFile.name,
              ya_name: coverFile.ya_name,
              size: coverFile.size,
              preview: coverFile.preview,
              path: coverFile.path,
              directory: coverFile.directory,
              mimeType: coverFile.mimeType,
              file: coverFile.file,
              uploadedById: coverFile.uploadedById,
            },
            select: { id: true },
          });
          newCoverFileId = duplicatedCover.id;
        }
      }

      // 1) прикрепим как вложения к задаче (сумма всех файлов)
      const toAttach = [
        ...duplicatedAttachmentIds,
        ...(newCoverFileId ? [newCoverFileId] : []),
      ];
      if (toAttach.length) {
        await tx.kanbanTaskAttachment.createMany({
          data: toAttach.map((fid) => ({ taskId: created.id, fileId: fid })),
          skipDuplicates: true,
        });
      }

      // 2) создадим отдельные комментарии: один для изображения cover, другой для .cdr файлов
      if (newCoverFileId) {
        const coverComment = await tx.kanbanTaskComments.create({
          data: {
            taskId: created.id,
            authorId: user.id,
            text: '',
          },
          select: { id: true },
        });
        await tx.kanbanFile.update({
          where: { id: newCoverFileId },
          data: { commentId: coverComment.id },
          select: { id: true },
        });
      }
      if (duplicatedAttachmentIds.length) {
        const cdrComment = await tx.kanbanTaskComments.create({
          data: {
            taskId: created.id,
            authorId: user.id,
            text: 'Макет',
          },
          select: { id: true },
        });
        await tx.kanbanFile.updateMany({
          where: { id: { in: duplicatedAttachmentIds } },
          data: { commentId: cdrComment.id },
        });
      }

      return created;
    });
  }

  /**
   * Скопировать все задачи из колонки на другую доску (в первую колонку целевой доски).
   */
  async copyColumnToBoard(
    user: UserDto,
    columnId: number,
    dto: { boardId: number },
  ) {
    const column = await this.ensureTaskColumn(columnId);
    await this.assertBoardAccess(user.id, column.boardId);

    const tasks = await this.prisma.kanbanTask.findMany({
      where: {
        columnId,
        deletedAt: null,
        archived: false,
      },
      orderBy: { position: 'asc' },
      select: { id: true },
    });

    const created: Array<{
      fromTaskId: number;
      id: number;
      boardId: number;
      columnId: number;
      title: string;
    }> = [];

    for (const task of tasks) {
      const copied = await this.copyToBoard(user, task.id, dto);
      created.push({ fromTaskId: task.id, ...copied });
    }

    return { count: created.length, created };
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

    return await this.prisma.$transaction(async (tx) => {
      const updated = await tx.kanbanTask.update({
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

      await this.upsertTaskOrdersCost(updated.id, tx);

      return updated;
    });
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
      select: {
        id: true,
        title: true,
        description: true,
        chatLink: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        boardId: true,
        columnId: true,
        cover: true,
        archived: true,
        tags: { select: { id: true, name: true } },
        board: { select: { id: true, title: true, description: true } },
        column: { select: { id: true, title: true, position: true } },
        creator: { select: { id: true, fullName: true, email: true } },
        orders: {
          select: {
            deadline: true,
            boardHeight: true,
            boardWidth: true,
            type: true,
            holeType: true,
            fitting: true,
            laminate: true,
            acrylic: true,
            docs: true,
            print: true,
            dimmer: true,
            neons: { select: { color: true, width: true } },
            lightings: { select: { color: true } },
            material: true,
          },
        },
        deal: {
          select: {
            id: true,
            title: true,
            saleDate: true,
            price: true,
            deliveries: {
              select: {
                method: true,
                type: true,
                track: true,
              },
            },
            payments: {
              select: {
                method: true,
                price: true,
              },
            },
            dops: {
              select: {
                price: true,
              },
            },
          },
        },
        _count: { select: { attachments: true } },
      },
    });

    if (!task) throw new NotFoundException('Task not found');
    await this.assertBoardAccess(userId, task.boardId);

    let avaliableDeals: { id: number; title: string; saleDate: string }[] = [];

    if (task.chatLink) {
      const deals = await this.prisma.deal.findMany({
        where: {
          client: {
            chatLink: { equals: task.chatLink, mode: 'insensitive' },
          },
        },
        select: {
          id: true,
          title: true,
          saleDate: true,
        },
        // take: 2,
      });

      avaliableDeals = deals.map((d) => ({
        id: d.id,
        title: d.title,
        saleDate: d.saleDate,
      }));
    }

    const warnings = collectTaskWarnings(
      task.orders,
      task.deal?.deliveries ?? [],
      task.chatLink,
      task.deal?.payments,
    );

    let remainder: null | number = null;
    if (task.deal) {
      const dopsPrice = task.deal.dops.reduce((acc, dop) => acc + dop.price, 0);
      const totalPrice = task.deal.price + dopsPrice;
      remainder =
        totalPrice -
        task.deal.payments.reduce(
          (acc, payment) => acc + Number(payment.price ?? 0),
          0,
        );
    }
    

    const deal = task.deal
      ? {
          id: task.deal.id,
          title: task.deal.title,
          saleDate: task.deal.saleDate,
        }
      : null;

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      chatLink: task.chatLink,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      deletedAt: task.deletedAt,
      columnId: task.columnId,
      tags: task.tags,
      attachmentsLength: task._count.attachments,
      cover: task.cover,
      archived: task.archived,
      warnings,
      deal,
      tracks:
        task.deal?.deliveries.map((d) => d.track).filter((t) => t !== '') ?? [],
      avaliableDeals,
      remainder,

      comments: [],
      audits: [],
      board: task.board,
      column: task.column,
      creator: task.creator,
    };
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
        ['title', 'description', 'chatLink', 'columnId', 'dealId'] as const
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
            dealId: true,
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
          dealId: true,
        },
      });

      const data: Prisma.KanbanTaskUpdateInput = {};
      if (field === 'title') data.title = dto.title!;
      if (field === 'description') data.description = dto.description!;
      if (field === 'chatLink') {
        data.chatLink = dto.chatLink ?? null;
        data.deal = { disconnect: true };
      }
      if (field === 'columnId')
        data.column = { connect: { id: dto.columnId! } };
      if (field === 'dealId') {
        const hasDealId =
          typeof dto.dealId === 'number' && Number.isFinite(dto.dealId);
        data.deal = hasDealId
          ? { connect: { id: dto.dealId! } }
          : { disconnect: true };
      }

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
          dealId: true,
        },
      });

      let finalDealId = updated.dealId;

      if (field === 'dealId') {
        const hasDealId =
          typeof dto.dealId === 'number' && Number.isFinite(dto.dealId);
        finalDealId = hasDealId ? dto.dealId! : null;
      }

      const fromVal = (before as any)[field] ?? null;
      const toVal = (updated as any)[field] ?? null;

      return {
        changed: true,
        updated: { ...updated, dealId: finalDealId },
        field,
        fromVal,
        toVal,
      };
    });
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
    const parsedId = Number(q);
    const hasId =
      Number.isSafeInteger(parsedId) &&
      parsedId >= 1 &&
      parsedId <= 2147483647 &&
      /^[0-9]+$/.test(q);
    const or: Prisma.KanbanTaskWhereInput[] = [
      {
        chatLink: { contains: q, mode: 'insensitive' },
      },
      {
        title: { contains: q, mode: 'insensitive' },
      },
      {
        deliveries: {
          some: { track: { contains: q, mode: 'insensitive' } },
        },
      },
    ];

    if (hasId) {
      or.push({ id: parsedId });
    }

    const tasks = await this.prisma.kanbanTask.findMany({
      where: {
        deletedAt: null,
        OR: or,
        boardId: ['ADMIN', 'KD', 'G'].includes(user.role.shortName)
          ? { gt: 0 }
          : { in: userBoards },
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

  /** Удалить задачу */
  async deleteTask(userId: number, task: { id: number; boardId: number }) {
    await this.assertBoardAccess(userId, task.boardId);

    await this.prisma.kanbanTask.update({
      where: { id: task.id },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }

  /**
   * Проверяет, что сумма платежей >= общей стоимости сделки (price + dops)
   * @throws BadRequestException если проверка не пройдена
   */
  private async validateDealPayments(taskId: number): Promise<void> {
    const task = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        deal: {
          select: {
            id: true,
            price: true,
            dops: {
              select: {
                price: true,
              },
            },
            payments: {
              select: {
                price: true,
              },
            },
          },
        },
      },
    });

    if (!task?.deal) {
      throw new BadRequestException(
        'Нельзя переместить задачу в эту колонку: у задачи нет привязанной сделки',
      );
    }

    const deal = task.deal;
    const dealPrice = deal.price ?? 0;
    const dopsTotal = (deal.dops ?? []).reduce(
      (sum, dop) => sum + (dop.price ?? 0),
      0,
    );
    const dealTotalPrice = dealPrice + dopsTotal;

    const paymentsTotal = (deal.payments ?? []).reduce(
      (sum, payment) => sum + (payment.price ?? 0),
      0,
    );

    if (paymentsTotal < dealTotalPrice) {
      throw new BadRequestException(
        `Нельзя переместить в эту колонку: Заказ не оплачен полностью`,
      );
    }
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
    if (task.columnId === LOCKED_COLUMN_ID) {
      throw new BadRequestException('Перемещение из этой колонки запрещено');
    }

    return this.prisma.$transaction(async (tx) => {
      // исходная колонка (для аудита/ответа)
      const fromColumn = await tx.column.findFirst({
        where: { id: task.columnId, boardId: task.boardId },
        select: { id: true, title: true },
      });

      // целевая колонка
      const targetColumn = await tx.column.findFirst({
        where: { id: dto.toColumnId, boardId: task.boardId, deletedAt: null },
        select: {
          id: true,
          title: true,
          boardId: true,
          subscriptions: {
            where: { user: { deletedAt: null } },
            select: {
              userId: true,
              noticeType: true,
              user: {
                select: { tg_id: true },
              },
            },
          },
        },
      });
      if (!targetColumn) throw new NotFoundException('Target column not found');

      // Проверка платежей при перемещении в колонки, требующие полной оплаты
      if (
        PAYMENT_REQUIRED_COLUMN_IDS.includes(targetColumn.id) &&
        !['ADMIN', 'KD', 'G', 'ROV'].includes(user.role.shortName)
      ) {
        await this.validateDealPayments(task.id);
      }

      // --- позиция: сделать ПЕРВОЙ в целевой колонке ---
      const fetchTop = () =>
        tx.kanbanTask.findFirst({
          where: {
            boardId: task.boardId,
            columnId: targetColumn.id,
            deletedAt: null,
            NOT: { id: task.id },
          },
          orderBy: { position: 'asc' },
          select: { position: true },
        });

      let top = await fetchTop();
      let newPositionNumeric = 1;

      if (top) {
        let candidate = Number(top.position) - POSITION_STEP;
        if (!Number.isFinite(candidate)) {
          candidate = 1;
        }

        // перестраиваем позиции, если приблизились к ограничениям DECIMAL(10,4)
        if (Math.abs(candidate) >= POSITION_SAFE_LIMIT) {
          await this.normalizeColumnPositions(
            tx,
            task.boardId,
            targetColumn.id,
          );
          top = await fetchTop();
          candidate = top ? Number(top.position) - POSITION_STEP : 1;
        }

        newPositionNumeric = candidate;
      }

      const updateData: Prisma.KanbanTaskUpdateInput = {
        column: { connect: { id: targetColumn.id } },
        position: this.formatPosition(newPositionNumeric),
      };

      if (targetColumn.id === TAG_REMOVAL_COLUMN_ID) {
        updateData.tags = { disconnect: { id: TAG_ID_TO_REMOVE } };
      }

      if (targetColumn.id === BOOK_TAG_REMOVAL_COLUMN_ID) {
        updateData.tags = { disconnect: { id: BOOK_TAG_ID_TO_REMOVE } };
      }

      // обновление задачи
      const updated = await tx.kanbanTask.update({
        where: { id: task.id },
        data: updateData,
        select: {
          id: true,
          title: true,
          columnId: true,
          position: true,
          updatedAt: true,
        },
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
  async moveToNextColumn(
    taskId: number,
    user: UserDto,
  ): Promise<{
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
      subscriptions: {
        userId: number;
        noticeType: string;
        user: {
          tg_id: string;
        };
      }[];
    };
  }> {
    // 1) Текущая задача + её колонка
    const task = await this.ensureTask(taskId);
    if (task.columnId === LOCKED_COLUMN_ID) {
      throw new BadRequestException('Перемещение из этой колонки запрещено');
    }
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
        deletedAt: null,
      },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        title: true,
        position: true,
        boardId: true,
        subscriptions: {
          where: { user: { deletedAt: null } },
          select: {
            userId: true,
            noticeType: true,
            user: {
              select: { tg_id: true },
            },
          },
        },
      },
    });

    if (!targetColumn) {
      throw new BadRequestException('Следующая колонка не найдена');
    }

    // Проверка платежей при перемещении в колонки, требующие полной оплаты
    if (
      PAYMENT_REQUIRED_COLUMN_IDS.includes(targetColumn.id) &&
      !['ADMIN', 'KD', 'G', 'ROV'].includes(user.role.shortName)
    ) {
      await this.validateDealPayments(taskId);
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
    const updateData: Prisma.KanbanTaskUpdateInput = {
      column: { connect: { id: targetColumn.id } },
      position: newTopPosition, // карточка становится первой
    };
    if (targetColumn.id === TAG_REMOVAL_COLUMN_ID) {
      updateData.tags = { disconnect: { id: TAG_ID_TO_REMOVE } };
    }
    if (targetColumn.id === BOOK_TAG_REMOVAL_COLUMN_ID) {
      updateData.tags = { disconnect: { id: BOOK_TAG_ID_TO_REMOVE } };
    }

    const updated = await this.prisma.kanbanTask.update({
      where: { id: taskId },
      data: updateData,
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
      orderBy: { id: 'asc' },
      include: {
        neons: true,
        lightings: true,
        package: { include: { items: true } },
      },
    });
    const orderIds = items.map((order) => order.id);
    const reports = orderIds.length
      ? await this.prisma.masterReport.findMany({
          where: { orderId: { in: orderIds }, deletedAt: null },
          orderBy: { id: 'desc' },
          select: {
            user: {
              select: {
                fullName: true,
                id: true,
              },
            },
            orderId: true,
          },
        })
      : [];
    const packerReport = await this.prisma.packerReport.findFirst({
      where: { taskId, deletedAt: null },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        taskId: true,
        user: {
          select: {
            fullName: true,
            id: true,
          },
        },
      },
    });
    const reportByOrderId = new Map<number, (typeof reports)[number]>();
    for (const report of reports) {
      if (report.orderId == null) continue;
      if (reportByOrderId.has(report.orderId)) continue;
      reportByOrderId.set(report.orderId, report);
    }
    return items.map((order) => {
      return {
        ...order,
        neons: order.neons,
        lightings: order.lightings,
        package: order.package,
        report: reportByOrderId.get(order.id) ?? null,
        packerReport,
      };
    });
  }

  /** Список доставок задачи */
  async deliveriesListForTask(taskId: number) {
    const { dealId } = await this.ensureTask(taskId);
    if (!dealId) return [];
    const deliveries = await this.prisma.delivery.findMany({
      where: { dealId },
      orderBy: { id: 'asc' },
      include: {
        deal: {
          select: {
            id: true,
            title: true,
            saleDate: true,
          },
        },
      },
    });
    return deliveries;
  }

  /** Создать доставку для задачи */
  async createDeliveryForTask(
    taskId: number,
    dto: DeliveryForTaskCreateDto,
    user: UserDto,
  ) {
    const task = await this.ensureTask(taskId);

    const dealId = task.dealId;

    if (!dealId) {
      throw new NotFoundException('Для доставки требуется указанная сделка');
    }

    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      select: { id: true, workSpaceId: true },
    });

    if (!deal) {
      throw new NotFoundException(`Сделка с ID ${dealId} не найдена`);
    }

    return this.prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.create({
        data: {
          date: dto.date,
          method: dto.method || '',
          type: dto.type || '',
          purpose: dto.purpose || '',
          description: dto.description || '',
          track: dto.track || '',
          cdekStatus: dto.cdekStatus || null,
          status: dto.status || 'Создана',
          price: dto.price ?? 0,
          deliveredDate: dto.deliveredDate || '',
          dealId,
          taskId: task.id,
          userId: user.id,
          workSpaceId: deal.workSpaceId,
        },
        include: {
          deal: {
            select: { id: true, title: true, saleDate: true },
          },
        },
      });

      await tx.dealAudit.create({
        data: {
          dealId,
          userId: user.id,
          action: 'Добавление доставки',
          comment: `Добавил доставку (${delivery.method}) для задачи ${task.id}`,
        },
      });

      return delivery;
    });
  }

  /** Один заказ */
  async getOneOrder(orderId: number) {
    const item = await this.prisma.taskOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        neons: true,
        lightings: true,
        package: { include: { items: true } },
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
      wireType,
      wireLength,
      isAcrylic,
      acrylic,
      adapter,
      adapterInfo,
      adapterModel,
      plug,
      plugColor,
      plugLength,
      packageItems = [],
      ...rest
    } = dto;

    const normalizedIsAcrylic =
      typeof isAcrylic === 'boolean'
        ? isAcrylic
        : String(acrylic ?? '').trim() !== '';
    const normalizedAcrylic = normalizedIsAcrylic ? (acrylic ?? '') : '';
    const normalizedStand = dto.stand ?? false;

    const normalizedAdapter = adapter ?? '';
    const normalizedAdapterInfo =
      normalizedAdapter === 'Нет' ? '' : (adapterInfo ?? '');
    const normalizedAdapterModel =
      normalizedAdapter === 'Нет'
        ? ''
        : adapterModel === 'Нет'
          ? ''
          : (adapterModel ?? '');

    const normalizedPlug = plug ?? '';
    const normalizedPlugColor =
      normalizedPlug === 'Нет'
        ? ''
        : normalizedPlug === 'Стандарт'
          ? (plugColor ?? 'Черный')
          : (plugColor ?? '');
    const normalizedPlugLength =
      normalizedPlug === 'Нет'
        ? 0
        : normalizedPlug === 'Стандарт'
          ? (plugLength ?? 1.8)
          : (plugLength ?? 0);

    const normalizedWireType = wireType ?? 'Акустический';
    const normalizedWireLength = normalizedWireType === 'Нет' ? 0 : wireLength;

    const packageItemsData = packageItems
      .filter((item) => {
        const name = String(item?.name ?? '').trim();
        if (name === '' || name === 'Нет') return false;
        if (!normalizedIsAcrylic && item?.category === 'Акрил') return false;
        if (
          !normalizedStand &&
          item?.category === 'Поликарбонат' &&
          item?.name === 'Подставка'
        )
          return false;
        return true;
      })
      .map((item) => {
        const quantity = Number(item.quantity ?? 0) || 0;
        const isAcrylic = item.category === 'Акрил';
        const isStand =
          item.category === 'Поликарбонат' && item.name === 'Подставка';
        const minQuantity = isAcrylic || isStand ? 0.1 : 1;
        const normalizedQuantity = Math.max(minQuantity, quantity);
        return {
          name: item.name ?? '',
          category: item.category ?? 'Комплектующие для упаковки',
          quantity:
            isAcrylic || isStand
              ? Math.round(normalizedQuantity * 100) / 100
              : normalizedQuantity,
        };
      });

    return await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskOrder.create({
        data: {
          taskId,
          ...(dealId !== undefined ? { dealId: dealId as any } : {}), // если dealId опционален в схеме — можно передать null
          ...rest,
          isAcrylic: normalizedIsAcrylic,
          acrylic: normalizedAcrylic,
          wireType: normalizedWireType,
          ...(normalizedWireLength !== undefined
            ? { wireLength: String(normalizedWireLength) }
            : {}),
          ...(adapter !== undefined ? { adapter: normalizedAdapter } : {}),
          ...(adapter !== undefined
            ? { adapterInfo: normalizedAdapterInfo }
            : {}),
          ...(adapter !== undefined || adapterModel !== undefined
            ? { adapterModel: normalizedAdapterModel }
            : {}),
          ...(plug !== undefined ? { plug: normalizedPlug } : {}),
          ...(plug !== undefined ? { plugColor: normalizedPlugColor } : {}),
          ...(plug !== undefined ? { plugLength: normalizedPlugLength } : {}),
          package: {
            create: {
              items: packageItemsData.length
                ? {
                    createMany: {
                      data: packageItemsData,
                    },
                  }
                : undefined,
            },
          },
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
        include: {
          neons: true,
          lightings: true,
          package: { include: { items: true } },
          task: { select: { boardId: true, dealId: true } },
        },
      });

      const supplies = await this.getOrderCostSupplies(tx);
      const payload = this.buildOrderCostPayload(created, supplies);
      await tx.orderCost.upsert({
        where: { orderId: created.id },
        update: payload,
        create: {
          orderId: created.id,
          ...payload,
        },
      });

      return created;
    });
  }

  /** Обновить (полная замена массивов неонов/подсветок) */
  async updateOrder(orderId: number, dto: UpdateTaskOrderDto) {
    // console.log(dto);
    const ex = await this.prisma.taskOrder.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        id: true,
        plug: true,
        adapter: true,
        isAcrylic: true,
        stand: true,
      },
    });
    if (!ex) throw new NotFoundException('Order not found');

    const {
      neons,
      lightings,
      dealId,
      wireType,
      wireLength,
      isAcrylic,
      acrylic,
      adapter,
      adapterInfo,
      adapterModel,
      plug,
      plugColor,
      plugLength,
      packageItems,
      ...rest
    } = dto;

    return await this.prisma.$transaction(async (tx) => {
      const shouldTouchAdapterRelated =
        adapter !== undefined ||
        adapterInfo !== undefined ||
        adapterModel !== undefined;
      const shouldTouchAcrylic =
        isAcrylic !== undefined || acrylic !== undefined;
      const effectiveIsAcrylic =
        typeof isAcrylic === 'boolean'
          ? isAcrylic
          : acrylic !== undefined
            ? true
            : (ex.isAcrylic ?? false);
      const effectiveStand =
        typeof dto.stand === 'boolean' ? dto.stand : (ex.stand ?? false);
      const acrylicData = shouldTouchAcrylic
        ? effectiveIsAcrylic
          ? (acrylic ?? '')
          : ''
        : undefined;
      const effectiveAdapter = adapter ?? ex.adapter ?? '';
      const adapterInfoData =
        shouldTouchAdapterRelated && effectiveAdapter === 'Нет'
          ? ''
          : adapterInfo;
      const adapterModelData = shouldTouchAdapterRelated
        ? effectiveAdapter === 'Нет'
          ? ''
          : adapterModel !== undefined
            ? adapterModel === 'Нет'
              ? ''
              : adapterModel
            : undefined
        : undefined;

      const effectivePlug = plug ?? ex.plug ?? '';
      const shouldTouchPlugRelated =
        plug !== undefined ||
        plugColor !== undefined ||
        plugLength !== undefined;

      const plugColorData = shouldTouchPlugRelated
        ? effectivePlug === 'Нет'
          ? ''
          : plug !== undefined && effectivePlug === 'Стандарт'
            ? (plugColor ?? 'Черный')
            : plugColor
        : undefined;

      const plugLengthData = shouldTouchPlugRelated
        ? effectivePlug === 'Нет'
          ? 0
          : plug !== undefined && effectivePlug === 'Стандарт'
            ? (plugLength ?? 1.8)
            : plugLength
        : undefined;

      const wireLengthData =
        wireType === 'Нет' && wireLength === undefined ? 0 : wireLength;

      const packageItemsData =
        packageItems
          ?.filter((item) => {
            const name = String(item?.name ?? '').trim();
            if (name === '' || name === 'Нет') return false;
            if (!effectiveIsAcrylic && item?.category === 'Акрил') return false;
            if (
              !effectiveStand &&
              item?.category === 'Поликарбонат' &&
              item?.name === 'Подставка'
            )
              return false;
            return true;
          })
          .map((item) => {
            const quantity = Number(item.quantity ?? 0) || 0;
            const isAcrylic = item.category === 'Акрил';
            const isStand =
              item.category === 'Поликарбонат' && item.name === 'Подставка';
            const minQuantity = isAcrylic || isStand ? 0.1 : 1;
            const normalizedQuantity = Math.max(minQuantity, quantity);
            return {
              name: item.name ?? '',
              category: item.category ?? 'Комплектующие для упаковки',
              quantity:
                isAcrylic || isStand
                  ? Math.round(normalizedQuantity * 100) / 100
                  : normalizedQuantity,
            };
          }) ?? [];

      // 1) обновим плоские поля
      const updated = await tx.taskOrder.update({
        where: { id: orderId },
        data: {
          ...(dealId !== undefined ? { dealId: dealId as any } : {}),
          ...rest,
          ...(shouldTouchAcrylic ? { isAcrylic: effectiveIsAcrylic } : {}),
          ...(acrylicData !== undefined ? { acrylic: acrylicData } : {}),
          ...(wireType !== undefined
            ? { wireType: wireType ?? 'Акустический' }
            : {}),
          ...(wireLengthData !== undefined
            ? { wireLength: String(wireLengthData) }
            : {}),
          ...(adapter !== undefined ? { adapter } : {}),
          ...(adapterInfoData !== undefined
            ? { adapterInfo: adapterInfoData }
            : {}),
          ...(adapterModelData !== undefined
            ? { adapterModel: adapterModelData }
            : {}),
          ...(plug !== undefined ? { plug } : {}),
          ...(plugColorData !== undefined ? { plugColor: plugColorData } : {}),
          ...(plugLengthData !== undefined
            ? { plugLength: plugLengthData }
            : {}),
          ...(packageItems !== undefined
            ? {
                package: {
                  upsert: {
                    create: {
                      items: packageItemsData.length
                        ? { createMany: { data: packageItemsData } }
                        : undefined,
                    },
                    update: {
                      items: {
                        deleteMany: {},
                        ...(packageItemsData.length
                          ? { createMany: { data: packageItemsData } }
                          : {}),
                      },
                    },
                  },
                },
              }
            : {}),
        },
        include: {
          neons: true,
          lightings: true,
          package: { include: { items: true } },
        },
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
        include: {
          neons: true,
          lightings: true,
          package: { include: { items: true } },
          task: { select: { boardId: true, dealId: true } },
        },
      });
      if (!fresh) {
        return null;
      }

      const supplies = await this.getOrderCostSupplies(tx);
      const payload = this.buildOrderCostPayload(fresh, supplies);
      await tx.orderCost.upsert({
        where: { orderId },
        update: payload,
        create: {
          orderId,
          ...payload,
        },
      });

      const { task: _task, ...freshPayload } = fresh;
      return freshPayload;
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
      await tx.orderCost.deleteMany({ where: { orderId } });
      await tx.taskOrder.update({
        where: { id: orderId },
        data: { deletedAt: new Date() },
      });
    });

    return { success: true };
  }

  private calculateNeonCosts(neons: NeonCostInput[], neonRates: NeonRates) {
    const items = neons.map((neon) => {
      const color = neon?.color?.trim().toLowerCase();
      const width = neon?.width?.trim().toLowerCase();
      const is8mm = width === '8мм' || width === '8mm';

      let type: NeonPriceKey = 'standart';
      if (color === 'смарт' || color === 'smart') {
        type = 'smart';
      } else if (color === 'ргб' || color === 'rgb') {
        type = is8mm ? 'rgb_8mm' : 'rgb';
      } else if (is8mm) {
        type = 'standart_8mm';
      }

      const lengthValue = neon?.length;
      const lengthRaw =
        lengthValue &&
        typeof lengthValue === 'object' &&
        'toNumber' in lengthValue
          ? (lengthValue as Prisma.Decimal).toNumber()
          : Number(lengthValue ?? 0);
      const length = Number.isFinite(lengthRaw) ? lengthRaw : 0;

      const { rate, controller } = neonRates[type];
      const total = length * rate + controller;

      return {
        type,
        length,
        rate,
        controller,
        total,
      };
    });

    const total = items.reduce((sum, item) => sum + item.total, 0);

    return { items, total };
  }

  private resolveNumeric(value: unknown) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (
      value &&
      typeof value === 'object' &&
      'toNumber' in value &&
      typeof (value as Prisma.Decimal).toNumber === 'function'
    ) {
      const numeric = (value as Prisma.Decimal).toNumber();
      return Number.isFinite(numeric) ? numeric : 0;
    }

    const normalized = Number(value ?? 0);
    return Number.isFinite(normalized) ? normalized : 0;
  }

  private async getOrderCostSupplies(
    db: Prisma.TransactionClient | PrismaService,
  ): Promise<OrderCostSupplies> {
    const [adapters, fittings] = await Promise.all([
      db.suppliePosition.findMany({
        where: {
          category: 'Блоки питания',
        },
        distinct: ['name'],
        orderBy: [{ name: 'asc' }, { id: 'desc' }],
      }),
      db.suppliePosition.findMany({
        where: {
          name: {
            in: Array.from(ORDER_COST_HOLDER_NAMES),
          },
        },
        distinct: ['name'],
        orderBy: [{ name: 'asc' }, { id: 'desc' }],
      }),
    ]);

    const fittingsByName = new Map(
      fittings.map((fitting) => [
        fitting.name,
        this.resolveNumeric(fitting.priceForItem),
      ]),
    );

    return {
      adapters,
      fittingsByName,
    };
  }

  private roundCost(value: number) {
    return Math.round(value * 100) / 100;
  }

  private buildOrderCostPayload(
    order: TaskOrderWithCostRelations,
    supplies: OrderCostSupplies,
  ): OrderCostPayload {
    const boardHeight = this.resolveNumeric(order.boardHeight);
    const boardWidth = this.resolveNumeric(order.boardWidth);
    const polikSquare = (boardHeight * boardWidth) / 10000;
    const policPerimetr = (2 * (boardHeight + boardWidth)) / 100;

    const pazLength = (order.neons ?? []).reduce(
      (sum, neon) => sum + this.resolveNumeric(neon.length),
      0,
    );
    const lightingsLength = (order.lightings ?? []).reduce(
      (sum, lighting) => sum + this.resolveNumeric(lighting.length),
      0,
    );

    let priceForBoard = 0;
    let priceForScreen = 0;
    const screen = Boolean(order.screen);

    if (order.task?.boardId === 10) {
      priceForBoard = order.print
        ? ORDER_COST_PRICES.perm.print.package +
          ORDER_COST_PRICES.perm.print.paz * pazLength +
          ORDER_COST_PRICES.perm.print.print * polikSquare +
          ORDER_COST_PRICES.perm.print.rezka * policPerimetr +
          ORDER_COST_PRICES.perm.print.polik * polikSquare
        : ORDER_COST_PRICES.perm.polik * polikSquare;
      priceForScreen = screen ? ORDER_COST_PRICES.perm.polik * polikSquare : 0;
    } else {
      priceForBoard = order.print
        ? ORDER_COST_PRICES.spb.print.package +
          ORDER_COST_PRICES.spb.print.paz * pazLength +
          ORDER_COST_PRICES.spb.print.print * polikSquare +
          ORDER_COST_PRICES.spb.print.rezka * policPerimetr +
          ORDER_COST_PRICES.spb.print.polik * polikSquare
        : ORDER_COST_PRICES.spb.polik * polikSquare +
          ORDER_COST_PRICES.spb.print.rezka * policPerimetr;
      priceForScreen = screen
        ? ORDER_COST_PRICES.spb.polik * polikSquare +
          ORDER_COST_PRICES.spb.print.rezka * policPerimetr
        : 0;
    }

    const { total: neonPrice } = this.calculateNeonCosts(
      order.neons ?? [],
      ORDER_COST_PRICES.neon,
    );

    const lightingPrice =
      lightingsLength * ORDER_COST_PRICES.lightings.standart.rate;

    const wireRate =
      ORDER_COST_PRICES.wire[
        order.wireType as keyof typeof ORDER_COST_PRICES.wire
      ] ?? 0;
    const wireLength = this.resolveNumeric(order.wireLength);
    const wirePrice = wireRate * wireLength;

    const adapterModel = order.adapterModel ?? '';
    const adapter = supplies.adapters.find(
      (item) => item.name === adapterModel,
    );
    const adapterPrice = this.resolveNumeric(adapter?.priceForItem);
    const plugPrice = order.plug === 'Стандарт' ? 76 : 0;

    const packageItems = order.package?.items ?? [];
    const packageCost = packageItems.reduce((sum, item) => {
      if (!ORDER_COST_HOLDER_NAMES.has(item.name)) return sum;
      const price = supplies.fittingsByName.get(item.name);
      if (price == null) return sum;
      return sum + this.resolveNumeric(item.quantity) * price;
    }, 0);

    const dimmerPrice = order.dimmer ? 590 : 0;

    const totalCost =
      priceForBoard +
      neonPrice +
      lightingPrice +
      wirePrice +
      adapterPrice +
      plugPrice +
      packageCost +
      dimmerPrice +
      priceForScreen;

    return {
      taskId: order.taskId,
      dealId: order.dealId ?? order.task?.dealId ?? null,
      boardId: order.task?.boardId ?? 0,
      computedAt: new Date(),
      calcVersion: ORDER_COST_VERSION,
      priceForBoard: this.roundCost(priceForBoard),
      priceForScreen: this.roundCost(priceForScreen),
      neonPrice: this.roundCost(neonPrice),
      lightingPrice: this.roundCost(lightingPrice),
      wirePrice: this.roundCost(wirePrice),
      adapterPrice: this.roundCost(adapterPrice),
      plugPrice: this.roundCost(plugPrice),
      packageCost: this.roundCost(packageCost),
      dimmerPrice: this.roundCost(dimmerPrice),
      totalCost: this.roundCost(totalCost),
      boardWidth,
      boardHeight,
      polikSquare,
      policPerimetr,
      pazLength,
      lightingsLength,
      wireLength,
      print: Boolean(order.print),
      screen,
      dimmer: Boolean(order.dimmer),
      wireType: order.wireType ?? '',
      adapterModel,
      plug: order.plug ?? '',
    };
  }

  private async upsertOrdersCost(
    orderIds: number[],
    db: Prisma.TransactionClient,
  ) {
    if (!orderIds.length) return;

    const orders = await db.taskOrder.findMany({
      where: { id: { in: orderIds }, deletedAt: null },
      include: {
        neons: true,
        lightings: true,
        package: { include: { items: true } },
        task: { select: { boardId: true, dealId: true } },
      },
    });
    if (!orders.length) return;

    const supplies = await this.getOrderCostSupplies(db);
    for (const order of orders) {
      const payload = this.buildOrderCostPayload(order, supplies);
      await db.orderCost.upsert({
        where: { orderId: order.id },
        update: payload,
        create: {
          orderId: order.id,
          ...payload,
        },
      });
    }
  }

  private async upsertTaskOrdersCost(
    taskId: number,
    db: Prisma.TransactionClient,
  ) {
    const orders = await db.taskOrder.findMany({
      where: { taskId, deletedAt: null },
      select: { id: true },
    });
    await this.upsertOrdersCost(
      orders.map((order) => order.id),
      db,
    );
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
