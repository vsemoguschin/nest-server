import {
  Controller,
  Post,
  UseGuards,
  Param,
  ParseIntPipe,
  UploadedFile,
  UseInterceptors,
  Delete,
  Get,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KanbanFilesService } from './kanban-files.service';

import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDto } from '../users/dto/user.dto';

@UseGuards(RolesGuard)
@Controller('attachmentssasa')
export class KanbanFilesController {
  constructor(private readonly filesService: KanbanFilesService) {}

  // // Загрузка одного файла и привязка к задаче
  // @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  // @Post('tasks/:taskId')
  // @UseInterceptors(
  //   FileInterceptor('file', {
  //     storage: memoryStorage(),
  //     limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  //   }),
  // )
  // async upload(
  //   @CurrentUser() user: UserDto,
  //   @Param('taskId', ParseIntPipe) taskId: number,
  //   @UploadedFile() file?: Express.Multer.File,
  // ) {
  //   if (!file) throw new BadRequestException('File is required');
  //   return this.filesService.uploadForTask({
  //     userId: user.id,
  //     taskId,
  //     file,
  //   });
  // }

  @Post('tasks/:taskId')
  @UseInterceptors(FileInterceptor('file'))
  async createReview(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserDto,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.filesService.createLikeReview(file, user, taskId);
  }



  @Get('download')
  // @Redirect(undefined, 302)
  async download(@Query('path') path: string) {
    const href = await this.filesService.getDownloadHref(path);
    if (!href) throw new NotFoundException('No download link');
    return { url: href, statusCode: 302 };
  }
}