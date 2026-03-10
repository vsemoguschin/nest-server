import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { KanbanFilesModule } from '../kanban-files/kanban-files.module';
import { KanbanFiltersService } from './kanban-filters.service';
import { KanbanColumnsService } from './kanban-columns.service';

@Module({
  imports: [KanbanFilesModule],
  controllers: [BoardsController],
  providers: [
    BoardsService,
    KanbanFiltersService,
    KanbanColumnsService,
    PrismaService,
  ],
  exports: [BoardsService],
})
export class BoardsModule {}
