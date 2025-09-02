import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AttachmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureAttachment(attachmentId: number) {
    const att = await this.prisma.kanbanTaskAttachment.findFirst({
      where: { id: attachmentId },
      include: { file: true },
    });
    if (!att) throw new NotFoundException('Attachment not found');
    return att;
  }

  /** Определить категорию и расширение по mime/расширению */
  /**
   * Получает вложения по идентификатору задачи.
   * @param taskId - Идентификатор задачи
   * @returns Список вложений с файлами и данными создателя
   */
  async getAttachmentsByTaskId(taskId: number) {
    const exists = await this.prisma.kanbanTask.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, boardId: true },
    });
    if (!exists) throw new NotFoundException('Task not found');
    const attachments = await this.prisma.kanbanFile.findMany({
      where: {
        deletedAt: null,
        taskLinks: {
          some: {
            taskId,
          },
        },
      },
      include: {
        uploadedBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return attachments.map((file) => {
      return {
        id: file.id,
        name: file.name,
        path: file.path,
        preview: file.path,
        mimeType: file.mimeType,
        size: file.size,
        ya_name: file.ya_name,
        directory: file.directory,
        createdAt: file.createdAt,
        uploadedBy: {
          id: file.uploadedBy.id,
          fullName: file.uploadedBy.fullName,
        },
      };
    });
  }

  async create(taskId: number, fileId: number) {
    const att = await this.prisma.kanbanTaskAttachment.create({
      data: {
        taskId,
        fileId,
      },
    });
    return att;
  }

  /** Удалить вложение; если файл больше не используется — удалить с Я.Диска и из БД */
  async removeFromTask(att: { id: number, fileId: number }) {
    const file = await this.prisma.kanbanFile.findFirst({
      where: { id: att.id, deletedAt: null },
    });
    if (!file) throw new NotFoundException('Att not found');

    // удаляем связь
    await this.prisma.kanbanTaskAttachment.delete({
      where: { id: att.id },
    });

    // проверяем, остался ли файл где-то ещё прикреплён
    const stillUsed = await this.prisma.kanbanTaskAttachment.findFirst({
      where: { fileId: att.fileId },
      select: { id: true },
    });



    return stillUsed;
  }
}
