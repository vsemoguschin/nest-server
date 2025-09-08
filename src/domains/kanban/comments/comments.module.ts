import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { TaskFilesService } from 'src/services/boards/task-files.service';
import { TaskAuditService } from 'src/services/boards/task-audit.service';

@Module({
  controllers: [CommentsController],
  providers: [CommentsService, TaskFilesService, TaskAuditService]
})
export class CommentsModule {}
