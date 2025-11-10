import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { TelegramService } from '../../services/telegram.service';

@Catch(HttpException)
export class HttpErrorFilter implements ExceptionFilter {
  private readonly criticalChatIds: string[];
  private readonly environmentLabel: string;

  constructor(private readonly telegramService?: TelegramService) {
    this.criticalChatIds = (
      process.env.TELEGRAM_CRITICAL_CHAT_IDS ?? '317401874'
    )
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    this.environmentLabel = process.env.NODE_ENV ?? 'development';
  }

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<
      Request & { user?: { id?: string | number; fullName?: string } }
    >();
    const res = ctx.getResponse<Response>();

    const status = exception.getStatus();
    const payload = exception.getResponse();

    // Извлекаем человекочитаемый title и detail
    let title = (HttpStatus[status] as string | undefined) || 'Error';
    if (typeof title === 'string') title = title.replace(/_/g, ' ');
    let detail: string | undefined;

    if (typeof payload === 'string') {
      detail = payload;
    } else if (typeof payload === 'object' && payload) {
      const p = payload as Record<string, unknown>;
      // class-validator обычно кладёт массив сообщений в message
      const message = p.message;
      if (Array.isArray(message)) detail = message.join('; ');
      else if (typeof message === 'string') detail = message;
      const error = p.error;
      if (typeof error === 'string') title = error;
    }

    // Информация о пользователе
    const userId = req.user?.id ?? null;
    const userFullName = req.user?.fullName ?? null;

    // IP для логов
    const clientIp = req.ip || req.socket?.remoteAddress || undefined;

    // Лог (можно заменить на Winston)
    console.error(
      'Ошибка запроса:',
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          path: req.url,
          method: req.method,
          status,
          clientIp,
          userId,
          userFullName,
          error: payload,
        },
        null,
        2,
      ),
    );

    // Унифицированное тело + обратная совместимость со старыми полями
    const body = {
      // Новый контракт (RFC7807-style, упрощённый)
      status,
      title,
      detail,
      instance: req.originalUrl,
      timestamp: new Date().toISOString(),
      // legacy-поля (чтобы Nuxt-toast не сломался)
      statusCode: status,
      message: detail ?? title,
      path: req.url,
      userId,
      userFullName,
    };

    const payloadObject =
      typeof payload === 'object' && payload
        ? (payload as Record<string, unknown>)
        : null;

    if (
      status >= HttpStatus.INTERNAL_SERVER_ERROR &&
      this.telegramService &&
      this.criticalChatIds.length
    ) {
      const detailText = detail ?? title;
      const stack =
        typeof exception.stack === 'string' ? exception.stack : undefined;
      void this.notifyCriticalError({
        status,
        title,
        detail: detailText,
        instance: req.originalUrl,
        method: req.method,
        clientIp,
        userId,
        userFullName,
        stack,
        payload: payloadObject ?? undefined,
      });
    }

    return res.status(status).json(body);
  }

  private async notifyCriticalError(params: {
    status: number;
    title: string;
    detail?: string;
    instance: string;
    method: string;
    clientIp?: string;
    userId: string | number | null;
    userFullName: string | null;
    stack?: string;
    payload?: Record<string, unknown>;
  }) {
    const telegramService = this.telegramService;
    if (!telegramService || !this.criticalChatIds.length) {
      return;
    }

    const {
      status,
      title,
      detail,
      instance,
      method,
      clientIp,
      userId,
      userFullName,
      stack,
      payload,
    } = params;

    const header = `❗️ Критическая ошибка (${status})`;
    const lines = [
      `<b>${this.escapeHtml(header)}</b>`,
      `Env: ${this.escapeHtml(this.environmentLabel)}`,
      `Route: ${this.escapeHtml(method)} ${this.escapeHtml(instance)}`,
      `Title: ${this.escapeHtml(title)}`,
    ];

    if (detail) {
      lines.push(`Detail: ${this.escapeHtml(detail)}`);
    }
    if (clientIp) {
      lines.push(`IP: ${this.escapeHtml(clientIp)}`);
    }
    if (userId !== null || userFullName) {
      lines.push(
        `User: ${this.escapeHtml(
          [userId ?? 'n/a', userFullName ?? ''].filter(Boolean).join(' · '),
        )}`,
      );
    }
    if (stack) {
      const trimmedStack =
        stack.length > 1200 ? `${stack.slice(0, 1200)}…` : stack;
      lines.push('');
      lines.push(`<code>${this.escapeHtml(trimmedStack)}</code>`);
    }

    const upstreamStatus = payload?.upstreamStatus;
    const upstreamStatusText = payload?.upstreamStatusText;
    const upstreamBody = payload?.upstreamBody;
    if (upstreamStatus !== undefined || upstreamStatusText !== undefined) {
      lines.push('');
      lines.push(
        `Upstream: ${this.escapeHtml(
          [
            upstreamStatus !== undefined ? String(upstreamStatus) : null,
            upstreamStatusText !== undefined
              ? String(upstreamStatusText)
              : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'n/a',
        )}`,
      );
    }
    if (typeof upstreamBody === 'string' && upstreamBody.length) {
      const snippet =
        upstreamBody.length > 1200
          ? `${upstreamBody.slice(0, 1200)}…`
          : upstreamBody;
      lines.push('');
      lines.push(`<code>${this.escapeHtml(snippet)}</code>`);
    }

    const message = lines.join('\n');

    await Promise.all(
      this.criticalChatIds.map((chatId) =>
        telegramService
          .sendToChat(chatId, message, true)
          .catch((error) =>
            console.error(
              `Не удалось отправить оповещение в Telegram (${chatId}): ${
                error?.message ?? error
              }`,
            ),
          ),
      ),
    );
  }

  private escapeHtml(input: string): string {
    return input.replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char as '&' | '<' | '>' | '"' | "'"] as string,
    );
  }
}
