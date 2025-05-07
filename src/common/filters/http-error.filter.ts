import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const errorResponse = exception.getResponse();

    // Извлекаем IP-адрес клиента
    const clientIp = request.ip || request.connection.remoteAddress;

    const logError = {
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      status,
      clientIp, // Добавляем IP в объект для логов
      error: errorResponse,
    };

    // Логируем ошибку в консоль
    console.error('Ошибка запроса:', JSON.stringify(logError, null, 2));

    // Ответ клиенту (без IP)
    response.status(status).json({
      statusCode: status,
      timestamp: logError.timestamp,
      path: request.url,
      message: errorResponse,
    });
  }
}
