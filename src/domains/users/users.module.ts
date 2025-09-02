import { Module } from '@nestjs/common';
import { UsersController } from './users.controller'; // Если нужен REST-контроллер
import { UsersService } from './users.service';
import { UsersResolver } from './users.resolver'; // Для GraphQL-запросов
import { PrismaModule } from '../../prisma/prisma.module';
import { TelegramService } from 'src/services/telegram.service';
import { TaskFilesService } from 'src/services/boards/task-files.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController], // Если вы хотите поддерживать и REST-эндпоинты, и GraphQL
  providers: [UsersService, UsersResolver, TelegramService, TaskFilesService],
  exports: [UsersService],
})
export class UsersModule {}
