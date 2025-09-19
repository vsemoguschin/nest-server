import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { KanbanFilesService } from '../kanban-files/kanban-files.service';
import axios from 'axios';
import { UserDto } from '../users/dto/user.dto';
import { CreateBoardTagDto } from './dto/create-board-tag.dto';

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: KanbanFilesService,
  ) {}

  async getKanban(user: UserDto, boardId: number, hiddenIds: number[] = []) {
    const userId = user.id;
    const columnsWhere: any = { deletedAt: null };
    if (hiddenIds?.length) {
      columnsWhere.id = { notIn: hiddenIds };
    }
    const board = await this.prisma.board.findFirst({
      where: {
        id: boardId,
        deletedAt: null,
        users: {
          some: ['ADMIN'].includes(user?.role.shortName)
            ? { id: { gt: 0 } }
            : { id: userId },
        },
      },
      select: {
        id: true,
        title: true,
        columns: {
          where: columnsWhere,
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            position: true,
            tasks: {
              where: { deletedAt: null },
              orderBy: { position: 'asc' },
              select: {
                id: true,
                title: true,
                position: true,
                columnId: true,
                cover: true,
                boardId: true,

                // только имена тегов
                tags: { select: { name: true } },

                // ⬇️ берём ТОЛЬКО одно превью-изображение (jpeg/png/webp)
                attachments: {
                  where: {
                    file: {
                      mimeType: {
                        in: ['image/jpeg', 'image/png', 'image/webp'],
                      },
                    },
                  },
                  select: {
                    file: {
                      select: {
                        path: true, // если будет thumbnailPath — добавим его здесь
                        mimeType: true,
                      },
                    },
                  },
                  orderBy: {
                    createdAt: 'desc',
                  },
                  take: 1,
                },

                // ⬇️ общее количество вложений без тащения их данных
                _count: { select: { attachments: true } },

                // ⬇️ "узкий" набор полей участников (ровно то, что нужно в карточке)
                members: {
                  select: {
                    id: true,
                    fullName: true,
                    avatarUrl: true,
                    role: { select: { fullName: true } },
                  },
                },
                orders: {
                  select: {
                    deadline: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!board) throw new NotFoundException('Board not found or access denied');

    return {
      id: board.id,
      title: board.title,
      columns: await Promise.all(
        board.columns.map(async (c) => {
          return {
            id: c.id,
            title: c.title,
            position: c.position,
            tasks: c.tasks
              .map((t) => {
                const previewPath = t.attachments[0]?.file.path ?? '';

                return {
                  id: t.id,
                  title: t.title,
                  preview: t.cover ?? previewPath,
                  path: previewPath,
                  columnId: t.columnId,
                  attachmentsLength: t._count.attachments,
                  tags: t.tags.map((x) => x.name),
                  members: t.members,
                  boardId: t.boardId,
                  deadline:
                    t.orders.sort((a, b) =>
                      a.deadline.localeCompare(b.deadline),
                    )[0]?.deadline || '',
                };
              })
              .sort((a, b) => a.deadline.localeCompare(b.deadline)),
          };
        }),
      ),
    };
  }

  /**Получить список доступных колонок для добавления в задачу */
  async getColumns(boardId: number) {
    // подтягиваем участников
    const avalCol = await this.prisma.column.findMany({
      where: {
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

  async create(userId: number, dto: CreateBoardDto) {
    const existingBoard = await this.prisma.board.findFirst({
      where: {
        title: dto.title,
      },
    });
    if (existingBoard) {
      throw new BadRequestException(`Доска с таким названием уже существует`);
    }

    const newBoard = await this.prisma.board.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        users: {
          connect: { id: userId },
        },
      },
      include: {
        users: { select: { id: true, email: true, fullName: true } },
      },
    });
    await this.files.ensureBoardFolder(newBoard.id);
    return newBoard;
  }

  async getTags(boardId: number, user: UserDto) {
    const tags = await this.prisma.kanbanTaskTags.findMany({
      where: {
        boardId,
      },
    });
    return tags;
  }

  /** Создать новый тег в справочнике доски */
  async createTag(boardId: number, dto: CreateBoardTagDto) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Tag name is required');

    // проверим, что доска существует
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, deletedAt: null },
      select: { id: true },
    });
    if (!board) throw new NotFoundException('Board not found');

    // запрет дубликатов (без учёта регистра)
    const exists = await this.prisma.kanbanTaskTags.findFirst({
      where: { boardId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (exists)
      throw new BadRequestException('Метка с таким названием уже существует');

    const created = await this.prisma.kanbanTaskTags.create({
      data: { boardId, name, color: dto.color ?? '' },
    });

    // Возвращаем в формате, удобном фронту
    return {
      id: created.id,
      value: created.name,
      label: created.name,
      color: created.color,
    };
  }

  async listForUser(user: UserDto) {
    const list = await this.prisma.board.findMany({
      where: {
        deletedAt: null,
        users:
          user.role.shortName === 'ADMIN'
            ? { some: {} }
            : { some: { id: user.id } },
      },

      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        users: true,
        columns: true,
        _count: {
          select: { tasks: true, columns: true, users: true },
        },
      },
    });
    // console.log(list);
    return list;
  }

  async getById(userId: number, boardId: number) {
    const board = await this.prisma.board.findFirst({
      where: {
        id: boardId,
        deletedAt: null,
        // users: {
        //   some: { id: userId },
        // },
      },
      include: {
        users: { select: { id: true, email: true, fullName: true } },
        columns: {
          where: { deletedAt: null },
          orderBy: { position: 'asc' },
          include: {
            tasks: {
              where: { deletedAt: null },
              orderBy: { position: 'asc' },
              select: {
                id: true,
                title: true,
                description: true,
                position: true,
                columnId: true,
                boardId: true,
                tags: { select: { id: true, name: true } },
                _count: {
                  select: { attachments: true, comments: true },
                },
              },
            },
          },
        },
      },
    });

    if (!board) throw new NotFoundException('Board not found or access denied');
    return board;
  }

  /** Проверка существования доски */
  async ensureBoard(boardId: number) {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, deletedAt: null },
      select: { id: true },
    });
    if (!board) throw new NotFoundException('Board not found');
    return board;
  }

  /** Проверка существования пользователя */
  private async ensureUser(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** GET /boards/:boardId/members */
  async listMembers(boardId: number) {
    await this.ensureBoard(boardId);

    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      select: {
        users: {
          // where: { deletedAt: null },
          select: {
            id: true,
            fullName: true,
            role: { select: { fullName: true } },
          },
          orderBy: { fullName: 'asc' },
        },
      },
    });

    // Отдаём именно те поля, что ждёт фронт
    return (board?.users ?? []).map((u) => ({
      id: u.id,
      fullName: u.fullName,
      role: u.role?.fullName ?? '',
    }));
  }

  /** GET /boards/users */
  async listAllUsers() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    return users;
  }

  /** POST /boards/users/:userId  { boardId } */
  async addUserToBoard(boardId: number, userId: number) {
    await this.ensureBoard(boardId);
    await this.ensureUser(userId);

    // уже участник?
    const exists = await this.prisma.board.findFirst({
      where: { id: boardId, users: { some: { id: userId } } },
      select: { id: true },
    });
    if (exists) throw new BadRequestException('User already in board');

    await this.prisma.board.update({
      where: { id: boardId },
      data: { users: { connect: { id: userId } } },
    });
    return { success: true };
  }

  /** DELETE /boards/users/:userId  { boardId } */
  async removeUserFromBoard(boardId: number, userId: number) {
    await this.ensureBoard(boardId);
    await this.ensureUser(userId);

    // не участник?
    const exists = await this.prisma.board.findFirst({
      where: { id: boardId, users: { some: { id: userId } } },
      select: { id: true },
    });
    if (!exists) throw new BadRequestException('User is not a board member');

    await this.prisma.board.update({
      where: { id: boardId },
      data: { users: { disconnect: { id: userId } } },
    });
    return { success: true };
  }
}
