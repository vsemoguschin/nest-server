import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Проверяем доступ к доске — пользователь должен быть участником */
  private async assertBoardAccess(userId: number, boardId: number) {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, deletedAt: null, users: { some: { id: userId } } },
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

  async create(
    userId: number,
    boardId: number,
    columnId: number,
    dto: CreateTaskDto,
  ) {
    await this.assertBoardAccess(userId, boardId);

    // убеждаемся, что колонка принадлежит этой доске и не удалена
    const column = await this.prisma.column.findFirst({
      where: { id: columnId, boardId, deletedAt: null },
      select: { id: true },
    });
    if (!column) throw new NotFoundException('Column not found');

    const position =
      dto.position ?? (await this.nextPosition(boardId, columnId));

    // подготовка связей
    const connectMembers = dto.memberIds?.length
      ? dto.memberIds.map((id) => ({ id }))
      : [];

    const createTags = dto.tags?.length
      ? dto.tags.map((name) => ({ name }))
      : [];

    const task = await this.prisma.kanbanTask.create({
      data: {
        title: dto.title,
        description: dto.description ?? '',
        position,
        boardId,
        columnId,
        creatorId: userId,
        ...(connectMembers.length
          ? { members: { connect: connectMembers } }
          : {}),
        ...(createTags.length ? { tags: { create: createTags } } : {}),
      },
      include: {
        tags: true,
        members: { select: { id: true, email: true, fullName: true } },
        _count: { select: { comments: true, attachments: true } },
      },
    });

    return task;
  }

  async getOne(
    userId: number,
    boardId: number,
    columnId: number,
    taskId: number,
  ) {
    await this.assertBoardAccess(userId, boardId);

    // убеждаемся что колонка принадлежит доске
    const column = await this.prisma.column.findFirst({
      where: { id: columnId, boardId, deletedAt: null },
      select: { id: true },
    });
    if (!column) throw new NotFoundException('Column not found');

    const task = await this.prisma.kanbanTask.findFirst({
      where: {
        id: taskId,
        boardId,
        columnId,
        deletedAt: null,
      },
      include: {
        tags: { select: { id: true, name: true } },
        members: { select: { id: true, email: true, fullName: true } },

        attachments: {
          include: {
            file: {
              select: {
                id: true,
                name: true,
                path: true,
                preview: true,
                mimeType: true,
                size: true,
                ya_name: true,
                directory: true,
                createdAt: true,
              },
            },
          },
        },
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
    return task;
  }

  async update(
    userId: number,
    boardId: number,
    columnId: number,
    taskId: number,
    dto: UpdateTaskDto,
  ) {
    await this.assertBoardAccess(userId, boardId);

    const exists = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, boardId, columnId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Task not found');

    return this.prisma.kanbanTask.update({
      where: { id: taskId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
      },
      select: { id: true, title: true, description: true, updatedAt: true },
    });
  }

  async remove(
    userId: number,
    boardId: number,
    columnId: number,
    taskId: number,
  ) {
    await this.assertBoardAccess(userId, boardId);

    const exists = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, boardId, columnId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Task not found');

    await this.prisma.kanbanTask.update({
      where: { id: taskId },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }
}
