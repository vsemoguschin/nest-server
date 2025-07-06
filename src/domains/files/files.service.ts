import axios from 'axios';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly YANDEX_DISK_API =
    'https://cloud-api.yandex.net/v1/disk/resources/upload';

  private readonly OAUTH_TOKEN = process.env.YA_TOKEN; // Замените на ваш OAuth-токен

  async uploadToYandexDisk(
    directory: string,
    fileBuffer: Buffer,
    ya_name: string,
    fileName: string,
  ): Promise<any> {
    try {
      const filePath = `EasyCRM/${directory}/${ya_name}`;

      // Шаг 1: Получаем ссылку для загрузки
      const uploadResponse = await axios.get(this.YANDEX_DISK_API, {
        params: { path: filePath, overwrite: true },
        headers: { Authorization: `OAuth ${this.OAUTH_TOKEN}` },
      });

      const uploadUrl = uploadResponse.data.href;

      // Шаг 2: Отправляем файл по полученной ссылке
      await axios.put(uploadUrl, fileBuffer, {
        headers: { 'Content-Type': 'application/octet-stream' },
      });

      let attempts = 0;
      let md = await axios.get(
        'https://cloud-api.yandex.net/v1/disk/resources',
        {
          params: {
            path: filePath,
          },
          headers: { Authorization: `OAuth ${this.OAUTH_TOKEN}` },
        },
      );

      while (attempts < 3) {
        md = await axios.get('https://cloud-api.yandex.net/v1/disk/resources', {
          params: {
            path: filePath,
          },
          headers: { Authorization: `OAuth ${this.OAUTH_TOKEN}` },
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

      return {
        name: fileName,
        ya_name,
        size: md.data.size,
        preview: md.data.sizes[0].url || '',
        directory,
        path: filePath,
      }; // Возвращаем публичную ссылку
    } catch (error) {
      console.error('Ошибка при загрузке файла на Яндекс.Диск:', error);
      throw error;
    }
  }

  async getFilePath(filePath: string): Promise<any> {
    try {
      const md = await axios.get(
        'https://cloud-api.yandex.net/v1/disk/resources',
        {
          params: {
            path: filePath,
          },
          headers: { Authorization: `OAuth ${process.env.YA_TOKEN}` },
        },
      );

      // console.log(md.data);

      return {
        preview: md.data.sizes[0].url || '',
      }; // Возвращаем публичную ссылку
    } catch (error) {
      console.error('Ошибка при загрузке файла на Яндекс.Диск:', error);
      throw error;
    }
  }

  async deleteFileFromYandexDisk(filePath: string): Promise<void> {
    try {
      await axios.delete('https://cloud-api.yandex.net/v1/disk/resources', {
        params: { path: filePath },
        headers: { Authorization: `OAuth ${this.OAUTH_TOKEN}` },
      });
    } catch (error) {
      console.error(
        `Ошибка при удалении файла с Яндекс.Диска: ${filePath}`,
        error,
      );
      throw error;
    }
  }
}
