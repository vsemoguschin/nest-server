// src/notifications/telegram.service.ts
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

type NotifyParams = {
  userId: number; // кому отправляем
  taskId: number; // какую задачу подсветить
  text: string; // текст уведомления
  link?: string; // можно передать готовую ссылку (иначе соберём)
  buttonText?: string; // текст кнопки (по умолчанию "Открыть задачу")
};

@Injectable()
export class TelegramService {
  private readonly token = process.env.TELEGRAM_BOT_TOKEN as string;
  private readonly apiBase = this.token
    ? `https://api.telegram.org/bot${this.token}`
    : '';
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Отправить уведомление пользователю по его tg_id */
  async notifyUserAboutTask(params: NotifyParams) {
    if (!this.token) {
      throw new BadRequestException('TELEGRAM_BOT_TOKEN is not set');
    }

    const { userId, taskId, text, buttonText = 'Открыть задачу' } = params;

    // 1) берём tg_id пользователя
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, tg_id: true, fullName: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.tg_id || user.tg_id === 0) {
      throw new BadRequestException('User has no Telegram chat id (tg_id)');
    }

    // 2) берём задачу (для заголовка и boardId)
    const task = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, title: true, boardId: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    // 3) строим ссылку
    const url = params.link ?? this.buildTaskLink(task.boardId, task.id);

    // 4) текст — в HTML, плюс инлайн-кнопка со ссылкой
    const html = `${this.escapeHtml(text)}<br/><b>Задача:</b> ${this.escapeHtml(task.title)}`;

    await this.call('sendMessage', {
      chat_id: user.tg_id, // numeric chat id
      text: html,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: buttonText, url }]],
      },
      disable_web_page_preview: true,
    });

    return { ok: true };
  }

  /** Вспомогательное: универсальный POST к Telegram Bot API */
  private async call(method: string, body: any) {
    const { data } = await axios.post(`${this.apiBase}/${method}`, body, {
      timeout: 10_000,
      // можно прокинуть proxy/httpsAgent при необходимости
    });
    if (!data?.ok) {
      // Telegram возвращает ok=false и описание в description
      throw new BadRequestException(data?.description || 'Telegram API error');
    }
    return data;
  }

  /** Сборка ссылки на задачу (под ваш фронт) */
  private buildTaskLink(boardId: number, taskId: number) {
    // подставьте свою реальную схему URL
    const base =
      process.env.APP_BASE_URL?.replace(/\/+$/, '') || 'https://example.com';
    // варианты:
    // 1) страница доски + модалка через query (?task=)
    // return `${base}/boards/${boardId}?task=${taskId}`;
    // 2) ЧПУ /boards/:id/task/:taskId
    return `${base}/boards/${boardId}/task/${taskId}`;
  }

  private escapeHtml(s: string) {
    return s.replace(
      /[&<>"']/g,
      (ch) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[ch as '&' | '<' | '>' | '"' | "'"] as string,
    );
  }

  async sendToChat(chatId: number, text: string, disableNotification = false) {
    try {
      await axios.post(`${this.apiBase}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_notification: disableNotification,
        // при желании: reply_markup, disable_web_page_preview и т.д.
      });
    } catch (e: any) {
      this.logger.warn(
        `TG send failed chat=${chatId}: ${e?.response?.data?.description || e?.message}`,
      );
    }
  }
}
