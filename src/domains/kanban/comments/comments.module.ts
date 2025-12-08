import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { TaskFilesService } from 'src/services/boards/task-files.service';
import { TaskAuditService } from 'src/services/boards/task-audit.service';
import { TelegramService } from 'src/services/telegram.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CommentsController],
  providers: [
    CommentsService,
    TaskFilesService,
    TaskAuditService,
    TelegramService,
  ],
})
export class CommentsModule {}
