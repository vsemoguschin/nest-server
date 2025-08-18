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

  async getKanban(userId: number, boardId: number) {
    const board = await this.prisma.board.findFirst({
      where: {
        id: boardId,
        deletedAt: null,
        // users: { some: { id: userId } },
      },
      select: {
        id: true,
        title: true,
        columns: {
          where: { deletedAt: null },
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
                description: true,
                position: true,
                tags: { select: { name: true } },
                attachments: {
                  include: {
                    file: true,
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
            tasks: await Promise.all(
              c.tasks.map(async (t) => {
                const previewAtt = t.attachments.find(
                  (att) =>
                    att.file.mimeType === 'image/jpeg' ||
                    att.file.mimeType === 'image/png',
                );

                let size = '';
                // console.log(t.attachments);

                if (previewAtt) {
                  try {
                    const md = await axios.get(
                      'https://cloud-api.yandex.net/v1/disk/resources',
                      {
                        params: { path: previewAtt.file.path },
                        headers: {
                          Authorization: `OAuth ${process.env.YA_TOKEN}`,
                        },
                      },
                    );
                    // console.log(md.data);
                    // console.log(previewAtt.file.path);
                    size = md.data.sizes[0].url || '';
                  } catch (e) {
                    console.log(e.response.data);
                  }

                  // console.log(t.tags);

                  return {
                    id: t.id,
                    title: t.title,
                    preview: size,
                    path: previewAtt.file.path, // если хотите потом брать свежую ссылку
                    attachmentsLength: t.attachments.length,
                    tags: t.tags.map((t) => t.name),
                  };
                }

                return {
                  id: t.id,
                  title: t.title,
                  preview: '',
                  path: '',
                  attachmentsLength: t.attachments.length,
                  tags: t.tags.map((t) => t.name),
                };
              }),
            ),
          };
        }),
      ),
    };
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

  async listForUser(userId: number) {
    const list = await this.prisma.board.findMany({
      where: {
        deletedAt: null,
        // users: { some: { id: userId } },
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
}
