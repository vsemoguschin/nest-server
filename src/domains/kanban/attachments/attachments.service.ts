import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import type { Readable } from 'stream';

type PreviewQuery = {
  path: string;
  w?: number;
  h?: number;
  format?: 'webp' | 'jpeg' | 'png';
};

type StreamResult = {
  stream: Readable;
  contentType?: string;
  filename?: string;
  cacheSeconds?: number;
};

@Injectable()
export class AttachmentsService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly YD_API = 'https://cloud-api.yandex.net/v1/disk';
  private readonly YD_RES = `${this.YD_API}/resources`;
  private readonly YD_DOWNLOAD = `${this.YD_RES}/download`;

  private readonly API = 'https://cloud-api.yandex.net/v1/disk';
  private readonly headers = { Authorization: `OAuth ${process.env.YA_TOKEN}` };

  async ensureAttachment(attachmentId: number) {
    const att = await this.prisma.kanbanTaskAttachment.findFirst({
      where: { id: attachmentId },
      include: { file: true },
    });
    if (!att) throw new NotFoundException('Attachment not found');
    return att;
  }

  /** Определить категорию и расширение по mime/расширению */
  /**
   * Получает вложения по идентификатору задачи.
   * @param taskId - Идентификатор задачи
   * @returns Список вложений с файлами и данными создателя
   */
  async getAttachmentsByTaskId(taskId: number) {
    const exists = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!exists) throw new NotFoundException('Task not found');
    const attachments = await this.prisma.kanbanFile.findMany({
      where: {
        deletedAt: null,
        taskLinks: {
          some: {
            taskId,
          },
        },
      },
      include: {
        uploadedBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return attachments.map((file) => {
      return {
        id: file.id,
        name: file.name,
        path: file.path,
        preview: file.path,
        mimeType: file.mimeType,
        size: file.size,
        ya_name: file.ya_name,
        directory: file.directory,
        createdAt: file.createdAt,
        uploadedBy: {
          id: file.uploadedBy.id,
          fullName: file.uploadedBy.fullName,
        },
      };
    });
  }

  async create(taskId: number, fileId: number) {
    const att = await this.prisma.kanbanTaskAttachment.create({
      data: {
        taskId,
        fileId,
      },
    });
    return att;
  }

  /** Удалить вложение; если файл больше не используется — удалить с Я.Диска и из БД */
  async removeFromTask(att: { id: number; fileId: number }) {
    const file = await this.prisma.kanbanFile.findFirst({
      where: { id: att.id, deletedAt: null },
    });
    if (!file) throw new NotFoundException('Att not found');

    // удаляем связь
    await this.prisma.kanbanTaskAttachment.delete({
      where: { id: att.id },
    });

    // проверяем, остался ли файл где-то ещё прикреплён
    const stillUsed = await this.prisma.kanbanTaskAttachment.findFirst({
      where: { fileId: att.fileId },
      select: { id: true },
    });

    return stillUsed;
  }

  /** Одноразовый href для скачивания или null */
  // async getDownloadHref(path: string): Promise<string | null> {
  //   const { data } = await axios.get(`${this.API}/resources/download`, {
  //     params: { path },
  //     headers: this.headers,
  //   });
  //   // console.log(data);

  //   return data?.href ?? null;
  // }

  /** Получить прямую ссылку на скачивание файла на Я.Диске */
  private async getDownloadHref(path: string): Promise<string> {
    if (!path) throw new BadRequestException('path is required');

    try {
      const { data } = await axios.get<{
        href: string;
        method: string;
        templated?: boolean;
      }>(this.YD_DOWNLOAD, {
        params: { path },
        headers: this.headers,
        timeout: 15000,
      });

      if (!data?.href) {
        this.logger.warn(`No href from YDisk for path="${path}"`);
        throw new NotFoundException('File href not found');
      }
      return data.href;
    } catch (e: any) {
      const msg = e?.response?.data
        ? JSON.stringify(e.response.data)
        : e?.message;
      this.logger.error(`getDownloadHref failed: ${msg}`);
      if (e?.response?.status === 404)
        throw new NotFoundException('File not found');
      throw new InternalServerErrorException('Storage error');
    }
  }

  /** Открыть исходный поток файла по прямой ссылке */
  private async openSourceStream(href: string): Promise<{
    stream: Readable;
    contentType?: string;
    contentLength?: number;
  }> {
    try {
      const resp = await axios.get(href, {
        responseType: 'stream',
        timeout: 30000,
      });
      const contentType = resp.headers['content-type'] as string | undefined;
      const contentLength = Number(resp.headers['content-length']);
      const stream = resp.data as unknown as Readable;
      return { stream, contentType, contentLength };
    } catch (e: any) {
      const msg = e?.response?.status
        ? `${e.response.status} ${e.response.statusText}`
        : e?.message;
      this.logger.error(`openSourceStream failed: ${msg}`);
      throw new InternalServerErrorException('Upstream download failed');
    }
  }

  /** Попробовать подключить sharp динамически (без жёсткой зависимости) */
  private async tryLoadSharp(): Promise<any | null> {
    try {
      // динамический импорт через eval — TS не будет требовать типы модуля
      const mod = await (eval('import("sharp")') as Promise<any>);
      return mod?.default ?? mod ?? null;
    } catch {
      this.logger.warn(
        'sharp is not installed — preview will be original stream',
      );
      return null;
    }
  }

  private extForFormat(fmt?: 'webp' | 'jpeg' | 'png'): string {
    if (!fmt) return '';
    switch (fmt) {
      case 'webp':
        return '.webp';
      case 'jpeg':
        return '.jpg';
      case 'png':
        return '.png';
      default:
        return '';
    }
  }

  private deriveFilename(
    path: string,
    format?: 'webp' | 'jpeg' | 'png',
  ): string {
    const base = (path.split('/').pop() || 'file').replace(/[?#].*$/, '');
    if (!format) return base;
    const ext = this.extForFormat(format);
    return base.replace(/\.[^.]+$/, '') + ext;
  }

  /** Сформировать поток превью (resize/convert при наличии sharp) */
  async getPreviewStream(q: PreviewQuery): Promise<StreamResult> {
    const { path, w, h, format } = q;
    if (!path) throw new BadRequestException('path is required');

    // 1) получаем прямой href и открываем исходный поток
    const href = await this.getDownloadHref(path);
    const src = await this.openSourceStream(href);

    const isImage = (src.contentType || '').startsWith('image/');
    const needTransform = isImage && (!!w || !!h || !!format);

    if (!needTransform) {
      // отдаём как есть (inline)
      return {
        stream: src.stream,
        contentType: src.contentType ?? 'image/*',
        filename: this.deriveFilename(path),
        cacheSeconds: 60 * 60 * 24, // 1 день
      };
    }

    // 2) пытаемся применить sharp (если установлен)
    const sharp = await this.tryLoadSharp();
    if (!sharp) {
      // sharp нет — отдаём оригинал как есть
      return {
        stream: src.stream,
        contentType: src.contentType ?? 'image/*',
        filename: this.deriveFilename(path),
        cacheSeconds: 60 * 60 * 24,
      };
    }

    // 3) resize/convert
    const transformer = sharp();
    const width = typeof w === 'number' && w > 0 ? w : undefined;
    const height = typeof h === 'number' && h > 0 ? h : undefined;

    if (width || height) {
      transformer.resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    const fmt = format ?? 'webp';
    switch (fmt) {
      case 'webp':
        transformer.webp({ quality: 70 });
        break;
      case 'jpeg':
        transformer.jpeg({ quality: 75, mozjpeg: true });
        break;
      case 'png':
        transformer.png({ compressionLevel: 8 });
        break;
    }

    const outType =
      fmt === 'webp'
        ? 'image/webp'
        : fmt === 'jpeg'
          ? 'image/jpeg'
          : fmt === 'png'
            ? 'image/png'
            : (src.contentType ?? 'image/*');

    // собираем пайп: исходник -> sharp -> ответ
    // важно: не читать всё в память
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const piped = (src.stream as any).pipe(transformer as any) as Readable;
    return {
      stream: piped,
      contentType: outType,
      filename: this.deriveFilename(path, fmt),
      cacheSeconds: 60 * 60 * 24, // 1 день
    };
  }

  /** Сформировать поток для скачивания (attachment) */
  async getDownloadStream(path: string): Promise<StreamResult> {
    if (!path) throw new BadRequestException('path is required');

    const href = await this.getDownloadHref(path);
    const src = await this.openSourceStream(href);

    return {
      stream: src.stream,
      contentType: src.contentType ?? 'application/octet-stream',
      filename: this.deriveFilename(path),
      cacheSeconds: 60 * 60 * 24, // 1 день
    };
  }
}
