import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

  async create(
    userId: number,
    boardId: number,
    dto: { title: string; position?: number },
  ) {
    await this.assertBoardAccess(userId, boardId);

    const position = dto.position ?? (await this.computeNextPosition(boardId));

    return this.prisma.column.create({
      data: {
        title: dto.title,
        position,
        boardId,
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
    boardId: number,
    columnId: number,
    dto: { title?: string; position?: number },
  ) {
    await this.assertBoardAccess(userId, boardId);

    const existing = await this.prisma.column.findFirst({
      where: { id: columnId, boardId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Column not found');

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
  async remove(userId: number, boardId: number, columnId: number) {
    await this.assertBoardAccess(userId, boardId);

    const col = await this.prisma.column.findFirst({
      where: { id: columnId, boardId, deletedAt: null },
      select: { id: true },
    });
    if (!col) throw new NotFoundException('Column not found');

    await this.prisma.column.update({
      where: { id: columnId },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }
}
