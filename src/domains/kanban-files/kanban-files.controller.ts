import {
  Controller,
  Post,
  UseGuards,
  Param,
  ParseIntPipe,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Delete,
  Get,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { KanbanFilesService } from './kanban-files.service';

import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDto } from '../users/dto/user.dto';

@UseGuards(RolesGuard)
@Controller('attachments')
export class KanbanFilesController {
  constructor(private readonly filesService: KanbanFilesService) {}

  // Загрузка одного файла и привязка к задаче
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Post('tasks/:taskId')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  async upload(
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.filesService.uploadForTask({
      userId: user.id,
      taskId,
      file,
    });
  }

  // Список вложений задачи
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Get()
  async list(
    @CurrentUser() user: UserDto,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('columnId', ParseIntPipe) columnId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.filesService.listForTask(user.id, boardId, columnId, taskId);
  }

  // Удалить вложение (и файл на диске, если больше нигде не используется)
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Delete(':attachmentId')
  async remove(
    @CurrentUser() user: UserDto,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    return this.filesService.removeFromTask({
      userId: user.id,
      attachmentId,
    });
  }
}
