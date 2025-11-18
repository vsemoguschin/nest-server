import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { PrismaService } from 'src/prisma/prisma.service';
import type { Readable } from 'stream';
import { YandexDiskClient } from 'src/integrations/yandex-disk/yandex-disk.client';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly yandexDisk: YandexDiskClient,
  ) {}
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly downloadRetryAttempts = 2;
  private readonly placeholderFilename = 'placeholder.png';
  private readonly placeholderAbsolutePath = join(
    process.cwd(),
    'public',
    this.placeholderFilename,
  );

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
  private async getDownloadHref(path: string): Promise<string | null> {
    if (!path) throw new BadRequestException('path is required');

    try {
      const href = await this.yandexDisk.getDownloadLink(path);
      if (!href) {
        this.logger.warn(`No href from YDisk for path="${path}"`);
        throw new NotFoundException('File href not found');
      }
      return href;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error ?? 'unknown');

      // Постоянные ошибки - возвращаем null для показа placeholder
      if (
        error instanceof NotFoundException ||
        errorMessage.includes('DiskNotFoundError') ||
        errorMessage.includes('Resource not found')
      ) {
        this.logger.warn(`File missing on Yandex Disk: ${path}`);
        return null;
      }

      // Временные ошибки - возвращаем null для показа placeholder
      if (
        error instanceof ServiceUnavailableException ||
        errorMessage.includes('Service Unavailable') ||
        errorMessage.includes('Bad Gateway') ||
        errorMessage.includes('502') ||
        errorMessage.includes('503')
      ) {
        this.logger.warn(
          `Temporary Yandex Disk error for path="${path}": ${errorMessage}. Returning null for placeholder.`,
        );
        return null;
      }

      // Обработка BadRequestException (400) - возможно неверный формат пути
      if (error instanceof BadRequestException) {
        this.logger.error(
          `Bad request to Yandex Disk for path="${path}": ${errorMessage}. This might indicate path format issue.`,
        );
        return null; // Возвращаем null вместо выбрасывания ошибки
      }

      // Обработка ForbiddenException (403) - недостаточно прав
      if (error instanceof ForbiddenException) {
        this.logger.error(
          `Access forbidden to Yandex Disk for path="${path}": ${errorMessage}. Check token permissions.`,
        );
        return null; // Возвращаем null вместо выбрасывания ошибки
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const msg = error.response?.data
          ? JSON.stringify(error.response.data)
          : error.message;

        // Улучшенное логирование с полной информацией
        this.logger.error(
          `getDownloadHref failed for path="${path}": status=${status ?? 'n/a'}, message=${msg}, code=${error.code ?? 'n/a'}`,
        );

        // 404 - файл не найден, возвращаем null
        if (status === 404) {
          this.logger.warn(`File missing on Yandex Disk: ${path}`);
          return null;
        }

        // 400 - неверный запрос, возвращаем null
        if (status === 400) {
          this.logger.warn(
            `Bad request to Yandex Disk (400) for path="${path}". Path format might be incorrect.`,
          );
          return null;
        }

        // 403 - недостаточно прав, возвращаем null
        if (status === 403) {
          this.logger.warn(
            `Access forbidden (403) to Yandex Disk for path="${path}". Check token permissions.`,
          );
          return null;
        }

        // 502, 503 - временные ошибки, возвращаем null
        if (status === 502 || status === 503) {
          this.logger.warn(
            `Temporary Yandex Disk error (${status}) for path="${path}". Returning null for placeholder.`,
          );
          return null;
        }

        // Сетевые ошибки (timeout, connection refused и т.д.)
        if (
          !status &&
          (error.code === 'ECONNABORTED' ||
            error.code === 'ECONNREFUSED' ||
            error.code === 'ETIMEDOUT')
        ) {
          this.logger.warn(
            `Network error when accessing Yandex Disk for path="${path}": ${error.code}. Returning null for placeholder.`,
          );
          return null;
        }
      } else if (error instanceof Error) {
        this.logger.error(`getDownloadHref failed: ${error.message}`);
      } else {
        this.logger.error('getDownloadHref failed: Unknown error');
      }

      // Только для действительно критических ошибок выбрасываем исключение
      // Логируем полную информацию об ошибке перед выбрасыванием
      this.logger.error(
        `Critical error in getDownloadHref for path="${path}": ${errorMessage}. Throwing InternalServerErrorException.`,
        error instanceof Error ? error.stack : undefined,
      );
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

      // Валидация Content-Type: отклоняем HTML ответы
      if (contentType) {
        const normalizedContentType = contentType
          .toLowerCase()
          .split(';')[0]
          .trim();
        if (
          normalizedContentType === 'text/html' ||
          normalizedContentType.startsWith('text/html')
        ) {
          this.logger.error(
            `Yandex Disk returned HTML instead of file. Content-Type: ${contentType}, href: ${href}`,
          );
          stream.destroy();
          throw new InternalServerErrorException(
            'Yandex Disk returned HTML error page instead of file',
          );
        }
      }

      return { stream, contentType, contentLength };
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const statusText = axiosError.response?.statusText;
      const bodyRaw = axiosError.response?.data;
      const bodyString =
        typeof bodyRaw === 'string'
          ? bodyRaw
          : bodyRaw
            ? JSON.stringify(bodyRaw)
            : undefined;
      const snippet =
        bodyString && bodyString.length > 2000
          ? `${bodyString.slice(0, 2000)}…`
          : bodyString;
      const messageParts = [
        `status=${status ?? 'n/a'}`,
        `statusText=${statusText ?? 'n/a'}`,
        `message=${axiosError.message ?? 'n/a'}`,
      ];
      if (snippet) {
        messageParts.push(`body=${snippet}`);
      }
      this.logger.error(`openSourceStream failed: ${messageParts.join(' | ')}`);
      throw new InternalServerErrorException({
        message: 'Upstream download failed',
        upstreamStatus: status,
        upstreamStatusText: statusText,
        upstreamBody: snippet,
      });
    }
  }

  /** Попробовать подключить sharp динамически (без жёсткой зависимости) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async tryLoadSharp(): Promise<any | null> {
    try {
      // динамический импорт через eval — TS не будет требовать типы модуля
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // console.log('here');
    // 1) получаем прямой href и открываем исходный поток
    const href = await this.getDownloadHref(path);
    if (!href) {
      this.logger.warn(
        `Returning placeholder for preview: path=${path}, format=${format ?? 'original'}`,
      );
      return this.buildPlaceholderStream();
    }
    const src = await this.fetchSourceStream(path, href);

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
    transformer.rotate();
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    if (!href) {
      this.logger.warn(`Returning placeholder for download: path=${path}`);
      return this.buildPlaceholderStream();
    }
    const src = await this.fetchSourceStream(path, href);

    return {
      stream: src.stream,
      contentType: src.contentType ?? 'application/octet-stream',
      filename: this.deriveFilename(path),
      cacheSeconds: 60 * 60 * 24, // 1 день
    };
  }

  private buildPlaceholderStream(): StreamResult {
    if (!existsSync(this.placeholderAbsolutePath)) {
      this.logger.error(
        `Placeholder file not found: ${this.placeholderAbsolutePath}`,
      );
      throw new NotFoundException('File not found');
    }

    try {
      const stream = createReadStream(this.placeholderAbsolutePath);
      return {
        stream,
        contentType: 'image/png',
        filename: this.placeholderFilename,
        cacheSeconds: 60 * 60 * 24,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to open placeholder file: ${message}`);
      throw new InternalServerErrorException('Storage error');
    }
  }

  private async fetchSourceStream(
    path: string,
    initialHref: string,
  ): Promise<{
    stream: Readable;
    contentType?: string;
    contentLength?: number;
  }> {
    let attempt = 0;
    let href: string | null = initialHref;

    while (attempt < this.downloadRetryAttempts && href) {
      attempt += 1;
      try {
        const result = await this.openSourceStream(href);
        if (attempt > 1) {
          this.logger.log(
            `Successfully fetched stream on retry ${attempt} for path=${path}`,
          );
        }
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error ?? 'unknown');
        this.logger.warn(
          `openSourceStream attempt ${attempt} failed for path=${path}: ${message}`,
        );
        if (attempt >= this.downloadRetryAttempts) {
          break;
        }
        href = await this.getDownloadHref(path);
        if (!href) {
          this.logger.warn(
            `Re-fetching href returned null for path=${path}, using placeholder`,
          );
          return this.buildPlaceholderStream();
        }
      }
    }

    this.logger.error(
      `All attempts to fetch stream failed for path=${path}. Falling back to placeholder.`,
    );
    return this.buildPlaceholderStream();
  }
}
