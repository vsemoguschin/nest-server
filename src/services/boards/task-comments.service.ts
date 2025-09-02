import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TaskCommentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Вывести комментарии задачи с файлами и автором */
  async listForTask(taskId: number) {
    const items = await this.prisma.kanbanTaskComments.findMany({
      where: { taskId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        files: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            preview: true,
            path: true,
            size: true,
            mimeType: true,
            file: true,
          },
        },
      },
    });

    // фронт принимает как есть
    return items;
  }

  /** Создать комментарий */
  async createForTask(taskId: number, authorId: number, text: string) {
    const t = (text ?? '').trim();

    const comment = await this.prisma.kanbanTaskComments.create({
      data: { taskId, authorId, text: t },
      select: { id: true, text: true },
    });

    return comment;
  }

  /**Проверить существование комментария */
  async ensureComment(commentId: number) {
    const comment = await this.prisma.kanbanTaskComments.findFirst({
      where: { id: commentId, deletedAt: null },
      select: {
        id: true,
        task: { select: { id: true, boardId: true } },
      },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }
}
