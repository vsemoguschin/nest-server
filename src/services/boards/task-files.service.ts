import { BadRequestException, Injectable } from '@nestjs/common';
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

  /** Определить категорию и расширение по mime/расширению */
  private resolveCategory(file: Express.Multer.File): {
    category: 'images' | 'pdf' | 'cdr';
    ext: string;
  } {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = (path.extname(file.originalname) || '').toLowerCase();

    if (mime.startsWith('image/'))
      return { category: 'images', ext: ext || '.bin' };
    if (mime === 'application/pdf' || ext === '.pdf')
      return { category: 'pdf', ext: '.pdf' };
    if (
      ext === '.cdr' ||
      mime === 'application/vnd.corel-draw' ||
      mime === 'image/x-cdr' ||
      mime === 'application/x-coreldraw'
    )
      return { category: 'cdr', ext: '.cdr' };

    throw new BadRequestException(
      'Unsupported file type. Allowed: images, pdf, cdr',
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

    // Загрузка на Я.Диск — используем те же эндпоинты, что и в вашем файловом сервисе
    // 1) получить href для загрузки
    const axios = (await import('axios')).default;
    const TOKEN = process.env.YA_TOKEN as string;
    const YD_UPLOAD = 'https://cloud-api.yandex.net/v1/disk/resources/upload';
    const YD_RES = 'https://cloud-api.yandex.net/v1/disk/resources';

    const up = await axios.get(YD_UPLOAD, {
      params: { path: absPath, overwrite: true },
      headers: { Authorization: `OAuth ${TOKEN}` },
    });
    await axios.put(up.data.href, file.buffer, {
      headers: { 'Content-Type': 'application/octet-stream' },
    });

    // 2) свежие метаданные (несколько попыток, чтобы появились sizes/preview)
    const md = await axios.get(YD_RES, {
      params: {
        path: absPath,
        fields: 'name,path,size,mime_type,preview,sizes,file',
      },
      headers: { Authorization: `OAuth ${TOKEN}` },
    });

    console.log(md);

    // 3) запись файла в БД с привязкой к комменту
    const dbFile = await this.prisma.kanbanFile.create({
      data: {
        name: file.originalname || md.data?.name || yaName,
        ya_name: yaName,
        size: md.data?.size ?? file.size ?? 0,
        preview: md.data?.sizes?.[0]?.url || md.data.preview || '',
        directory,
        path: absPath,
        mimeType: md.data?.mime_type || file.mimetype || null,
        uploadedById: userId,
        commentId: commentId ?? null,
        file: md.data.file ?? '',
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

    // Формат как ожидает фронт
    return {
      id: dbFile.id,
      name: dbFile.name,
      preview: dbFile.preview,
      path: dbFile.path,
      size: dbFile.size,
      mimeType: dbFile.mimeType,
      createdAt: dbFile.createdAt,
      file: dbFile.file,
    };
  }

  /**
   * Загрузить файл на Я.Диск и привязать к комментарию (1:N: KanbanFile.commentId)
   * Возвращает объект в формате, удобном фронту.
   */
  async uploadAvatar(file: Express.Multer.File) {
    const { category, ext } = this.resolveCategory(file);
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

  /** Вернёт только preview (без sizes) или null */
  async getPreviewOnly(path: string): Promise<string | null> {
    const { data } = await axios.get(`${this.API}/resources`, {
      params: { path, fields: 'sizes' },
      headers: this.headers,
    });

    return data?.sizes[0].url ?? null;
  }

  async deleteFile(att: { filePath: string; fileId: number }) {
    // удалить на Я.Диске
    await axios.delete(this.YD_RES, {
      params: { path: att.filePath, permanently: true },
      headers: { Authorization: `OAuth ${this.TOKEN}` },
    });
    // и из БД
    await this.prisma.kanbanFile.delete({ where: { id: att.fileId } });
  }
}
