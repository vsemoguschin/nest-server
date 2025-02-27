import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Регистрирует событие аудита для сделки.
   *
   * @param dealId - ID сделки
   * @param action - Описание действия (например, "Статус изменён")
   * @param userId - (Опционально) ID пользователя, который совершил действие
   * @param comment - (Опционально) Дополнительный комментарий
   */
  async createDealAudit(
    dealId: number,
    action: string,
    userId?: number,
    comment?: string,
  ) {
    return this.prisma.dealAudit.create({
      data: {
        dealId,
        action,
        userId,
        comment,
      },
    });
  }
}
