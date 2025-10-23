import {
  BadRequestException,
  ForbiddenException,
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

  async updateCommentText(id: number, userId: number, text: string) {
    const comment = await this.prisma.kanbanTaskComments.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        authorId: true,
        taskId: true,
        text: true,
        updatedAt: true,
      },
    });
    if (!comment) {
      throw new NotFoundException('Комментарий не найден');
    }
    if (comment.authorId !== userId) {
      throw new ForbiddenException('Только автор может редактировать комментарий');
    }

    const trimmed = (text ?? '').trim();
    if (!trimmed.length) {
      throw new BadRequestException('Текст комментария не может быть пустым');
    }

    if (trimmed === comment.text) {
      return {
        id: comment.id,
        text: comment.text,
        taskId: comment.taskId,
        updatedAt: comment.updatedAt,
      };
    }

    const updated = await this.prisma.kanbanTaskComments.update({
      where: { id },
      data: { text: trimmed },
      select: { id: true, text: true, taskId: true, updatedAt: true },
    });

    return updated;
  }

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
