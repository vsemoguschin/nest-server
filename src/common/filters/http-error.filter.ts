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
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const status = exception.getStatus();
    const payload = exception.getResponse();

    // Извлекаем человекочитаемый title и detail
    let title = (HttpStatus as any)[status] || 'Error';
    if (typeof title === 'string') title = title.replace(/_/g, ' ');
    let detail: string | undefined;

    if (typeof payload === 'string') {
      detail = payload;
    } else if (typeof payload === 'object' && payload) {
      const p: any = payload;
      // class-validator обычно кладёт массив сообщений в message
      if (Array.isArray(p.message)) detail = p.message.join('; ');
      else if (typeof p.message === 'string') detail = p.message;
      if (typeof p.error === 'string') title = p.error;
    }

    // IP для логов
    const clientIp =
      req.ip || (req.connection as any)?.remoteAddress || undefined;

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
    };

    return res.status(status).json(body);
  }
}
