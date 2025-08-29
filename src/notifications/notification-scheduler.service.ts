import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule'; // Импорт для cron
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from 'src/services/telegram.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService, // Инжектим существующий сервис
  ) {}

  // Метод, который будет запускаться по расписанию
  // @Cron('0 0 15,18,21,23 * * *')
  @Cron('0 59 14,17,20,23 * * *')
  async sendDailySummary() {
    this.logger.log('Starting daily data collection and notification...');

    try {
      const today = new Date().toISOString().slice(0, 10);

      const groups = await this.prisma.group.findMany({
        where: {
          workSpace: {
            department: 'COMMERCIAL',
          },
        },
        include: {
          deals: {
            where: {
              saleDate: {
                startsWith: today,
              },
              reservation: false,
            },
            include: {
              dops: true,
            },
          },
          adExpenses: {
            where: {
              date: {
                startsWith: today,
              },
            },
          },
        },
      });

      const msgs = groups.map((g) => {
        const projectName = g.title;
        const dealsSales = g.deals.reduce((a, b) => a + b.price, 0);
        const dopsSales = g.deals
          .flatMap((d) => d.dops)
          .reduce((a, b) => a + b.price, 0);
        const totalSales = dealsSales + dopsSales;
        const adExpenses = g.adExpenses.reduce((a, b) => a + b.price, 0);
        const text =
          `\n<u>${projectName}</u>\n` +
          `Сумма оформленных: ${totalSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽\n` +
          `<i> - Заказы: ${dealsSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
          `<i> - Допы: ${dopsSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n`;
        return totalSales > 0
          ? { totalSales, text }
          : { totalSales: 0, text: '' };
      });

      const totalSales = msgs.reduce((a, b) => a + b.totalSales, 0);

      // Формируем текст уведомления на основе собранных данных
      const summaryText =
        `<b>Ежедневный отчёт</b>\n` +
        `Общая сумма оформленных: <b>${totalSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</b>\n` +
        msgs.map((m) => m.text).join('');

      const chatId = 317401874;
      // await this.telegramService.sendToChat(chatId, summaryText);

      // Вариант 2: Если нужно уведомить конкретных пользователей (например, всех админов)
      const admins = [317401874, 368152093];
      for (const admin of admins) {
        await this.telegramService.sendToChat(admin, summaryText);
      }

      this.logger.log('Daily notification sent successfully');
    } catch (error) {
      this.logger.error(`Error in daily summary: ${error.message}`);
    }
  }
}
