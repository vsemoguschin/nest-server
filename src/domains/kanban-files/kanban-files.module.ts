import { Module } from '@nestjs/common';
import { KanbanFilesController } from './kanban-files.controller';
import { KanbanFilesService } from './kanban-files.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [KanbanFilesController],
  providers: [KanbanFilesService, PrismaService],
  exports: [KanbanFilesService],
})
export class KanbanFilesModule {}
