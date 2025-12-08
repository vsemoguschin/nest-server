import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'node:path';
import { createReadStream, promises as fs } from 'node:fs';
import axios from 'axios';
import {
  YandexDiskClient,
  YandexDiskResource,
  type UploadPayload,
} from 'src/integrations/yandex-disk/yandex-disk.client';
import { TelegramService } from 'src/services/telegram.service';

const YDS_ORDER = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

type PreviewOptions = {
  size?: string;
  crop?: boolean;
};

type DeleteResult = {
  deleted: number[];
  failed: { id: number; reason: string }[];
};

type MulterStoredFile = Express.Multer.File & { path?: string };

@Injectable()
export class TaskFilesService {
  private readonly baseFolder = 'EasyCRM';
  private readonly logger = new Logger(TaskFilesService.name);

  private readonly createdFolders = new Set<string>();
  private readonly maxCacheSize = 10000; // Лимит записей

  constructor(
    private readonly prisma: PrismaService,
    private readonly yandexDisk: YandexDiskClient,
    private readonly telegramService?: TelegramService,
  ) {}

  private decodeOriginalName(name?: string): string {
    if (!name) return '';
    try {
      return Buffer.from(name, 'latin1').toString('utf8');
    } catch {
      return name;
    }
  }

  /** Определить категорию и расширение по mime/расширению */
  private resolveCategory(file: Express.Multer.File): {
    category: 'images' | 'pdf' | 'cdr' | 'video' | 'docx';
    ext: string;
  } {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = (path.extname(file.originalname) || '').toLowerCase();

    if (mime.startsWith('image/'))
      return { category: 'images', ext: ext || '.bin' };
    if (mime === 'application/pdf' || ext === '.pdf')
      return { category: 'pdf', ext: '.pdf' };
    if (
      mime.startsWith('video/') ||
      ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)
    )
      return { category: 'video', ext: ext || '.mp4' };
    if (
      ext === '.cdr' ||
      mime === 'application/vnd.corel-draw' ||
      mime === 'image/x-cdr' ||
      mime === 'application/x-coreldraw'
    )
      return { category: 'cdr', ext: '.cdr' };

    // DOCX (Microsoft Word OpenXML)
    if (
      ext === '.docx' ||
      mime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
      return { category: 'docx', ext: '.docx' };

    throw new BadRequestException(
      'Unsupported file type. Allowed: images, pdf, cdr, video, docx',
    );
  }

  /**
   * Загрузить файл на Я.Диск и привязать к комментарию (1:N: KanbanFile.commentId)
   * Возвращает объект в формате, удобном фронту.
   */
  async uploadFile(
    file: Express.Multer.File,
    userId: number,
    boardId: number,
    commentId?: number,
  ) {
    const { category, ext } = this.resolveCategory(file);
    const yaName = `${uuidv4()}${ext}`;
    const directory = `boards/${boardId}/${category}`;
    const absPath = `EasyCRM/${directory}/${yaName}`;

    await this.ensureHierarchy(directory);
    this.logger.log(
      `TaskFiles upload start: userId=${userId}, boardId=${boardId}, commentId=${commentId ?? 'n/a'}, path=${absPath}, size=${file.size ?? file.buffer?.length ?? 0}`,
    );

    const payload = await this.createPayload(file);
    let resource: YandexDiskResource;

    // Улучшенная retry логика
    const maxAttempts = 3;
    let lastError: Error | null = null;

    // Коды ошибок, при которых нужно повторять попытку
    const retriableErrorCodes = [
      'ECONNABORTED', // Таймаут
      'ETIMEDOUT', // Таймаут соединения
      'ENOTFOUND', // DNS ошибка
      'ECONNRESET', // Соединение разорвано
      'ECONNREFUSED', // Соединение отклонено
      'EAI_AGAIN', // Временная DNS ошибка
    ];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        resource = await this.yandexDisk.uploadFile(absPath, payload);
        break; // Успех — выходим из цикла
      } catch (error) {
        lastError = error as Error;
        const message = error instanceof Error ? error.message : String(error);

        // Проверяем, является ли это сетевой ошибкой
        const axiosError = axios.isAxiosError(error) ? error : null;
        const errorCode =
          axiosError?.code ||
          (axiosError?.response?.status
            ? String(axiosError.response.status)
            : undefined);
        const isNetworkError = errorCode
          ? retriableErrorCodes.includes(errorCode)
          : false;
        const isRetriableMessage =
          message.includes('отсутствует') ||
          message.includes('timeout') ||
          message.includes('Превышено время ожидания') ||
          message.includes('ServiceUnavailable');

        // Если это не retriable ошибка — выбрасываем сразу
        if (!isNetworkError && !isRetriableMessage) {
          this.logger.error(
            `Non-retriable error during upload: path=${absPath}, attempt=${attempt}, code=${errorCode}, message=${message}`,
          );
          await this.cleanupTempFile(file);
          throw error;
        }

        this.logger.warn(
          `Upload attempt ${attempt}/${maxAttempts} failed for ${absPath}: code=${errorCode ?? 'unknown'}, message=${message}`,
        );

        if (attempt < maxAttempts) {
          // Exponential backoff: 2s, 4s, 8s... (максимум 10s)
          const delayMs = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
          this.logger.debug(`Retrying upload in ${delayMs}ms...`);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    await this.cleanupTempFile(file);

    if (!resource!) {
      const errorMessage = `All ${maxAttempts} upload attempts failed for ${absPath}. Last error: ${lastError?.message ?? 'unknown'}`;
      this.logger.error(errorMessage);

      // Отправляем оповещение в Telegram админам
      await this.notifyAdminsAboutUploadError({
        path: absPath,
        userId,
        boardId,
        commentId,
        error: lastError,
        attempts: maxAttempts,
      });

      throw lastError ?? new Error('Upload failed after retries');
    }

    const safeName =
      this.decodeOriginalName(file.originalname) || resource.name || yaName;
    this.logger.log(
      `TaskFiles upload complete: path=${absPath}, size=${resource.size ?? file.size ?? 0}, resourceId=${resource.resource_id ?? 'n/a'}`,
    );

    // 5) запись в БД
    const dbFile = await this.prisma.kanbanFile.create({
      data: {
        name: safeName,
        ya_name: yaName,
        size: resource.size ?? file.size ?? 0,
        preview: this.pickPreview(resource) ?? '',
        directory,
        path: absPath,
        mimeType: resource.mime_type || file.mimetype || null,
        uploadedById: userId,
        commentId: commentId ?? null,
        file: resource.file ?? '',
      },
      select: {
        id: true,
        name: true,
        preview: true,
        path: true,
        size: true,
        mimeType: true,
        directory: true,
        createdAt: true,
        file: true,
      },
    });

    const result = {
      id: dbFile.id,
      name: dbFile.name,
      preview: dbFile.preview,
      path: dbFile.path,
      size: dbFile.size,
      mimeType: dbFile.mimeType,
      createdAt: dbFile.createdAt,
      file: dbFile.file,
    };
    return result;
  }

  /**
   * Загрузить файл на Я.Диск и привязать к комментарию (1:N: KanbanFile.commentId)
   * Возвращает объект в формате, удобном фронту.
   */
  async uploadAvatar(file: Express.Multer.File) {
    const { ext } = this.resolveCategory(file);
    const yaName = `${uuidv4()}${ext}`;
    const directory = 'avatars';
    const absPath = `${this.baseFolder}/${directory}/${yaName}`;

    await this.ensureHierarchy(directory);

    await this.yandexDisk.uploadFile(absPath, {
      body: file.buffer,
      contentLength: file.buffer?.length,
    });

    return absPath;
  }

  /** Вернёт URL превью (от Yandex Disk). Можно указать размер и crop. */
  async getPreviewUrl(
    path: string,
    opts?: PreviewOptions,
  ): Promise<string | null> {
    const params: Record<string, unknown> = {
      fields: 'preview',
    };
    if (opts?.size) params.preview_size = opts.size;
    if (typeof opts?.crop === 'boolean') params.preview_crop = opts.crop;

    const resource = await this.yandexDisk.getResource(path, params);
    return resource.preview ?? null;
  }

  // async deleteFile(att: { filePath: string; fileId: number }) {
  //   // удалить на Я.Диске
  //   await axios.delete(this.YD_RES, {
  //     params: { path: att.filePath, permanently: true },
  //     headers: { Authorization: `OAuth ${this.TOKEN}` },
  //   });
  //   // и из БД
  //   await this.prisma.kanbanFile.delete({ where: { id: att.fileId } });
  // }

  /** helper: удалить один путь на Я.Диске (если path пустой — считаем успехом) */
  private async deleteOnYandex(path?: string | null): Promise<void> {
    if (!path) return;
    await this.yandexDisk.deleteResource(path, true);
  }

  /**
   * Полное удаление файла:
   * - DELETE на Я.Диске
   * - удаление taskLinks
   * - удаление записи файла
   */
  async deleteFile(fileId: number): Promise<void> {
    const file = await this.prisma.kanbanFile.findUnique({
      where: { id: fileId },
    });
    if (!file) {
      throw new NotFoundException(`Файл с id=${fileId} не найден`);
    }

    try {
      await this.deleteOnYandex(file.path);

      await this.prisma.$transaction(async (tx) => {
        await tx.kanbanTaskAttachment.deleteMany({ where: { fileId } });
        await tx.kanbanFile.delete({ where: { id: fileId } });
      });
    } catch {
      throw new InternalServerErrorException('Не удалось удалить файл');
    }
  }

  async deleteFiles(fileIds: number[]): Promise<DeleteResult> {
    if (!fileIds?.length) return { deleted: [], failed: [] };

    const files = await this.prisma.kanbanFile.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, path: true },
    });
    if (!files.length) return { deleted: [], failed: [] };

    const results = await Promise.allSettled(
      files.map(async (f) => {
        await this.deleteOnYandex(f.path);
        return f.id;
      }),
    );

    const deleted: number[] = [];
    const failed: { id: number; reason: string }[] = [];

    results.forEach((result, idx) => {
      const id = files[idx].id;
      if (result.status === 'fulfilled') {
        deleted.push(id);
      } else {
        const reason =
          result.reason instanceof Error
            ? result.reason.message
            : typeof result.reason === 'string'
              ? result.reason
              : 'Yandex delete failed';
        failed.push({ id, reason });
      }
    });

    // Чистим только успешно удалённые
    if (deleted.length) {
      await this.prisma.$transaction(async (tx) => {
        await tx.kanbanTaskAttachment.deleteMany({
          where: { fileId: { in: deleted } },
        });
        await tx.kanbanFile.deleteMany({ where: { id: { in: deleted } } });
      });
    }

    return { deleted, failed };
  }

  private async createPayload(
    file: Express.Multer.File,
  ): Promise<UploadPayload> {
    const localPath = (file as MulterStoredFile)?.path;
    if (localPath) {
      const stat = await fs.stat(localPath);
      this.logger.debug(
        `TaskFiles createPayload: using disk file=${localPath}, size=${stat.size}`,
      );
      return {
        body: createReadStream(localPath),
        contentLength: stat.size,
      };
    }

    this.logger.debug(
      `TaskFiles createPayload: using buffer, size=${file.buffer?.length ?? 0}`,
    );
    return {
      body: file.buffer,
      contentLength: file.buffer?.length,
    };
  }

  private async cleanupTempFile(file: Express.Multer.File): Promise<void> {
    const localPath = (file as MulterStoredFile)?.path;
    if (!localPath) return;
    try {
      await fs.unlink(localPath);
    } catch {
      // ignore cleanup errors
    }
  }

  private async ensureHierarchy(directory: string): Promise<void> {
    const segments = directory.split('/').filter(Boolean);
    let current = this.baseFolder;

    // Очистка кеша если превышен лимит
    if (this.createdFolders.size > this.maxCacheSize) {
      this.logger.warn(`Folder cache exceeded ${this.maxCacheSize}, clearing`);
      this.createdFolders.clear();
    }

    if (!this.createdFolders.has(current)) {
      await this.yandexDisk.ensureFolder(current);
      this.createdFolders.add(current);
    }

    for (const segment of segments) {
      current = `${current}/${segment}`;
      if (this.createdFolders.has(current)) continue;

      this.logger.debug(`TaskFiles ensure folder: ${current}`);
      await this.yandexDisk.ensureFolder(current);
      this.createdFolders.add(current);
    }
  }

  private pickPreview(
    resource: YandexDiskResource,
    prefer: string = 'M',
  ): string | null {
    const sizes = resource.sizes ?? [];
    if (sizes.length) {
      const sorted = [...sizes].sort((a, b) => {
        const ia = YDS_ORDER.indexOf((a.name || '').toUpperCase());
        const ib = YDS_ORDER.indexOf((b.name || '').toUpperCase());
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });

      const exact = sorted.find(
        (s) => (s.name || '').toUpperCase() === prefer.toUpperCase(),
      );
      if (exact?.url) return exact.url;

      const preferIdx = YDS_ORDER.indexOf(prefer.toUpperCase());
      if (preferIdx !== -1) {
        const up = sorted.find(
          (s) => YDS_ORDER.indexOf((s.name || '').toUpperCase()) >= preferIdx,
        );
        if (up?.url) return up.url;
      }

      return sorted[sorted.length - 1]?.url ?? resource.preview ?? null;
    }

    return resource.preview ?? null;
  }

  /**
   * Отправить оповещение админам в Telegram об ошибке загрузки файла
   */
  private async notifyAdminsAboutUploadError(params: {
    path: string;
    userId: number;
    boardId: number;
    commentId?: number;
    error: Error | null;
    attempts: number;
  }): Promise<void> {
    if (!this.telegramService) {
      this.logger.debug('TelegramService not available, skipping notification');
      return;
    }

    // Отправляем только в production
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    try {
      // Получаем информацию о пользователе
      const user = await this.prisma.user.findUnique({
        where: { id: params.userId },
        select: { fullName: true },
      });

      const fileName = params.path.split('/').pop() || 'unknown';
      const errorMessage = params.error?.message || 'Unknown error';
      const axiosError =
        params.error && axios.isAxiosError(params.error) ? params.error : null;
      const errorCode = axiosError?.code || 'unknown';

      const message =
        `🚨 <b>Ошибка загрузки файла на Яндекс.Диск</b>\n\n` +
        `📁 <b>Файл:</b> ${this.escapeHtml(fileName)}\n` +
        `👤 <b>Пользователь:</b> ${this.escapeHtml(user?.fullName || `ID: ${params.userId}`)}\n` +
        `📋 <b>Доска:</b> ${params.boardId}\n` +
        (params.commentId
          ? `💬 <b>Комментарий:</b> ${params.commentId}\n`
          : '') +
        `🔄 <b>Попыток:</b> ${params.attempts}\n` +
        `❌ <b>Ошибка:</b> ${this.escapeHtml(errorMessage)}\n` +
        (errorCode !== 'unknown' ? `🔢 <b>Код:</b> ${errorCode}\n` : '') +
        `⏰ <b>Время:</b> ${new Date().toLocaleString('ru-RU')}`;

      // ID админов из notification-scheduler.service.ts
      const adminIds = ['317401874'];

      await Promise.allSettled(
        adminIds.map((id) =>
          this.telegramService!.sendToChat(id, message, false),
        ),
      );
    } catch (error) {
      // Не логируем ошибки отправки уведомлений, чтобы не создавать цикл
      this.logger.debug(
        `Failed to send Telegram notification: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private escapeHtml(s: string): string {
    return s.replace(
      /[&<>"']/g,
      (ch) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[ch as '&' | '<' | '>' | '"' | "'"] as string,
    );
  }
}
