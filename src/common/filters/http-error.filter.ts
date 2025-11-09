import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpErrorFilter implements ExceptionFilter {
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

    return res.status(status).json(body);
  }
}
