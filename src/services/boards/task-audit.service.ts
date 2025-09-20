import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

type JsonInput = Prisma.InputJsonValue;

type Action =
  | 'UPDATE_TASK'
  | 'MOVE_TASK'
  | 'UPDATE_TAGS'
  | 'ADD_ATTACHMENTS'
  | 'DEL_ATTACHMENTS'
  | 'ADD_MEMBER'
  | 'DEL_MEMBER'
  | 'MOVE_TO_BOARD'
  | 'TASK_CREATED';

export type AuditLogParams = {
  userId: number;
  taskId: number;
  action: Action; // например: 'CREATE', 'UPDATE_TITLE', 'MOVE', 'ADD_MEMBER'
  payload?: JsonInput; // любые сериализуемые JSON-данные
  description?: string | null;
  tx?: Prisma.TransactionClient; // опционально — если пишешь в транзакции
};

@Injectable()
export class TaskAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Базовая запись события аудита.
   * Можно передать tx для атомарной записи вместе с основной операцией.
   */
  async log(params: AuditLogParams) {
    const { userId, taskId, action, payload, description, tx } = params;
    const db = tx ?? this.prisma;

    return db.kanbanTaskAudit.create({
      data: {
        userId,
        taskId,
        action,
        payload: payload ?? {},
        description: description ?? null,
      },
      select: {
        id: true,
        createdAt: true,
        action: true,
        description: true,
        payload: true,
        user: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  /**Получить историю изменений у задачи */
  async getTaskAudit(taskId: number) {
    // опционально проверим, что задача существует и не удалена

    return this.prisma.kanbanTaskAudit.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        action: true,
        description: true,
        payload: true,
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
  }
}
