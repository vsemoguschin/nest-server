import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Logger } from 'winston';
import { Inject } from '@nestjs/common';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(@Inject('winston') private readonly logger: Logger) {}

  use(req: Request, res: Response, next: NextFunction) {
    const clientIp = req.ip || req.connection.remoteAddress;
    const method = req.method;
    const url = req.url;
    const userAgent = req.headers['user-agent'] || 'unknown';
    const referer = req.headers['referer'] || 'unknown';
    const xForwardedFor = req.headers['x-forwarded-for'] || 'none';

    const logData = {
      timestamp: new Date().toISOString(),
      clientIp,
      xForwardedFor,
      method,
      url,
      userAgent,
      referer,
    };

    this.logger.info('Incoming request:', logData);

    next();
  }
}
