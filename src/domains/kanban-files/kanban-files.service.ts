import axios from 'axios';
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'node:path';
import { UserDto } from '../users/dto/user.dto';
import { FilesService } from '../files/files.service';

const YDS_ORDER = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

type UploadArgs = {
  userId: number;
  taskId: number;
  file: Express.Multer.File;
};

@Injectable()
export class KanbanFilesService {
  private readonly YD_UPLOAD =
    'https://cloud-api.yandex.net/v1/disk/resources/upload';
  private readonly YD_RES = 'https://cloud-api.yandex.net/v1/disk/resources';
  private readonly TOKEN = process.env.YA_TOKEN as string; // обязателен
  private readonly API = 'https://cloud-api.yandex.net/v1/disk';
  private readonly headers = { Authorization: `OAuth ${process.env.YA_TOKEN}` };

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  /** Получить метаданные ресурса с Я.Диска (свежие) */
  async getFileOriginal(mimeType: string, path: string) {
    if (mimeType === 'image/jpeg' || mimeType === 'image/png') {
      const md = await axios.get(
        'https://cloud-api.yandex.net/v1/disk/resources',
        {
          params: { path },
          headers: {
            Authorization: `OAuth ${process.env.YA_TOKEN}`,
          },
        },
      );
      return md.data.sizes[0].url || '';
    }
    return '';
  }

  /** Проверяем доступ пользователя к доске */
  private async assertBoardAccess(userId: number, boardId: number) {
    const ok = await this.prisma.board.findFirst({
      where: {
        id: boardId,
        deletedAt: null,
        // users: { some: { id: userId } },
      },
      select: { id: true },
    });
    if (!ok) throw new ForbiddenException('Access denied to board');
  }

  /** Убеждаемся, что задача существует и принадлежит колонке/доске */
  private async assertTask(boardId: number, columnId: number, taskId: number) {
    const task = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, columnId, boardId, deletedAt: null },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');
  }

  /** Категория по mime/расширению и директория */
  private resolveCategory(file: Express.Multer.File): {
    category: 'images' | 'pdf' | 'cdr';
    ext: string;
  } {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = (path.extname(file.originalname) || '').toLowerCase();

    // images
    if (mime.startsWith('image/'))
      return { category: 'images', ext: ext || '.bin' };

    // pdf
    if (mime === 'application/pdf' || ext === '.pdf')
      return { category: 'pdf', ext: '.pdf' };

    // cdr (встречаются разные mime, ориентируемся и на расширение)
    if (
      ext === '.cdr' ||
      mime === 'application/vnd.corel-draw' ||
      mime === 'image/x-cdr' ||
      mime === 'application/x-coreldraw'
    ) {
      return { category: 'cdr', ext: '.cdr' };
    }

    throw new BadRequestException(
      'Unsupported file type. Allowed: images, pdf, cdr',
    );
  }

  /** Загрузка файла в Я.Диск и возврат свежих метаданных */
  private async uploadToYandexDisk(params: {
    absPath: string; // путь на диске (например EasyCRM/kanban/boards/1/images/uuid.ext)
    buffer: Buffer;
  }) {
    const { absPath, buffer } = params;

    // 1. Получить ссылку загрузки
    const up = await axios.get(this.YD_UPLOAD, {
      params: { path: absPath, overwrite: true },
      headers: { Authorization: `OAuth ${this.TOKEN}` },
    });
    const href = up.data.href;

    // 2. Загрузить файл
    await axios.put(href, buffer, {
      headers: { 'Content-Type': 'application/octet-stream' },
    });

    // 3. СВЕЖИЙ запрос метаданных (без циклов ожидания)
    let md = await axios.get(this.YD_RES, {
      params: {
        path: absPath,
        fields: 'name,path,size,mime_type,preview,resource_id,sha256,md5,sizes',
      },
      headers: { Authorization: `OAuth ${this.TOKEN}` },
    });
    let attempts = 0;
    while (attempts < 3) {
      md = await axios.get(this.YD_RES, {
        params: {
          path: absPath,
          fields:
            'name,path,size,mime_type,preview,resource_id,sha256,md5,sizes',
        },
        headers: { Authorization: `OAuth ${this.TOKEN}` },
      });

      if (md.data.sizes) {
        break; // Выходим из цикла, если получили sizes
      }

      attempts++;
      if (attempts < 3) {
        await new Promise((resolve) => setTimeout(resolve, 4000)); // Задержка 1 секунда перед следующей попыткой
      }
    }

    // console.log(md.data);

    return md.data as {
      name: string;
      path: string;
      size: number;
      mime_type?: string;
      preview?: string;
      sizes?: { url: string; name: string }[];
      resource_id?: string;
      sha256?: string;
      md5?: string;
    };
  }

  /** Получить метаданные ресурса с Я.Диска (свежие) */
  private async getResourceMeta(absPath: string) {
    const res = await axios.get(this.YD_RES, {
      params: {
        path: absPath,
        // сузим ответ — он и так большой
        fields: 'name,path,size,mime_type,preview,sizes',
      },
      headers: { Authorization: `OAuth ${this.TOKEN}` },
    });
    return res.data as {
      name: string;
      path: string;
      size?: number;
      mime_type?: string;
      preview?: string;
      sizes?: { url: string; name: string }[];
    };
  }

  /** Список вложений задачи */
  async listForTask(
    userId: number,
    boardId: number,
    columnId: number,
    taskId: number,
  ) {
    await this.assertBoardAccess(userId, boardId);
    await this.assertTask(boardId, columnId, taskId);

    const links = await this.prisma.kanbanTaskAttachment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        file: true,
      },
    });

    return links.map((l) => ({
      id: l.id,
      file: {
        id: l.file.id,
        name: l.file.name,
        path: l.file.path,
        preview: l.file.preview,
        size: l.file.size,
        mimeType: l.file.mimeType,
        directory: l.file.directory,
        ya_name: l.file.ya_name,
        createdAt: l.file.createdAt,
      },
    }));
  }



  /** Создать папку на Я.Диске (если уже есть — молча пропускаем) */
  private async ensureFolder(absPath: string) {
    try {
      await axios.put(this.YD_RES, null, {
        params: { path: absPath },
        headers: { Authorization: `OAuth ${this.TOKEN}` },
      });
    } catch (e: any) {
      // 409 = уже существует — это ок
      if (e?.response?.status === 409) return;
      throw e;
    }
  }

  /** Создать структуру папок для конкретной доски */
  async ensureBoardFolder(boardId: number) {
    const root = 'EasyCRM';
    const boardsRoot = `${root}/boards`;
    const boardFolder = `${boardsRoot}/${boardId}`;
    await this.ensureFolder(root);
    await this.ensureFolder(boardsRoot);
    await this.ensureFolder(boardFolder);
    // заранее подготовим категории
    await this.ensureFolder(`${boardFolder}/images`);
    await this.ensureFolder(`${boardFolder}/pdf`);
    await this.ensureFolder(`${boardFolder}/cdr`);
  }

  /** Загрузка и привязка к задаче */
  async uploadForTask(args: UploadArgs) {
    const { userId, taskId, file } = args;
    // await this.assertBoardAccess(userId, boardId);
    const task = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    // гарантируем структуру папок доски
    // await this.ensureBoardFolder(boardId);

    const { category, ext } = this.resolveCategory(file);
    const yaName = `${uuidv4()}${ext}`;
    const directory = `boards/${task.boardId}/${category}`; // ← ИЗМЕНИЛОСЬ
    const absPath = `EasyCRM/${directory}/${yaName}`; // ← ИЗМЕНИЛОСЬ

    const meta = await this.uploadToYandexDisk({
      absPath,
      buffer: file.buffer,
    });

    const dbFile = await this.prisma.kanbanFile.create({
      data: {
        name: file.originalname || meta.name,
        ya_name: yaName,
        size: meta.size ?? file.size ?? 0,
        preview: meta.preview || meta.sizes?.[0]?.url || '',
        directory, // boards/{id}/{cat}
        path: absPath, // EasyCRM/boards/{id}/{cat}/...
        mimeType: meta.mime_type || file.mimetype || null,
        uploadedById: userId,
      },
    });

    const link = await this.prisma.kanbanTaskAttachment.create({
      data: { taskId, fileId: dbFile.id },
      include: { file: true },
    });

    return {
      id: link.id,
      file: {
        id: dbFile.id,
        name: dbFile.name,
        path: dbFile.path,
        preview: dbFile.preview,
        size: dbFile.size,
        mimeType: dbFile.mimeType,
        directory: dbFile.directory,
        ya_name: dbFile.ya_name,
        createdAt: dbFile.createdAt,
      },
    };
  }
  /** Вернуть URL превью нужного размера по абсолютному пути файла на Я.Диске */
  async getPreviewSizeUrl(
    absPath: string,
    prefer: string = 'M',
  ): Promise<string | null> {
    const md = await this.getResourceMeta(absPath); // включает sizes и preview
    const sizes = Array.isArray(md.sizes) ? md.sizes : [];
    if (!sizes.length) return md.preview || null;

    // сортируем по известному порядку
    const sorted = [...sizes].sort((a, b) => {
      const ia = YDS_ORDER.indexOf((a.name || '').toUpperCase());
      const ib = YDS_ORDER.indexOf((b.name || '').toUpperCase());
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    // пробуем ровно prefer
    const exact = sorted.find(
      (s) => (s.name || '').toUpperCase() === prefer.toUpperCase(),
    );
    if (exact) return exact.url;

    // иначе берём «ближайший вверх» (покрупнее)
    const preferIdx = YDS_ORDER.indexOf(prefer.toUpperCase());
    if (preferIdx !== -1) {
      const up = sorted.find(
        (s) => YDS_ORDER.indexOf((s.name || '').toUpperCase()) >= preferIdx,
      );
      if (up) return up.url;
    }

    // совсем fallback — самый крупный
    return sorted[sorted.length - 1]?.url || md.preview || null;
  }

  async createLikeReview(
    file: Express.Multer.File,
    user: UserDto,
    taskId: number,
  ) {
    try {
      // Шаг 1: Загружаем файл на Яндекс.Диск

      // return console.log(filePath, file);
      // const filePath = `${userId}/${Date.now()}-${file.originalname}`;
      const task = await this.prisma.kanbanTask.findFirst({
        where: { id: taskId, deletedAt: null },
        select: { id: true, boardId: true },
      });
      if (!task) throw new NotFoundException('Task not found');

      const ya_name =
        `${Date.now()}-boardId${task.boardId}-taskId${taskId}.` +
        file.originalname.split('.')[file.originalname.split('.').length - 1];
      const newFile = await this.filesService.uploadToYandexDisk(
        `boards/${task.boardId}/images`, //в зависимости от формата файла вместо images может 'pdf' илт 'cdr'
        file.buffer,
        ya_name,
        file.originalname,
      );

      const dbFile = await this.prisma.kanbanFile.create({
        data: {
          ...newFile,

          uploadedById: user.id,
        },
      });

      const link = await this.prisma.kanbanTaskAttachment.create({
        data: { taskId, fileId: dbFile.id },
        include: { file: true },
      });

      return {
        id: link.id,
        file: {
          id: dbFile.id,
          name: dbFile.name,
          path: dbFile.path,
          preview: dbFile.preview,
          size: dbFile.size,
          mimeType: dbFile.mimeType,
          directory: dbFile.directory,
          ya_name: dbFile.ya_name,
          createdAt: dbFile.createdAt,
        },
      };
    } catch (error) {
      console.error('Ошибка при создании отзыва:', error);
      throw error;
    }
  }




}
