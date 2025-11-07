import { Injectable, Logger } from '@nestjs/common';
import {
  YandexDiskClient,
  YandexDiskResource,
} from 'src/integrations/yandex-disk/yandex-disk.client';

export type UploadedFileRecord = {
  name: string;
  ya_name: string;
  size: number;
  preview: string;
  directory: string;
  path: string;
  mimeType: string;
};

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(private readonly yandexDisk: YandexDiskClient) {}

  async uploadToYandexDisk(
    directory: string,
    fileBuffer: Buffer,
    ya_name: string,
    fileName: string,
  ): Promise<UploadedFileRecord> {
    const baseFolder = 'EasyCRM';
    const relativeFolder = directory.replace(/^\/+|\/+$/g, '');
    const folderPath = `${baseFolder}/${relativeFolder}`;
    const resourcePath = `${folderPath}/${ya_name}`;

    await this.ensureHierarchy(folderPath);
    this.logger.log(
      `FilesService upload start: directory=${relativeFolder}, path=${resourcePath}, size=${fileBuffer.length}`,
    );

    const resource = await this.yandexDisk.uploadFile(resourcePath, {
      body: fileBuffer,
      contentLength: fileBuffer.length,
    });

    this.logger.log(
      `FilesService upload complete: path=${resourcePath}, resourceSize=${resource.size ?? fileBuffer.length}`,
    );

    return this.mapResourceToRecord({
      resource,
      directory: relativeFolder,
      fileName,
      yaName: ya_name,
      fallbackSize: fileBuffer?.length ?? 0,
      absPath: resourcePath,
    });
  }

  async getFilePath(filePath: string): Promise<{ preview: string }> {
    const resource = await this.yandexDisk.getResource(filePath, {
      fields: 'preview,sizes',
    });

    return {
      preview: this.pickPreview(resource) ?? '',
    };
  }

  async deleteFileFromYandexDisk(filePath: string): Promise<void> {
    try {
      await this.yandexDisk.deleteResource(filePath, true);
    } catch (error) {
      const trace = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Ошибка при удалении файла с Яндекс.Диска: ${filePath}`,
        trace,
      );
      throw error;
    }
  }

  private async ensureHierarchy(folderPath: string): Promise<void> {
    const segments = folderPath.split('/').filter(Boolean);
    let current = '';
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      this.logger.debug(`FilesService ensure folder: ${current}`);
      await this.yandexDisk.ensureFolder(current);
    }
  }

  private mapResourceToRecord(params: {
    resource: YandexDiskResource;
    directory: string;
    fileName: string;
    yaName: string;
    fallbackSize: number;
    absPath: string;
  }): UploadedFileRecord {
    const { resource, directory, fileName, yaName, fallbackSize, absPath } =
      params;
    return {
      name: fileName || resource.name || yaName,
      ya_name: yaName,
      size: resource.size ?? fallbackSize,
      preview: this.pickPreview(resource) ?? '',
      directory,
      path: absPath,
      mimeType: resource.mime_type || '',
    };
  }

  private pickPreview(resource: YandexDiskResource): string | undefined {
    const sizes = resource.sizes ?? [];
    if (sizes.length) {
      return sizes[0]?.url ?? resource.preview;
    }
    return resource.preview;
  }
}
