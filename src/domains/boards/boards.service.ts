import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { KanbanFilesService } from '../kanban-files/kanban-files.service';

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
      columns: board.columns.map((c) => {
        return {
          id: c.id,
          title: c.title,
          position: c.position,
          tasks: c.tasks.map((t) => {
            const previewAtt = t.attachments.find(
              (att) => att.file.mimeType === 'image/jpeg',
            );

            if (previewAtt) {
              const url = previewAtt.file.preview;
              const newSize = 'M'; // Можно получить из ввода пользователя или состояния
              const urlObj = new URL(url);
              urlObj.searchParams.set('size', newSize);
              const newUrl = urlObj.toString();

              console.log(newUrl);
            }

            const preview = previewAtt?.file.preview ?? null;
            return {
              id: t.id,
              title: t.title,
              preview,
              attachmentsLength: t.attachments.length,
            };
          }),
        };
      }),
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
