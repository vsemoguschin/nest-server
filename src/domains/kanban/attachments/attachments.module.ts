import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { TaskFilesService } from 'src/services/boards/task-files.service';
import { TaskAuditService } from 'src/services/boards/task-audit.service';
import { TelegramService } from 'src/services/telegram.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    TaskFilesService,
    TaskAuditService,
    TelegramService,
  ],
})
export class AttachmentsModule {}
