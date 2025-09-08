import {
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { TaskFilesService } from 'src/services/boards/task-files.service';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { TaskAuditService } from 'src/services/boards/task-audit.service';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import type { Response as ExpressResponse } from 'express';
import { Public } from 'src/auth/public.decorator';

/** DTO для превью */
class PreviewFileQueryDto {
  @IsString()
  path!: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : parseInt(value, 10),
  )
  @IsInt()
  @Min(0)
  w?: number;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : parseInt(value, 10),
  )
  @IsInt()
  @Min(0)
  h?: number;

  @IsOptional()
  @IsString()
  format?: 'webp' | 'jpeg' | 'png';
}

/** DTO для скачивания */
class DownloadFileQueryDto {
  @IsString()
  path!: string;
}

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
  // @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  // @Delete(':attachmentId')
  // async remove(
  //   @CurrentUser() user: UserDto,
  //   @Param('attachmentId', ParseIntPipe) attachmentId: number,
  // ) {
  //   const att = await this.attachmentsService.ensureAttachment(attachmentId);
  //   const stillUsed = await this.attachmentsService.removeFromTask({
  //     id: att.id,
  //     fileId: att.fileId,
  //   });
  //   if (!stillUsed) {
  //     await this.filesService.deleteFile({
  //       filePath: att.file.path,
  //       fileId: att.fileId,
  //     });
  //   }
  //   await this.audit.log({
  //     userId: user.id,
  //     taskId: att.taskId,
  //     action: 'DEL_ATTACHMENTS',
  //     description: `Удалил вложение: "${att.file.name}"`,
  //   });
  // }

  // @Get('download')
  // // @Redirect(undefined, 302)
  // async download(@Query('path') path: string) {
  //   const href = await this.attachmentsService.getDownloadHref(path);
  //   if (!href) throw new NotFoundException('No download link');
  //   return { url: href, statusCode: 302 };
  // }

  /** Превью: стримим картинку, при необходимости ресайз/конверсия (делает сервис) */
  @Public()
  @Get('preview-file')
  async previewFile(
    @Query() q: PreviewFileQueryDto,
    @Res() res: ExpressResponse,
  ) {
    const { stream, contentType, filename, cacheSeconds } =
      await this.attachmentsService.getPreviewStream(q);

    res.setHeader('Content-Type', contentType || 'image/*');
    if (filename)
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    const maxAge =
      typeof cacheSeconds === 'number' && isFinite(cacheSeconds)
        ? cacheSeconds
        : 60 * 60 * 24;
    res.setHeader(
      'Cache-Control',
      `public, max-age=${maxAge}, stale-while-revalidate=${7 * 24 * 60 * 60}`,
    );

    stream.on('error', () => {
      if (!res.headersSent) res.status(HttpStatus.BAD_GATEWAY);
      res.end();
    });
    stream.pipe(res);
  }

  @Public()
  @Get('download-file')
  async downloadFile(
    @Query() q: DownloadFileQueryDto,
    @Res() res: ExpressResponse,
  ) {
    const { stream, contentType, filename, cacheSeconds } =
      await this.attachmentsService.getDownloadStream(q.path);

    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    if (filename)
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );

    const maxAge =
      typeof cacheSeconds === 'number' && isFinite(cacheSeconds)
        ? cacheSeconds
        : 60 * 60 * 24;
    res.setHeader('Cache-Control', `public, max-age=${maxAge}`);

    stream.on('error', () => {
      if (!res.headersSent) res.status(HttpStatus.BAD_GATEWAY);
      res.end();
    });
    stream.pipe(res);
  }
}
