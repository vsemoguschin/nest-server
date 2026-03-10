import { Prisma } from '@prisma/client';
import { collectTaskWarnings } from '../board_tasks/utils/task-warnings';

export const kanbanTaskSelect = Prisma.validator<Prisma.KanbanTaskSelect>()({
  id: true,
  title: true,
  columnId: true,
  cover: true,
  boardId: true,
  chatLink: true,
  deal: {
    select: {
      price: true,
      deliveries: {
        select: {
          method: true,
          type: true,
          track: true,
          cdekStatus: true,
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
  tags: { select: { name: true } },
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
          path: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 1,
  },
  members: {
    select: {
      id: true,
      fullName: true,
      avatarUrl: true,
      role: { select: { fullName: true } },
      tg: true,
    },
  },
  orders: {
    select: {
      deadline: true,
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
});

function buildKanbanTask(task: any) {
  const previewPath = task.attachments[0]?.file.path ?? '';
  let remainder: number | null = null;

  if (task.deal) {
    const dopsPrice = (task.deal.dops ?? []).reduce(
      (acc: number, dop: any) => acc + Number(dop.price ?? 0),
      0,
    );
    const totalPrice = Number(task.deal.price ?? 0) + dopsPrice;
    remainder =
      totalPrice -
      (task.deal.payments ?? []).reduce(
        (acc: number, payment: any) => acc + Number(payment.price ?? 0),
        0,
      );
  }

  const warnings = collectTaskWarnings(
    task.orders,
    task.deal?.deliveries ?? [],
    task.chatLink,
    task.deal?.payments,
    remainder,
  );

  return {
    id: task.id,
    title: task.title,
    preview: task.cover ?? previewPath,
    columnId: task.columnId,
    tags: task.tags.map((tag: any) => tag.name),
    members: task.members,
    boardId: task.boardId,
    deadline: (task.orders ?? []).reduce((max: string, order: any) => {
      const deadline = order?.deadline || '';
      if (!deadline) return max;
      if (!max) return deadline;
      return deadline.localeCompare(max) > 0 ? deadline : max;
    }, ''),
    warnings,
    tracks:
      task.deal?.deliveries.map((delivery: any) => ({
        track: delivery.track,
        cdekStatus: delivery.cdekStatus,
      })) ?? [],
  };
}

export function buildKanbanColumn(
  column: any,
  options: {
    tasksTotal?: number;
    cursor?: number;
    limit?: number;
  } = {},
) {
  const allTasks = (column.tasks ?? [])
    .map((task: any) => buildKanbanTask(task))
    .sort((a: any, b: any) => {
      const aHas = !!a.deadline;
      const bHas = !!b.deadline;
      if (aHas && bHas) return a.deadline.localeCompare(b.deadline);
      if (aHas !== bHas) return aHas ? -1 : 1;
      return 0;
    });
  const tasksTotal =
    typeof options.tasksTotal === 'number' ? options.tasksTotal : allTasks.length;
  const start = Math.max(0, Number(options.cursor ?? 0) || 0);
  const limit =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(1, options.limit)
      : tasksTotal;
  const tasks = allTasks.slice(start, start + limit);
  const loadedCount = start + tasks.length;
  const hasMore = loadedCount < tasksTotal;

  return {
    id: column.id,
    title: column.title,
    position: column.position,
    tasksTotal,
    loadedCount,
    hasMore,
    nextCursor: hasMore ? String(loadedCount) : null,
    tasks,
  };
}
