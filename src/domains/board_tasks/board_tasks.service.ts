import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

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
    console.log(dto);
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

    const createTags = dto.tags?.length
      ? dto.tags.map((name) => ({ name }))
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

  async getOne(userId: number, taskId: number) {
    const task = await this.prisma.kanbanTask.findFirst({
      where: {
        id: taskId,
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
    await this.assertBoardAccess(userId, task.boardId);
    return task;
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
}
