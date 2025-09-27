import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'node:path';
import axios from 'axios';

@Injectable()
export class TaskFilesService {
  private readonly API = 'https://cloud-api.yandex.net/v1/disk';
  private readonly YD_RES = 'https://cloud-api.yandex.net/v1/disk/resources';
  private readonly TOKEN = process.env.YA_TOKEN as string;
  private readonly headers = { Authorization: `OAuth ${process.env.YA_TOKEN}` };

  constructor(private readonly prisma: PrismaService) {}

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

    const axiosMod = (await import('axios')).default;
    const { Agent } = await import('https');
    const fs = await import('fs');
    const fsp = fs.promises;
    const { PassThrough } = await import('stream');

    const http = axiosMod.create({
      timeout: 1_800_000, // 30 минут
      maxContentLength: Infinity as any,
      maxBodyLength: Infinity as any,
      httpsAgent: new Agent({ keepAlive: true }),
    });

    const TOKEN = process.env.YA_TOKEN as string;
    if (!TOKEN) {
      throw new Error('YA_TOKEN is not set');
    }
    const auth = { Authorization: `OAuth ${TOKEN}` };

    const YD_UPLOAD = 'https://cloud-api.yandex.net/v1/disk/resources/upload';
    const YD_RES = 'https://cloud-api.yandex.net/v1/disk/resources';

    // 1) ensure base directory
    const baseDir = `EasyCRM/${directory}`;
    try {
      await http.put(YD_RES, null, {
        params: { path: baseDir },
        headers: auth,
      });
    } catch (e: any) {
      if (e?.response?.status === 409) {
      } else {
        throw e;
      }
    }

    // 2) get upload href
    const up = await http.get(YD_UPLOAD, {
      params: { path: absPath, overwrite: true },
      headers: auth,
    });
    const href: string = up?.data?.href;

    // === 3) upload ===
    const localPath: string | undefined = (file as any).path;

    const formatBytes = (n: number) => {
      const mb = n / (1024 * 1024);
      return `${mb.toFixed(1)} MB`;
    };

    if (localPath) {
      const stat = await fsp.stat(localPath);
      const total = stat.size;

      const readStream = fs.createReadStream(localPath);
      const progress = new PassThrough();

      let uploaded = 0;
      let lastLog = 0;
      const LOG_STEP = 5 * 1024 * 1024; // 5MB

      progress.on('data', (chunk: Buffer) => {
        uploaded += chunk.length;
        if (uploaded - lastLog >= LOG_STEP || uploaded === total) {
          lastLog = uploaded;
          const percent = ((uploaded / total) * 100).toFixed(1);
        }
      });

      const startedAt = Date.now();
      readStream.on('open', () => {});
      readStream.on('error', () => {});
      progress.on('error', () => {});

      readStream.pipe(progress);

      try {
        await http.put(href, progress as any, {
          headers: {
            'Content-Type': file.mimetype || 'application/octet-stream',
            'Content-Length': String(total),
          },
          // onUploadProgress не работает в Node-адаптере — прогресс считаем вручную через PassThrough
        });
        const ms = Date.now() - startedAt;
      } catch (e: any) {
        throw e;
      } finally {
        try {
          await fsp.unlink(localPath);
        } catch (e: any) {}
      }
    } else {
      // Fallback: память (если вдруг не diskStorage)
      const len = file.size ?? file.buffer?.length ?? 0;
      try {
        await http.put(href, file.buffer, {
          headers: {
            'Content-Type': file.mimetype || 'application/octet-stream',
            'Content-Length': String(len),
          },
        });
      } catch (e: any) {
        throw e;
      }
    }

    // 4) fetch metadata with small retry
    let md: any | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        md = await http.get(YD_RES, {
          params: {
            path: absPath,
            fields: 'name,path,size,mime_type,preview,sizes,file',
          },
          headers: auth,
        });
        if (md?.data?.size) {
          break;
        }
      } catch (e: any) {}
      await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
    }

    const safeName =
      this.decodeOriginalName(file.originalname) || md?.data?.name || yaName;

    // 5) запись в БД
    const dbFile = await this.prisma.kanbanFile.create({
      data: {
        name: safeName,
        ya_name: yaName,
        size: md?.data?.size ?? file.size ?? 0,
        preview: md?.data?.sizes?.[0]?.url || md?.data?.preview || '',
        directory,
        path: absPath,
        mimeType: md?.data?.mime_type || file.mimetype || null,
        uploadedById: userId,
        commentId: commentId ?? null,
        file: md?.data?.file ?? '',
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
    const absPath = `EasyCRM/avatars/${yaName}`;

    // Загрузка на Я.Диск — используем те же эндпоинты, что и в вашем файловом сервисе
    // 1) получить href для загрузки
    const axios = (await import('axios')).default;
    const TOKEN = process.env.YA_TOKEN as string;
    const YD_UPLOAD = 'https://cloud-api.yandex.net/v1/disk/resources/upload';

    const up = await axios.get(YD_UPLOAD, {
      params: { path: absPath, overwrite: true },
      headers: { Authorization: `OAuth ${TOKEN}` },
    });
    await axios.put(up.data.href, file.buffer, {
      headers: { 'Content-Type': 'application/octet-stream' },
    });

    return absPath;
  }

  /** Вернёт URL превью (от Yandex Disk). Можно указать размер и crop. */
  async getPreviewUrl(
    path: string,
    opts?: { size?: string; crop?: boolean },
  ): Promise<string | null> {
    const params: Record<string, any> = {
      path,
      fields: 'preview',
    };
    if (opts?.size) params.preview_size = opts.size;
    if (typeof opts?.crop === 'boolean') params.preview_crop = opts.crop;

    const { data } = await axios.get(`${this.API}/resources`, {
      params,
      headers: this.headers,
    });
    return data?.preview ?? null;
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
    await axios.delete(this.YD_RES, {
      headers: this.headers,
      params: { path, permanently: true },
    });
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
    } catch (e: any) {
      throw new InternalServerErrorException('Не удалось удалить файл');
    }
  }

  async deleteFiles(
    fileIds: number[],
  ): Promise<{ deleted: number[]; failed: { id: number; reason: string }[] }> {
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

    results.forEach((r, idx) => {
      const id = files[idx].id;
      if (r.status === 'fulfilled') deleted.push(id);
      else
        failed.push({
          id,
          reason:
            (r as PromiseRejectedResult)?.reason?.message ??
            'Yandex delete failed',
        });
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
}
