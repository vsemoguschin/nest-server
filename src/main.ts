import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { winstonLogger } from './logger';
import { ValidationPipe } from '@nestjs/common';
import { HttpErrorFilter } from './common/filters/http-error.filter';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import * as dotenv from 'dotenv';
import multer from 'multer';
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: winstonLogger,
  });

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://easy-crm.pro',
      'https://easy-crm.pro',
      'https://front.easy-crm.pro',
    ], // Разрешаем доступ с localhost:3001
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Разрешаем HTTP-методы
    allowedHeaders: 'Content-Type, Authorization', // Разрешаем заголовки
    credentials: true, // Разрешаем передачу cookies и аутентификационных данных
  });

  app.setGlobalPrefix('api');

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
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  // (BigInt.prototype as any).toJSON = function () {
  //   return this.toString(); // Преобразуем BigInt в строку
  // };

  await app.listen(5000);
}
bootstrap();
