import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TaskFilesService } from 'src/services/boards/task-files.service';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskFiles: TaskFilesService,
  ) {}

  /**
   * Полное удаление комментария:
   * 1) Проверяем, что комментарий существует и собираем связанные файлы.
   * 2) В транзакции:
   *    - удаляем taskLinks по этим файлам,
   *    - удаляем записи файлов,
   *    - удаляем сам комментарий.
   * Без soft-delete — из БД удаляется навсегда.
   */
  async deleteComment(id: number) {
    const comment = await this.prisma.kanbanTaskComments.findUnique({
      where: { id },
      include: { files: { select: { id: true, name: true } } },
    });
    if (!comment) {
      throw new NotFoundException('Комментарий не найден');
    }

    const fileIds = comment.files.map((f) => f.id);

    try {
      if (fileIds.length) {
        const { deleted, failed } = await this.taskFiles.deleteFiles(fileIds);

        // если какие-то файлы не смогли удалиться на Я.Диске — дочистим их из БД, чтобы не было FK-блокировок
        if (failed.length) {
          const failedIds = failed.map((f) => f.id);
          await this.prisma.$transaction(async (tx) => {
            await tx.kanbanTaskAttachment.deleteMany({
              where: { fileId: { in: failedIds } },
            });
            await tx.kanbanFile.deleteMany({
              where: { id: { in: failedIds } },
            });
          });
          // Можно залогировать причины failed, если нужно:
          // this.logger.warn(`Не удалились на Я.Диске: ${JSON.stringify(failed)}`);
        }
      }

      // после того как файловые записи и связи очищены — удаляем комментарий
      await this.prisma.kanbanTaskComments.delete({ where: { id } });
      return comment;
    } catch (e) {
      throw new InternalServerErrorException('Ошибка при удалении комментария');
    }
  }
}
