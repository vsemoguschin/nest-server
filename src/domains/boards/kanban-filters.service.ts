import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserDto } from '../users/dto/user.dto';
import { collectTaskWarnings } from '../board_tasks/utils/task-warnings';

@Injectable()
export class KanbanFiltersService {
  constructor(private readonly prisma: PrismaService) {}

  async getKanbanFilters(
    user: UserDto,
    boardId: number,
    hiddenIds: number[] = [],
    visibleMemberIds?: number[],
  ) {
    const userId = user.id;
    const columnsWhere: { deletedAt: null; id?: { notIn: number[] } } = {
      deletedAt: null,
    };
    const tasksWhere: any = { deletedAt: null, archived: false };
    if (hiddenIds.length) {
      columnsWhere.id = { notIn: hiddenIds };
    }
    if (visibleMemberIds !== undefined) {
      tasksWhere.members = { some: { id: { in: visibleMemberIds } } };
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
        tags: {
          select: {
            name: true,
          },
        },
        columns: {
          where: columnsWhere,
          select: {
            tasks: {
              where: tasksWhere,
              select: {
                chatLink: true,
                deal: {
                  select: {
                    price: true,
                    deliveries: {
                      select: {
                        method: true,
                        type: true,
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
                orders: {
                  select: {
                    material: true,
                    boardHeight: true,
                    boardWidth: true,
                    type: true,
                    holeType: true,
                    fitting: true,
                    laminate: true,
                    isAcrylic: true,
                    dimmer: true,
                    docs: true,
                    print: true,
                    neons: { select: { color: true, width: true } },
                    lightings: { select: { color: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!board) {
      throw new NotFoundException('Board not found or access denied');
    }

    const warningsSet = new Set<string>();

    for (const column of board.columns) {
      for (const task of column.tasks) {
        let remainder: number | null = null;
        if (task.deal) {
          const dopsPrice = (task.deal.dops ?? []).reduce(
            (acc, dop) => acc + Number(dop.price ?? 0),
            0,
          );
          const totalPrice = Number(task.deal.price ?? 0) + dopsPrice;
          remainder =
            totalPrice -
            (task.deal.payments ?? []).reduce(
              (acc, payment) => acc + Number(payment.price ?? 0),
              0,
            );
        }

        const taskWarnings = collectTaskWarnings(
          task.orders,
          task.deal?.deliveries ?? [],
          task.chatLink,
          task.deal?.payments,
          remainder,
        );

        for (const warning of taskWarnings) {
          warningsSet.add(warning);
        }
      }
    }

    return {
      tags: board.tags.map((tag) => tag.name),
      warnings: Array.from(warningsSet).sort((a, b) => a.localeCompare(b)),
    };
  }
}
