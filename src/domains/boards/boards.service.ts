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

  async getKanban(
    userId: number,
    boardId: number,
    opts?: { tasksLimit?: number; withCovers?: boolean; coverSize?: string },
  ) {
    // доступ к доске + выдача колонок и задач (без вложений для лёгкости)
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, deletedAt: null, users: { some: { id: userId } } },
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
              take: opts?.tasksLimit ?? undefined,
              select: {
                id: true,
                title: true,
                description: true,
                position: true,
                tags: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!board) throw new NotFoundException('Board not found or access denied');

    if (!opts?.withCovers) return board; // как раньше

    // Если нужны coverUrl — найдём для каждой задачи последний image-аттач
    const coverSize = (opts.coverSize || 'M').toUpperCase();

    // соберём все taskIds
    const tasksFlat = board.columns.flatMap((c) => c.tasks);
    const taskIds = tasksFlat.map((t) => t.id);
    if (!taskIds.length) return board;

    // найдём последние image-вложения по каждой задаче
    const lastImages = await this.prisma.kanbanTaskAttachment.groupBy({
      by: ['taskId'],
      where: {
        taskId: { in: taskIds },
        file: { mimeType: { startsWith: 'image/' } },
      },
      _max: { createdAt: true },
    });

    // сопоставим (taskId, createdAt) → возьмём attachment с этим createdAt и подтащим file.path
    const coversRaw = await this.prisma.kanbanTaskAttachment.findMany({
      where: {
        OR: lastImages.map((li) => ({
          taskId: li.taskId,
          createdAt: li._max.createdAt!,
        })),
      },
      select: {
        taskId: true,
        file: { select: { path: true } },
      },
    });

    const coverMap = new Map<number, string>(); // taskId -> file.path
    for (const c of coversRaw) {
      if (c.file?.path) coverMap.set(c.taskId, c.file.path);
    }

    // Получим url нужного размера на Я.Диске
    const urls = await Promise.all(
      tasksFlat.map(async (t) => {
        const filePath = coverMap.get(t.id);
        if (!filePath) return { taskId: t.id, url: null as string | null };
        try {
          const url = await this.files.getPreviewSizeUrl(filePath, coverSize);
          return { taskId: t.id, url: url };
        } catch {
          return { taskId: t.id, url: null };
        }
      }),
    );
    const urlByTask = new Map(urls.map((x) => [x.taskId, x.url]));

    // Впишем coverUrl в результат
    for (const col of board.columns) {
      col.tasks = col.tasks.map(
        (t) =>
          ({
            ...t,
            coverUrl: urlByTask.get(t.id) || null,
          }) as any,
      );
    }

    return board;
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
    console.log(list);
    return list;
  }

  async getById(userId: number, boardId: number) {
    const board = await this.prisma.board.findFirst({
      where: {
        id: boardId,
        deletedAt: null,
        users: { some: { id: userId } },
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
