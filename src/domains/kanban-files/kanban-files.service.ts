import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'node:path';
import { UserDto } from '../users/dto/user.dto';
import { FilesService } from '../files/files.service';
import {
  YandexDiskClient,
  YandexDiskResource,
} from 'src/integrations/yandex-disk/yandex-disk.client';

const YDS_ORDER = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

type UploadArgs = {
  userId: number;
  taskId: number;
  file: Express.Multer.File;
};

@Injectable()
export class KanbanFilesService {
  private readonly logger = new Logger(KanbanFilesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly yandexDisk: YandexDiskClient,
  ) {}

  /** Получить метаданные ресурса с Я.Диска (свежие) */
  async getFileOriginal(mimeType: string, path: string) {
    if (!mimeType) return '';
    const normalized = mimeType.toLowerCase();
    if (normalized === 'image/jpeg' || normalized === 'image/png') {
      const md = await this.yandexDisk.getResource(path, {
        fields: 'preview,sizes',
      });
      return this.pickPreview(md) ?? '';
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
    category: 'images' | 'pdf' | 'cdr' | 'psd' | 'ai' | 'archives';
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

    // PSD (Adobe Photoshop)
    if (
      ext === '.psd' ||
      mime === 'application/vnd.adobe.photoshop' ||
      mime === 'image/vnd.adobe.photoshop' ||
      mime === 'application/x-photoshop'
    ) {
      return { category: 'psd', ext: '.psd' };
    }

    // AI (Adobe Illustrator)
    if (
      ext === '.ai' ||
      mime === 'application/illustrator' ||
      mime === 'application/vnd.adobe.illustrator' ||
      mime === 'application/postscript'
    ) {
      return { category: 'ai', ext: '.ai' };
    }

    // Archives (zip/rar)
    if (
      ext === '.zip' ||
      ext === '.rar' ||
      mime === 'application/zip' ||
      mime === 'application/x-zip-compressed' ||
      mime === 'application/x-zip' ||
      mime === 'application/vnd.rar' ||
      mime === 'application/x-rar-compressed'
    ) {
      const resolvedExt =
        ext === '.zip' || ext === '.rar'
          ? ext
          : mime.includes('rar')
            ? '.rar'
            : '.zip';
      return { category: 'archives', ext: resolvedExt };
    }

    throw new BadRequestException(
      'Unsupported file type. Allowed: images, pdf, cdr, psd, ai, archives(zip/rar)',
    );
  }

  /** Загрузка файла в Я.Диск и возврат свежих метаданных */
  private async uploadToYandexDisk(params: {
    absPath: string;
    buffer: Buffer;
  }): Promise<YandexDiskResource> {
    return this.yandexDisk.uploadFile(params.absPath, {
      body: params.buffer,
      contentLength: params.buffer.length,
    });
  }

  /** Получить метаданные ресурса с Я.Диска (свежие) */
  private async getResourceMeta(absPath: string): Promise<YandexDiskResource> {
    return this.yandexDisk.getResource(absPath, {
      fields: 'name,path,size,mime_type,preview,sizes',
    });
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
    await this.yandexDisk.ensureFolder(absPath);
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
    await this.ensureFolder(`${boardFolder}/psd`);
    await this.ensureFolder(`${boardFolder}/ai`);
    await this.ensureFolder(`${boardFolder}/archives`);
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

    await this.ensureHierarchy(directory);
    this.logger.log(
      `Kanban upload start: taskId=${taskId}, userId=${userId}, path=${absPath}, size=${file.size ?? file.buffer?.length ?? 0}`,
    );

    const meta = await this.uploadToYandexDisk({
      absPath,
      buffer: file.buffer,
    });

    this.logger.log(
      `Kanban upload complete: taskId=${taskId}, userId=${userId}, path=${absPath}, size=${meta.size ?? file.size ?? 0}`,
    );

    const dbFile = await this.prisma.kanbanFile.create({
      data: {
        name: file.originalname || meta.name,
        ya_name: yaName,
        size: meta.size ?? file.size ?? 0,
        preview: this.pickPreview(meta) ?? '',
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
    return this.pickPreview(md, prefer);
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

  private async ensureHierarchy(directory: string): Promise<void> {
    const segments = directory.split('/').filter(Boolean);
    let current = 'EasyCRM';
    await this.yandexDisk.ensureFolder(current);
    for (const segment of segments) {
      current = `${current}/${segment}`;
      await this.yandexDisk.ensureFolder(current);
      this.logger.debug(`Kanban ensure folder: ${current}`);
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
}
