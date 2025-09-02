// src/notifications/task-notify.service.ts
import { Injectable } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { PrismaService } from 'src/prisma/prisma.service';

type NotifyOpts = {
  taskId: number;
  actorUserId: number; // инициатор изменения
  message: string; // человекочитаемый текст (без ссылки)
  link?: string; // ссылка на задачу (опционально)
  silent?: boolean; // тихие уведомления у Telegram
  includeNewMemberId?: number; // спец-случай, когда только что добавлен новый участник — можно отдельно упомянуть его
};

@Injectable()
export class TaskNotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  /** Построить ссылку на задачу (можно вынести в конфиг) */
  private buildTaskUrl(boardId: number, taskId: number) {
    const base = 'https://easy-crm.pro';
    return `${base}/boards/${boardId}/task/${taskId}`;
  }

  /**
   * Уведомить всех участников задачи, кроме инициатора.
   * Если link не передана — подставим дефолтную ссылку.
   */
  async notifyParticipants(opts: NotifyOpts) {
    const { taskId, actorUserId, message, link, silent = false } = opts;

    const task = await this.prisma.kanbanTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        boardId: true,
        members: { select: { id: true, fullName: true, tg_id: true } },
      },
    });
    if (!task) return;

    const url = link || this.buildTaskUrl(task.boardId, taskId);

    // имя инициатора (для текста)
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { fullName: true },
    });

    const text =
      `<b>${task.title || 'Задача'}</b>\n` +
      (actor?.fullName ? `${actor.fullName}\n` : '') +
      `${message}\n` +
      `<a href="${url}">Открыть карточку</a>`;

    // все участники с tg_id, кроме инициатора
    // const targets = task.members.filter(
    //   (u) => u.id !== actorUserId && typeof u.tg_id === 'number' && u.tg_id > 0,
    // );

    await Promise.allSettled(
      task.members.map((u) => this.telegram.sendToChat(u.tg_id!, text, silent)),
    );
  }

  /**
   * Отдельное приветствие конкретному (новому) участнику:
   * использовать при добавлении участника к задаче.
   */
  async notifyNewMember(
    taskId: number,
    memberUserId: number,
    actorUserId: number,
  ) {
    const task = await this.prisma.kanbanTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        boardId: true,
      },
    });
    if (!task) return;

    const url = this.buildTaskUrl(task.boardId, taskId);

    const [actor, member] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { fullName: true },
      }),
      this.prisma.user.findUnique({
        where: { id: memberUserId },
        select: { fullName: true, tg_id: true },
      }),
    ]);

    if (!member?.tg_id) return;

    const text =
      `🗂 <b>${task.title || 'Задача'}</b>\n` +
      `👋 Вас добавил(а) ${actor?.fullName || 'пользователь'}\n` +
      `🔗 <a href="${url}">Открыть задачу</a>`;

    await this.telegram.sendToChat(member.tg_id, text);
  }

  
}
