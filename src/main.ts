import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { winstonLogger } from './logger';
import { ValidationPipe } from '@nestjs/common';
import { HttpErrorFilter } from './common/filters/http-error.filter';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as dotenv from 'dotenv';
import * as express from 'express';
import { join } from 'path';
import multer from 'multer';
import { getSchemaPath, ApiExtraModels } from '@nestjs/swagger';
import { ErrorResponse } from './common/errors/error.response';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // logger: winstonLogger,
    // bufferLogs: true
  });

  // app.useLogger(winstonLogger);
  app.set('trust proxy', true);

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://easy-crm.pro',
      'https://easy-crm.pro',
      'https://front.easy-crm.pro',
    ], // Разрешаем доступ с localhost:3001
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Разрешаем HTTP-методы
    credentials: true, // Разрешаем передачу cookies и аутентификационных данных
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    exposedHeaders: ['Content-Length', 'ETag'],
  });

  app.setGlobalPrefix('vsemo');

  // Устанавливаем глобальный guard для проверки JWT
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // удаляет неописанные поля
      // forbidNonWhitelisted: true, // выбрасывает ошибку, если есть неописанные поля
      transform: true, // преобразует входящие данные в нужный тип (например, строки -> числа)
    }),
  );

  app.useGlobalFilters(new HttpErrorFilter());

  // Настройка Swagger
  const config = new DocumentBuilder()
    .setTitle('CRM API')
    .setDescription('Документация API CRM-системы')
    .setVersion('1.0')
    .addTag('crm')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorResponse],
  });
  SwaggerModule.setup('api-docs', app, document);

  const httpAdapter = app.getHttpAdapter();

  httpAdapter.get('/api-json', (req, res) => {
    // универсальная отправка ответа (Nest сам выставит JSON)
    httpAdapter.reply(res, document, 200);
  });

  app.use(express.static(join(__dirname, '..', 'public'))); // отдаст /favicon.ico

  // (BigInt.prototype as any).toJSON = function () {
  //   return this.toString(); // Преобразуем BigInt в строку
  // };
  app.use((req, res, next) => {
    const allowedPaths = ['/vsemo'];
    const isAllowed = allowedPaths.some((p) => req.path.startsWith(p));

    if (isAllowed) {
      return next(); // разрешаем служебные и API-запросы
    }

    const suspiciousPatterns = [
      'wget',
      'curl',
      'chmod',
      'shell',
      'sh',
      'ftp',
      '.asp',
      '.php',
      '.pl',
      '.cgi',
      '/device.rsp',
      '/boaform',
      '/hudson',
      '/pdown',
      'cmd=',
      'eval(',
      'base64,',
    ];

    const combined =
      `${req.originalUrl} ${req.method} ${req.headers['user-agent'] || ''}`.toLowerCase();

    if (suspiciousPatterns.some((p) => combined.includes(p))) {
      console.warn(
        `❌ Заблокирован подозрительный запрос: ${req.ip} → ${req.originalUrl}`,
      );
      return res.status(403).send('Forbidden');
    }

    next();
  });

  await app.listen(5000, '127.0.0.1');
}
bootstrap();
