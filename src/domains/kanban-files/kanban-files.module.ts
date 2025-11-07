import { Module } from '@nestjs/common';
import { KanbanFilesController } from './kanban-files.controller';
import { KanbanFilesService } from './kanban-files.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FilesModule } from '../files/files.module';
import { YandexDiskModule } from 'src/integrations/yandex-disk/yandex-disk.module';

@Module({
  imports: [FilesModule, YandexDiskModule],
  controllers: [KanbanFilesController],
  providers: [KanbanFilesService, PrismaService],
  exports: [KanbanFilesService],
})
export class KanbanFilesModule {}
