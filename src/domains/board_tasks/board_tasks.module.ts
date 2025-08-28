import { Module } from '@nestjs/common';
import { TasksController } from './board_tasks.controller';
import { TasksService } from './board_tasks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KanbanFilesModule } from '../kanban-files/kanban-files.module';
import { TelegramService } from 'src/services/telegram.service';
import { TaskNotifyService } from 'src/services/task-notify.service';

@Module({
  imports: [KanbanFilesModule],
  controllers: [TasksController],
  providers: [TasksService, PrismaService, TelegramService, TaskNotifyService],
  exports: [TasksService],
})
export class TasksModule {}
