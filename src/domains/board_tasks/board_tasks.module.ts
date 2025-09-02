import { Module } from '@nestjs/common';
import { TasksController } from './board_tasks.controller';
import { TasksService } from './board_tasks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KanbanFilesModule } from '../kanban-files/kanban-files.module';
import { TelegramService } from 'src/services/telegram.service';
import { TaskNotifyService } from 'src/services/task-notify.service';
import { TaskAuditService } from 'src/services/boards/task-audit.service';
import { TaskCommentsService } from 'src/services/boards/task-comments.service';
import { TaskFilesService } from 'src/services/boards/task-files.service';
import { AttachmentsService } from '../kanban/attachments/attachments.service';
import { TaskMembersService } from '../kanban/members/members.service';

@Module({
  imports: [KanbanFilesModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    PrismaService,
    TelegramService,
    TaskNotifyService,
    AttachmentsService,
    TaskAuditService,
    TaskMembersService,
    TaskCommentsService,
    TaskFilesService,
  ],
  exports: [TasksService],
})
export class TasksModule {}
