import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { winstonLogger } from './logger';
import { ValidationPipe } from '@nestjs/common';
import { HttpErrorFilter } from './common/filters/http-error.filter';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as dotenv from 'dotenv';
import multer from 'multer';
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: winstonLogger,
  });

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
  app.use((req, res, next) => {
    const allowedPaths = ['/api', '/api-docs', '/swagger', '/health'];
    const isAllowed = allowedPaths.some(p => req.path.startsWith(p));
  
    if (isAllowed) {
      return next(); // разрешаем нормальные пути
    }
  
    const suspiciousPatterns = [
      'wget', 'curl', 'chmod', 'shell', 'sh', 'ftp', '.asp', '.php', '.pl', '.cgi',
      '/device.rsp', '/boaform', '/hudson', '/pdown', 'cmd=', 'eval(', 'base64,',
      '/favicon.ico', '/t4', '/teorema', '/actuator', '/admin', '/env', '/debug'
    ];
  
    const combined = `${req.originalUrl} ${req.method} ${req.headers['user-agent'] || ''}`.toLowerCase();
  
    if (suspiciousPatterns.some(p => combined.includes(p))) {
      const ip = req.ip;
      console.warn(`❌ Заблокирован подозрительный запрос от ${ip} → ${req.originalUrl}`);
      return res.status(403).send('Forbidden');
    }
  
    next();
  });
  

  await app.listen(5000, '127.0.0.1');
}
bootstrap();
