import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule'; // Импорт для cron
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from 'src/services/telegram.service';
import { BluesalesImportService } from '../integrations/bluesales/bluesales-import.service';
import { TbankSyncService } from '../services/tbank-sync.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);
  private readonly env = process.env.NODE_ENV as 'development' | 'production';
  private isTbankSyncRunning = false; // Защита от повторного выполнения T-Bank синхронизации
  private isCustomerImportRunning = false; // Защита от повторного выполнения импорта клиентов

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService, // Инжектим существующий сервис
    private readonly bluesalesImport: BluesalesImportService,
    private readonly tbankSync: TbankSyncService,
  ) {}

  private async notifyAdmins(text: string) {
    // Send only in production to avoid spam in dev
    if (this.env !== 'production') return;
    const adminIds = ['317401874'];
    for (const id of adminIds) {
      try {
        await this.telegramService.sendToChat(id, text);
      } catch (e: unknown) {
        this.logger.error(
          `Failed to notify ${id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  // Метод, который будет запускаться по расписанию
  // @Cron('0 0 15,18,21,23 * * *')
  @Cron('0 59 14,17,20,23 * * *')
  async sendDailySummary() {
    this.logger.log('Starting daily data collection and notification...');
    if (this.env === 'development') {
      this.logger.debug(`[dev] skip telegram`);
      return;
    }

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
        // const adExpenses = g.adExpenses.reduce((a, b) => a + b.price, 0);
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

      // const chatId = 317401874;
      // await this.telegramService.sendToChat(chatId, summaryText);

      // Вариант 2: Если нужно уведомить конкретных пользователей (например, всех админов)
      const admins = ['317401874', '368152093'];
      for (const admin of admins) {
        await this.telegramService.sendToChat(admin, summaryText);
      }

      this.logger.log('Daily notification sent successfully');
    } catch (error) {
      this.logger.error(`Error in daily summary: ${error.message}`);
    }
  }

  @Cron('0 59 11 * * *')
  //   @Cron('0 13 16 * * *')
  async sendMainDailySummary() {
    this.logger.log('Starting daily data collection and notification...');
    if (this.env === 'development') {
      this.logger.debug(`[dev] skip telegram`);
      return;
    }

    try {
      const yesterday = new Date(new Date().setDate(new Date().getDate() - 1))
        .toISOString()
        .slice(0, 10);

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
                startsWith: yesterday,
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
                startsWith: yesterday,
              },
            },
          },
        },
      });

      const msgs = groups
        .map((g) => {
          const projectName = g.title;
          const dealsSales = g.deals.reduce((a, b) => a + b.price, 0);
          const dopsSales = g.deals
            .flatMap((d) => d.dops)
            .reduce((a, b) => a + b.price, 0);
          const totalSales = dealsSales + dopsSales;
          const adExpenses = g.adExpenses.reduce((a, b) => a + b.price, 0);
          const drr = totalSales
            ? +((adExpenses / totalSales) * 100).toFixed(2)
            : 0;
          const text =
            `\n<u>${projectName}</u>\n` +
            `Сумма оформленных: ${totalSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽\n` +
            `<i> - Заказы: ${dealsSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
            `<i> - Допы: ${dopsSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
            `<i> - Расходы на рекламу: ${adExpenses.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
            `<i> - ДРР: ${drr}%\n</i>`;
          return totalSales > 0
            ? { totalSales, text, adExpenses }
            : { totalSales: 0, text: '', adExpenses: 0 };
        })
        .sort((a, b) => b.totalSales - a.totalSales);

      const totalSales = msgs.reduce((a, b) => a + b.totalSales, 0);
      const totalAdExpenses = msgs.reduce((a, b) => a + b.adExpenses, 0);
      const totalDRR = totalSales
        ? +((totalAdExpenses / totalSales) * 100).toFixed(2)
        : 0;

      // Формируем текст уведомления на основе собранных данных
      const summaryText =
        `<b>Подробный отчет за вчерашний день</b>\n` +
        `Общая сумма оформленных: <b>${totalSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</b>\n` +
        `Общие расходы на рекламу: <b>${totalAdExpenses.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</b>\n` +
        `ДРР: <b>${totalDRR}%</b>\n` +
        msgs.map((m) => m.text).join('');
      console.log(summaryText);

      // const chatId = 317401874;
      // await this.telegramService.sendToChat(chatId, summaryText);

      // Вариант 2: Если нужно уведомить конкретных пользователей (например, всех админов)
      const admins = ['317401874', '368152093'];
      // const admins = [317401874];
      for (const admin of admins) {
        await this.telegramService.sendToChat(admin, summaryText);
      }

      this.logger.log('Daily notification sent successfully');
    } catch (error) {
      this.logger.error(`Error in daily summary: ${error.message}`);
    }
  }

  // @Cron('*/5 * * * * *')
  // async test() {
  //   if (this.env === 'development') {
  //     return console.log('dev');
  //   }
  //   console.log('prod');
  // }

  // Импорт «только новых клиентов» за прошедший день, с надёжным восстановлением пропущенных дат
  @Cron('5 0 3 * * *', { timeZone: 'Europe/Moscow' })
  async importNewCustomersDaily() {
    // Защита от повторного выполнения
    if (this.isCustomerImportRunning) {
      this.logger.warn(
        '[Customer Import] Import is already running, skipping...',
      );
      return;
    }

    this.isCustomerImportRunning = true;
    const startTime = new Date();

    try {
      this.logger.log(
        `[Customer Import] Starting import at ${startTime.toISOString()}`,
      );

      if (this.env === 'development') {
        this.logger.debug(`[dev] skip importNewCustomersDaily`);
        return;
      }

      const key = 'dailyCustomers';
      const ymdInMoscow = (d: Date) =>
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Moscow',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d);
      const addDaysYmd = (ymd: string, days: number) => {
        const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
        const dt = new Date(Date.UTC(y, m - 1, d));
        dt.setUTCDate(dt.getUTCDate() + days);
        const y2 = dt.getUTCFullYear();
        const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const d2 = String(dt.getUTCDate()).padStart(2, '0');
        return `${y2}-${m2}-${d2}`;
      };

      this.logger.log('[dailyCustomers] Start daily customers import');
      await this.notifyAdmins('▶️ Старт ежедневного импорта клиентов');
      // вчера по Москве
      const now = new Date();
      const todayMsk = ymdInMoscow(now);
      const yesterdayMsk = addDaysYmd(todayMsk, -1);
      const header = `[dailyCustomers] Today MSK=${todayMsk}, yesterday MSK=${yesterdayMsk}`;
      this.logger.log(header);
      await this.notifyAdmins(
        `🕒 Даты: сегодня ${todayMsk}, вчера ${yesterdayMsk}`,
      );

      let state = await this.prisma.crmSyncState.findUnique({ where: { key } });
      const stateMsg = `[dailyCustomers] Current state: lastDailyImportDate=${state?.lastDailyImportDate || 'none'}`;
      this.logger.log(stateMsg);

      // Если нет состояния — импортируем только вчерашний день
      const startDate = state?.lastDailyImportDate
        ? addDaysYmd(state.lastDailyImportDate, 1)
        : yesterdayMsk;

      // Нечего импортировать
      if (startDate > yesterdayMsk) {
        this.logger.log(
          `[dailyCustomers] Nothing to import: startDate=${startDate} > yesterday=${yesterdayMsk}`,
        );
        await this.notifyAdmins(
          `ℹ️ Нет данных для импорта: старт ${startDate} > вчера ${yesterdayMsk}`,
        );
        return;
      }

      // Идём по дням до вчера включительно
      let cur = startDate;
      const failedDays: string[] = [];
      let successCount = 0;

      while (cur <= yesterdayMsk) {
        this.logger.log(`[dailyCustomers] Importing day ${cur}...`);
        await this.notifyAdmins(`⬇️ Импорт дня ${cur}...`);

        let dayImported = false;
        let retryCount = 0;
        const maxRetries = 3;

        while (!dayImported && retryCount < maxRetries) {
          try {
            await this.bluesalesImport.importDay(cur);
            this.logger.log(
              `[dailyCustomers] Day ${cur} import complete, updating sync state...`,
            );
            await this.notifyAdmins(`✅ Импорт дня ${cur} завершён`);
            successCount++;
            dayImported = true;
          } catch (e: unknown) {
            retryCount++;
            this.logger.error(
              `[dailyCustomers] Failed to import day ${cur} (attempt ${retryCount}/${maxRetries}): ${e instanceof Error ? e.message : e}`,
            );
            await this.notifyAdmins(
              `❌ Ошибка импорта ${cur} (попытка ${retryCount}/${maxRetries}): ${e instanceof Error ? e.message : e}`,
            );

            // Если это критическая ошибка (например, проблемы с API), прерываем
            if (e instanceof Error && e.message.includes('status code 500')) {
              this.logger.error(
                `[dailyCustomers] Critical error for day ${cur}, stopping import`,
              );
              await this.notifyAdmins(
                `🔥 Критическая ошибка для ${cur}, остановка импорта`,
              );
              failedDays.push(cur);
              break;
            }

            // Если исчерпаны попытки, добавляем в неудачные
            if (retryCount >= maxRetries) {
              this.logger.error(
                `[dailyCustomers] Max retries reached for day ${cur}, marking as failed`,
              );
              await this.notifyAdmins(
                `⚠️ Исчерпаны попытки для дня ${cur}, помечаем как неудачный`,
              );
              failedDays.push(cur);
              break;
            }

            // Ждем перед повторной попыткой
            if (retryCount < maxRetries) {
              this.logger.warn(
                `[dailyCustomers] Retrying day ${cur} in 5 seconds...`,
              );
              await this.notifyAdmins(
                `🔄 Повторная попытка для дня ${cur} через 5 сек...`,
              );
              await new Promise((resolve) => setTimeout(resolve, 5000));
            }
          }
        }

        // Обновляем прогресс только при успешном импорте
        if (dayImported) {
          state = await this.prisma.crmSyncState.upsert({
            where: { key },
            update: { lastDailyImportDate: cur },
            create: { key, lastDailyImportDate: cur },
          });
          const savedMsg = `[dailyCustomers] Sync state saved: lastDailyImportDate=${state.lastDailyImportDate}`;
          this.logger.log(savedMsg);
          await this.notifyAdmins(
            `💾 Обновлено состояние: ${state.lastDailyImportDate}`,
          );
        } else {
          this.logger.warn(
            `[dailyCustomers] Day ${cur} failed, not updating sync state`,
          );
          await this.notifyAdmins(
            `⚠️ День ${cur} не удался, состояние не обновлено`,
          );
          // Если день не удался, останавливаем импорт
          break;
        }

        cur = addDaysYmd(cur, 1);
      }

      // Формируем итоговое сообщение
      const totalDays = failedDays.length + successCount;
      let doneMsg = `Daily customers import completed. Success: ${successCount}/${totalDays}`;
      if (failedDays.length > 0) {
        doneMsg += `, Failed: ${failedDays.join(', ')}`;
      }
      doneMsg += `. Last processed: ${state?.lastDailyImportDate}`;

      this.logger.log(doneMsg);

      let notifyMsg = `🏁 Импорт завершён. Успешно: ${successCount}/${totalDays}`;
      if (failedDays.length > 0) {
        notifyMsg += `, Ошибки: ${failedDays.join(', ')}`;
      }
      notifyMsg += `. Последняя дата: ${state?.lastDailyImportDate}`;

      await this.notifyAdmins(notifyMsg);

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      this.logger.log(`[Customer Import] Import completed in ${duration}ms`);
    } catch (e: unknown) {
      this.logger.error(
        `Daily customers import failed: ${e instanceof Error ? e.message : e}`,
      );
      await this.notifyAdmins(
        `🔥 Ежедневный импорт упал: ${e instanceof Error ? e.message : e}`,
      );
    } finally {
      this.isCustomerImportRunning = false;
    }
  }

  // Автоматическая архивация задач старше 5 дней на заданных досках
  // Сейчас — только для boardId=3
  @Cron('0 10 3 * * *', { timeZone: 'Europe/Moscow' })
  async autoArchiveOldTasks() {
    try {
      const BOARD_IDS = [3];
      const DAYS = 5;
      const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

      const res = await this.prisma.kanbanTask.updateMany({
        where: {
          deletedAt: null,
          archived: false,
          updatedAt: { lt: cutoff },
          boardId: { in: BOARD_IDS },
        },
        data: { archived: true },
      });
      this.logger.log(
        `[autoArchiveOldTasks] cutoff=${cutoff.toISOString()} archived=${res.count} on boards=${BOARD_IDS.join(',')}`,
      );
    } catch (e: unknown) {
      this.logger.error(
        `[autoArchiveOldTasks] failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Автоматическая синхронизация операций Т-Банка каждый час с 8 утра до полуночи
  @Cron('0 0 8-23 * * *', { timeZone: 'Europe/Moscow' })
  async syncTbankOperations() {
    // Защита от повторного выполнения
    if (this.isTbankSyncRunning) {
      this.logger.warn('[T-Bank] Sync is already running, skipping...');
      return;
    }

    this.isTbankSyncRunning = true;
    const startTime = new Date();

    try {
      this.logger.log(
        `[T-Bank] Starting operations sync at ${startTime.toISOString()}`,
      );

      if (this.env === 'development') {
        this.logger.debug(`[dev] skip T-Bank sync`);
        return;
      }

      // Используем текущую дату как fromDate
      const fromDate = new Date().toISOString().split('T')[0];
      const toDate = fromDate; // Синхронизируем только текущий день

      this.logger.log(`Синхронизация операций с ${fromDate} по ${toDate}`);

      // Вызываем сервис синхронизации
      await this.tbankSync.syncOperations(fromDate, toDate);

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      this.logger.log(
        `[T-Bank] Operations sync completed successfully in ${duration}ms`,
      );
    } catch (error) {
      this.logger.error(`Error in T-Bank sync: ${error.message}`);
      await this.notifyAdmins(
        `🔥 Синхронизация Т-Банка упала: ${error.message}`,
      );
    } finally {
      this.isTbankSyncRunning = false;
    }
  }
}
