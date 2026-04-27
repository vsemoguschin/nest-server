import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
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
  ],
  exports: [BoardsService],
})
export class BoardsModule {}
