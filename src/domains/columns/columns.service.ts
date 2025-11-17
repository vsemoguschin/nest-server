import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateColumnDto } from './dto/create-column.dto';

@Injectable()
export class ColumnsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Проверяем, что пользователь участник доски */
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

  /** Следующая позиция = max(position)+1 */
  private async computeNextPosition(boardId: number): Promise<number> {
    const last = await this.prisma.column.findFirst({
      where: { boardId, deletedAt: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return last ? Number(last.position) + 1 : 1;
  }

  async listForBoard(userId: number, boardId: number) {
    await this.assertBoardAccess(userId, boardId);

    return this.prisma.column.findMany({
      where: { boardId, deletedAt: null },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        title: true,
        position: true,
        createdAt: true,

        // При желании можно вернуть счётчики задач:
        _count: { select: { tasks: { where: { deletedAt: null } } } },
      },
    });
  }

  async create(userId: number, dto: CreateColumnDto) {
    await this.assertBoardAccess(userId, dto.boardId);

    const position =
      dto.position ?? (await this.computeNextPosition(dto.boardId));

    return this.prisma.column.create({
      data: {
        title: dto.title,
        position,
        boardId: dto.boardId,
      },
      select: {
        id: true,
        title: true,
        position: true,
        boardId: true,
        createdAt: true,
      },
    });
  }

  async update(
    userId: number,
    columnId: number,
    dto: { title?: string; position?: number },
  ) {
    const existing = await this.prisma.column.findFirst({
      where: { id: columnId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!existing) throw new NotFoundException('Column not found');
    await this.assertBoardAccess(userId, existing.boardId);

    return this.prisma.column.update({
      where: { id: columnId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
      },
      select: {
        id: true,
        title: true,
        position: true,
        boardId: true,
        createdAt: true,
      },
    });
  }

  /** Мягкое удаление */
  async remove(userId: number, columnId: number) {
    const col = await this.prisma.column.findFirst({
      where: { id: columnId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!col) throw new NotFoundException('Column not found');
    await this.assertBoardAccess(userId, col.boardId);

    await this.prisma.column.update({
      where: { id: columnId },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  async subscribe(
    userId: number,
    columnId: number,
    noticeType: 'all' | 'only_my' = 'all',
  ) {
    if (noticeType !== 'all' && noticeType !== 'only_my') {
      throw new BadRequestException('noticeType must be "all" or "only_my"');
    }

    const column = await this.prisma.column.findFirst({
      where: { id: columnId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!column) throw new NotFoundException('Column not found');

    await this.assertBoardAccess(userId, column.boardId);

    const existing = await this.prisma.columnSubscription.findUnique({
      where: { userId_columnId: { userId, columnId } },
      select: {
        id: true,
        userId: true,
        columnId: true,
        createdAt: true,
        noticeType: true,
      },
    });

    if (existing) {
      // Обновляем noticeType если он изменился
      if (existing.noticeType !== noticeType) {
        return this.prisma.columnSubscription.update({
          where: { userId_columnId: { userId, columnId } },
          data: { noticeType },
          select: {
            id: true,
            userId: true,
            columnId: true,
            createdAt: true,
            noticeType: true,
          },
        });
      }
      return existing;
    }

    return this.prisma.columnSubscription.create({
      data: { userId, columnId, noticeType },
      select: {
        id: true,
        userId: true,
        columnId: true,
        createdAt: true,
        noticeType: true,
      },
    });
  }

  async updateNoticeType(
    userId: number,
    columnId: number,
    noticeType: 'all' | 'only_my',
  ) {
    if (noticeType !== 'all' && noticeType !== 'only_my') {
      throw new BadRequestException('noticeType must be "all" or "only_my"');
    }

    const column = await this.prisma.column.findFirst({
      where: { id: columnId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!column) throw new NotFoundException('Column not found');

    await this.assertBoardAccess(userId, column.boardId);

    const existing = await this.prisma.columnSubscription.findUnique({
      where: { userId_columnId: { userId, columnId } },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Subscription not found');
    }

    return this.prisma.columnSubscription.update({
      where: { userId_columnId: { userId, columnId } },
      data: { noticeType },
      select: {
        id: true,
        userId: true,
        columnId: true,
        createdAt: true,
        noticeType: true,
      },
    });
  }

  async unsubscribe(userId: number, columnId: number) {
    const column = await this.prisma.column.findFirst({
      where: { id: columnId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!column) throw new NotFoundException('Column not found');

    await this.assertBoardAccess(userId, column.boardId);

    try {
      await this.prisma.columnSubscription.delete({
        where: { userId_columnId: { userId, columnId } },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        return { success: true };
      }
      throw e;
    }

    return { success: true };
  }
}
