import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { TaskFilesService } from 'src/services/boards/task-files.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDto } from 'src/domains/users/dto/user.dto';
import { TaskAuditService } from 'src/services/boards/task-audit.service';

@UseGuards(RolesGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly filesService: TaskFilesService,
    private readonly audit: TaskAuditService,
  ) {}

  @Get('preview')
  // @Redirect(undefined, 302)
  async preview(@Query('path') path: string) {
    // console.log(path);
    // return
    const url = await this.filesService.getPreviewOnly(path);
    if (!url) throw new NotFoundException('No preview');
    return { url, statusCode: 302 }; // динамический редирект
  }

  // Удалить вложение (и файл на диске, если больше нигде не используется)
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Delete(':attachmentId')
  async remove(
    @CurrentUser() user: UserDto,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    const att = await this.attachmentsService.ensureAttachment(attachmentId);
    const stillUsed = await this.attachmentsService.removeFromTask({
      id: att.id,
      fileId: att.fileId,
    });
    if (!stillUsed) {
      await this.filesService.deleteFile({
        filePath: att.file.path,
        fileId: att.fileId,
      });
    }
    await this.audit.log({
      userId: user.id,
      taskId: att.taskId,
      action: 'DEL_ATTACHMENTS',
      description: `Удалил вложение: "${att.file.name}"`,
    });
  }
}
