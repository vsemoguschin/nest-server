import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserDto } from '../users/dto/user.dto';
import { buildKanbanColumn, kanbanTaskSelect } from './kanban-column.shared';

@Injectable()
export class KanbanColumnsService {
  constructor(private readonly prisma: PrismaService) {}

  async getKanbanColumns(
    user: UserDto,
    boardId: number,
    hiddenIds: number[] = [],
    visibleMemberIds?: number[],
  ) {
    const userId = user.id;
    const columnsWhere: { deletedAt: null; id?: { notIn: number[] } } = {
      deletedAt: null,
    };

    if (hiddenIds.length) {
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
        columns: {
          where: columnsWhere,
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            position: true,
          },
        },
      },
    });

    if (!board) {
      throw new NotFoundException('Board not found or access denied');
    }

    const columnIds = board.columns.map((column) => column.id);
    const taskCounts = columnIds.length
      ? await this.prisma.kanbanTask.groupBy({
          by: ['columnId'],
          where: {
            boardId,
            columnId: { in: columnIds },
            deletedAt: null,
            archived: false,
            ...(visibleMemberIds !== undefined
              ? {
                  members: {
                    some: { id: { in: visibleMemberIds } },
                  },
                }
              : {}),
          },
          _count: { _all: true },
        })
      : [];
    const totalByColumnId = new Map(
      taskCounts.map((item) => [Number(item.columnId), Number(item._count._all)]),
    );

    return board.columns.map((column) => ({
      id: column.id,
      title: column.title,
      position: column.position,
      tasksTotal: totalByColumnId.get(Number(column.id)) ?? 0,
    }));
  }

  async getKanbanColumn(
    user: UserDto,
    boardId: number,
    columnId: number,
    visibleMemberIds?: number[],
    page?: { cursor?: number; limit?: number },
  ) {
    const userId = user.id;
    const tasksWhere: any = { deletedAt: null, archived: false };

    if (visibleMemberIds !== undefined) {
      tasksWhere.members = { some: { id: { in: visibleMemberIds } } };
    }

    const column = await this.prisma.column.findFirst({
      where: {
        id: columnId,
        boardId,
        deletedAt: null,
        board: {
          deletedAt: null,
          users: {
            some: ['ADMIN'].includes(user?.role.shortName)
              ? { id: { gt: 0 } }
              : { id: userId },
          },
        },
      },
      select: {
        id: true,
        title: true,
        position: true,
        tasks: {
          where: tasksWhere,
          orderBy: { position: 'asc' },
          select: kanbanTaskSelect,
        },
      },
    });

    if (!column) {
      throw new NotFoundException('Column not found or access denied');
    }

    const tasksTotal = await this.prisma.kanbanTask.count({
      where: {
        boardId,
        columnId,
        deletedAt: null,
        archived: false,
        ...(visibleMemberIds !== undefined
          ? {
              members: {
                some: { id: { in: visibleMemberIds } },
              },
            }
          : {}),
      },
    });

    return buildKanbanColumn(column, {
      tasksTotal,
      cursor: page?.cursor,
      limit: page?.limit,
    });
  }
}
