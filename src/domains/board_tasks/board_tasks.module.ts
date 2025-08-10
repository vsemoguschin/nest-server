import { Module } from '@nestjs/common';
import { TasksController } from './board_tasks.controller';
import { TasksService } from './board_tasks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KanbanFilesModule } from '../kanban-files/kanban-files.module';

@Module({
  imports: [KanbanFilesModule],
  controllers: [TasksController],
  providers: [TasksService, PrismaService],
  exports: [TasksService],
})
export class TasksModule {}
