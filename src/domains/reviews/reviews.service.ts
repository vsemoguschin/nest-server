import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { UserDto } from '../users/dto/user.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  async createReview(
    userId: number,
    dealId: number,
    date: string,
    file: Express.Multer.File,
    user: UserDto,
  ) {
    try {
      // Шаг 1: Загружаем файл на Яндекс.Диск

      // return console.log(filePath, file);
      // const filePath = `${userId}/${Date.now()}-${file.originalname}`;

      const ya_name =
        `${Date.now()}-userId${userId}-dealId${dealId}.` +
        file.originalname.split('.')[file.originalname.split('.').length - 1];
      const newFile = await this.filesService.uploadToYandexDisk(
        'reviews',
        file.buffer,
        ya_name,
        file.originalname,
      );

      // Шаг 2: Сохраняем отзыв в базу данных
      const review = await this.prisma.review.create({
        data: {
          date,
          userId: +userId,
          dealId: +dealId,
        },
        include: {
          file: true,
        },
      });

      await this.prisma.file.create({
        data: {
          ...newFile,
          reviewId: review.id,
        },
      });

      // Формируем комментарий для аудита
      const auditComment = `Добавил отзыв`;

      // Создаем запись в аудите
      await this.prisma.dealAudit.create({
        data: {
          dealId: review.dealId,
          userId: user.id,
          action: 'Добавление отзыва',
          comment: auditComment,
        },
      });

      return review;
    } catch (error) {
      console.error('Ошибка при создании отзыва:', error);
      throw error;
    }
  }

  async deleteReview(reviewId: number, user: UserDto): Promise<void> {
    try {
      // Шаг 1: Найти отзыв и связанные файлы
      const review = await this.prisma.review.findUnique({
        where: { id: reviewId },
        include: { file: true }, // Включаем связанные файлы
      });

      if (!review) {
        throw new Error('Отзыв не найден');
      }

      // Шаг 2: Удалить файлы с Яндекс.Диска
      for (const file of review.file) {
        await this.filesService.deleteFileFromYandexDisk(file.path);
      }

      // Шаг 3: Удалить записи файлов из базы данных
      await this.prisma.file.deleteMany({
        where: { reviewId },
      });

      // Формируем комментарий для аудита
      const auditComment = `Удалил отзыв`;

      // Создаем запись в аудите
      await this.prisma.dealAudit.create({
        data: {
          dealId: review.dealId,
          userId: user.id,
          action: 'удаление отзыва',
          comment: auditComment,
        },
      });

      // Шаг 4: Удалить отзыв из базы данных
      await this.prisma.review.delete({
        where: { id: reviewId },
      });
    } catch (error) {
      console.error('Ошибка при удалении отзыва:', error);
      throw error;
    }
  }
}
