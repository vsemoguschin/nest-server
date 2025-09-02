import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { TaskFilesService } from 'src/services/boards/task-files.service';
import { TaskAuditService } from 'src/services/boards/task-audit.service';

@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService, TaskFilesService, TaskAuditService],
})
export class AttachmentsModule {}
