import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule'; // Импорт для cron
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from 'src/services/telegram.service';
import { BluesalesImportService } from '../integrations/bluesales/bluesales-import.service';
import { TbankSyncService } from '../services/tbank-sync.service';
import { PnlService } from 'src/domains/pnl/pnl.service';
import { DeliveriesService } from 'src/domains/deliveries/deliveries.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);
  private readonly env = process.env.NODE_ENV as 'development' | 'production';
  private isTbankSyncRunning = false; // Защита от повторного выполнения T-Bank синхронизации
  private isCustomerImportRunning = false; // Защита от повторного выполнения импорта клиентов
  private isPositionNormalizationRunning = false; // Защита от повторного выполнения нормализации позиций
  private isVkAdsExpenseSyncRunning = false; // Защита от повторного выполнения синхронизации расходов VK Ads
  private isPnlSnapshotRunning = false; // Защита от повторного выполнения сборки PNL снапшотов
  private isCheckRegistersRunning = false; // Защита от повторного выполнения checkRegisters

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService, // Инжектим существующий сервис
    private readonly bluesalesImport: BluesalesImportService,
    private readonly tbankSync: TbankSyncService,
    private readonly pnlService: PnlService,
    private readonly deliveriesService: DeliveriesService,
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

  private async withAdvisoryLock<T>(
    key1: number,
    key2: number,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const lockId = (BigInt(key1) << 32n) + BigInt(key2);
    const locked = await this.prisma.$queryRaw<
      Array<{ locked: boolean }>
    >`SELECT pg_try_advisory_lock(${lockId}) as locked`;

    if (!locked?.[0]?.locked) return null;

    try {
      return await fn();
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})`;
    }
  }

  private ymInMoscow(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
    }).format(d);
  }

  private ymdInMoscow(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  private addDaysYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    const y2 = dt.getUTCFullYear();
    const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d2 = String(dt.getUTCDate()).padStart(2, '0');
    return `${y2}-${m2}-${d2}`;
  }

  private addMonthsYm(ym: string, months: number): string {
    const [y, m] = ym.split('-').map((v) => parseInt(v, 10));
    const dt = new Date(Date.UTC(y, m - 1, 1));
    dt.setUTCMonth(dt.getUTCMonth() + months);
    const y2 = dt.getUTCFullYear();
    const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0');
    return `${y2}-${m2}`;
  }

  private async upsertPnlSnapshot(
    type: 'neon' | 'book',
    anchorPeriod: string,
    payload: unknown,
    version = 1,
  ) {
    const payloadJson = JSON.stringify(payload);
    await this.prisma.$executeRaw`
      INSERT INTO "PnlSnapshot" ("type","anchorPeriod","payload","version","computedAt","createdAt","updatedAt")
      VALUES (${type}, ${anchorPeriod}, ${payloadJson}::jsonb, ${version}, now(), now(), now())
      ON CONFLICT ("type","anchorPeriod")
      DO UPDATE SET
        "payload" = EXCLUDED."payload",
        "version" = EXCLUDED."version",
        "computedAt" = EXCLUDED."computedAt",
        "updatedAt" = now()
    `;
  }

  @Cron('0 0 22 * * *', { timeZone: 'Europe/Moscow' })
  async collectPnlSnapshotsDaily() {
    if (this.env === 'development') {
      this.logger.debug(`[dev] skip collectPnlSnapshotsDaily`);
      return;
    }

    if (this.isPnlSnapshotRunning) {
      this.logger.warn('[PNL Snapshot] Job is already running, skipping...');
      return;
    }

    this.isPnlSnapshotRunning = true;
    const startedAt = Date.now();

    try {
      const currentPeriod = this.ymInMoscow(new Date());
      const previousPeriod = this.addMonthsYm(currentPeriod, -1);

      const lockResult = await this.withAdvisoryLock(2025, 2200, async () => {
        const jobs: Array<{ type: 'neon' | 'book'; period: string }> = [
          { type: 'neon', period: currentPeriod },
          { type: 'book', period: currentPeriod },
          { type: 'neon', period: previousPeriod },
          { type: 'book', period: previousPeriod },
        ];

        this.logger.log(
          `[PNL Snapshot] Start: periods=${currentPeriod},${previousPeriod}`,
        );

        for (const job of jobs) {
          const oneStartedAt = Date.now();
          try {
            const payload =
              job.type === 'neon'
                ? await this.pnlService.getNeonPLDatas(job.period)
                : await this.pnlService.getBookPLDatas(job.period);

            await this.upsertPnlSnapshot(job.type, job.period, payload, 1);

            this.logger.log(
              `[PNL Snapshot] Saved ${job.type} ${job.period} in ${Date.now() - oneStartedAt}ms`,
            );
          } catch (e: unknown) {
            this.logger.error(
              `[PNL Snapshot] Failed ${job.type} ${job.period}: ${e instanceof Error ? e.message : e}`,
            );
          }
        }
      });

      if (lockResult === null) {
        this.logger.warn(
          '[PNL Snapshot] Another instance holds the lock, skipping...',
        );
      }
    } finally {
      this.isPnlSnapshotRunning = false;
      this.logger.log(`[PNL Snapshot] Done in ${Date.now() - startedAt}ms`);
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
      // const today = '2025-12-12';
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
              deletedAt: null,
              status: {
                not: 'Возврат',
              },
            },
            // include: {
            // },
          },
          dops: {
            where: {
              saleDate: today,
              deal: {
                reservation: false,
                deletedAt: null,
                status: {
                  not: 'Возврат',
                },
              },
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

      const sendDeliveries = await this.prisma.delivery.findMany({
        where: {
          date: today,
          deal: {
            status: { not: 'Возврат' },
            reservation: false,
            deletedAt: null,
          },
        },
        include: {
          deal: {
            include: {
              dops: true,
            },
          },
        },
      });

      const msgs = groups.map((g) => {
        const projectName = g.title;
        const dealsSales = g.deals.reduce((a, b) => a + b.price, 0);
        const dopsSales = g.dops.reduce((a, b) => a + b.price, 0);
        const totalSales = dealsSales + dopsSales;

        const sendDeliveriesPrice = sendDeliveries
          .filter((d) => d.deal.groupId === g.id)
          .reduce(
            (acc, d) =>
              acc +
              (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
            0,
          );

        const text =
          `\n<u>${projectName}</u>\n` +
          `Сумма оформленных: ${totalSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽\n` +
          `<i> - Заказы: ${dealsSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
          `<i> - Допы: ${dopsSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
          `Сумма отправленных: ${sendDeliveriesPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽\n`;
        return totalSales > 0 || sendDeliveriesPrice > 0
          ? { totalSales, text }
          : { totalSales: 0, text: '' };
      });

      const totalSales = msgs.reduce((a, b) => a + b.totalSales, 0);

      const reportsPerm = await this.prisma.masterReport.findMany({
        where: {
          date: today,
          user: {
            groupId: 12,
          },
        },
      });
      const reportsSPB = await this.prisma.masterReport.findMany({
        where: {
          date: today,
          user: {
            groupId: 6,
          },
        },
      });

      const totalElementsPerm = reportsPerm.reduce((a, b) => a + b.els, 0);
      const totalElementsSPB = reportsSPB.reduce((a, b) => a + b.els, 0);

      const prodInfo =
        `<b>Производство</b>\n` +
        `Элементы: ${totalElementsPerm + totalElementsSPB}\n` +
        `- Пермь: ${totalElementsPerm}\n` +
        `- СПБ: ${totalElementsSPB}`;

      const sendDeliveriesPrice = sendDeliveries.reduce(
        (acc, d) =>
          acc + (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
        0,
      );

      const payments = await this.prisma.payment.findMany({
        where: {
          date: today,
          deal: {
            reservation: false,
            deletedAt: null,
            status: { not: 'Возврат' },
          },
        },
      });

      const fact = payments.reduce((acc, p) => acc + p.price, 0);

      // Формируем текст уведомления на основе собранных данных
      const summaryText =
        `<b>Ежедневный отчёт</b>\n` +
        `Общая сумма оформленных: <b>${totalSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</b>\n` +
        `<i>Сумма отправленных: ${sendDeliveriesPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
        // `<i>Всего оформлено за месяц: ${monthSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
        // `<i>Темп: ${temp.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
        `<i>Выручка общая: ${fact.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
        msgs.map((m) => m.text).join('') +
        '\n' +
        prodInfo;

      // const chatId = 317401874;
      // await this.telegramService.sendToChat(chatId, summaryText);

      // Вариант 2: Если нужно уведомить конкретных пользователей (например, всех админов)
      // const admins = ['317401874'];
      const admins = ['317401874', '368152093'];
      for (const admin of admins) {
        await this.telegramService.sendToChat(admin, summaryText);
      }

      this.logger.log('Daily notification sent successfully');
    } catch (error) {
      this.logger.error(`Error in daily summary: ${error.message}`);
    }
  }

  @Cron('0 58 11 * * *')
  // @Cron('20 22 16 * * *')
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
      // const yesterday = '2025-12-12';
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
          },
          dops: {
            where: {
              saleDate: yesterday,
              deal: {
                reservation: false,
                deletedAt: null,
                status: {
                  not: 'Возврат',
                },
              },
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

      const sendDeliveries = await this.prisma.delivery.findMany({
        where: {
          date: yesterday,
          deal: {
            status: { not: 'Возврат' },
            reservation: false,
            deletedAt: null,
          },
        },
        include: {
          deal: {
            include: {
              dops: true,
            },
          },
        },
      });

      const managersReports = await this.prisma.managerReport.findMany({
        where: {
          date: yesterday,
        },
        include: {
          user: {
            select: {
              groupId: true,
            },
          },
        },
      });

      const payments = await this.prisma.payment.findMany({
        where: {
          date: yesterday,
          deal: {
            reservation: false,
            deletedAt: null,
            status: { not: 'Возврат' },
          },
        },
        include: {
          deal: { select: { groupId: true } },
        },
      });

      const fact = payments.reduce((acc, p) => acc + p.price, 0);

      const msgs = groups
        .map((g) => {
          const projectName = g.title;
          const dealsSales = g.deals.reduce((a, b) => a + b.price, 0);
          const dopsSales = g.dops.reduce((a, b) => a + b.price, 0);
          const totalSales = dealsSales + dopsSales;
          const adExpenses = g.adExpenses.reduce((a, b) => a + b.price, 0);
          const drr = totalSales
            ? +((adExpenses / totalSales) * 100).toFixed(2)
            : 0;

          const dealsAmount = g.deals.length;

          const sendDeliveriesPrice = sendDeliveries
            .filter((d) => d.deal.groupId === g.id)
            .reduce(
              (acc, d) =>
                acc +
                (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
              0,
            );

          const calls = managersReports
            .filter((r) => r.user.groupId === g.id)
            .reduce((a, b) => a + b.calls, 0);
          const conversionDealsToCalls = calls
            ? +((dealsAmount / calls) * 100).toFixed(2)
            : 0;

          const groupPayments = payments.filter((p) => p.deal.groupId === g.id);
          const fact = groupPayments.reduce((a, b) => a + b.price, 0);
          const text =
            `\n<u>${projectName}</u>\n` +
            `Сумма оформленных: ${totalSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽\n` +
            `<i> - Заказы: ${dealsSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
            `<i> - Допы: ${dopsSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
            `Сумма отправленных: ${sendDeliveriesPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽\n` +
            `Выручка: ${fact.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽\n` +
            `<i> Расходы на рекламу: ${adExpenses.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
            `<i> ДРР: ${drr}%\n</i>` +
            `<i> Заявки: ${calls}\n</i>` +
            `<i> % из заявки в продажу: ${conversionDealsToCalls}%\n</i>`;
          return totalSales > 0 ||
            sendDeliveriesPrice > 0 ||
            adExpenses > 0 ||
            calls > 0
            ? { totalSales, text, adExpenses }
            : { totalSales: 0, text: '', adExpenses: 0 };
        })
        .sort((a, b) => b.totalSales - a.totalSales);

      const totalSales = msgs.reduce((a, b) => a + b.totalSales, 0);
      const totalAdExpenses = msgs.reduce((a, b) => a + b.adExpenses, 0);
      const totalDRR = totalSales
        ? +((totalAdExpenses / totalSales) * 100).toFixed(2)
        : 0;

      const reportsPerm = await this.prisma.masterReport.findMany({
        where: {
          date: yesterday,
          user: {
            groupId: 12,
          },
        },
      });
      const reportsSPB = await this.prisma.masterReport.findMany({
        where: {
          date: yesterday,
          user: {
            groupId: 6,
          },
        },
      });

      const totalElementsPerm = reportsPerm.reduce((a, b) => a + b.els, 0);
      const totalElementsSPB = reportsSPB.reduce((a, b) => a + b.els, 0);
      const sendDeliveriesPrice = sendDeliveries.reduce(
        (acc, d) =>
          acc + (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
        0,
      );

      const prodInfo =
        `<b>Производство</b>\n` +
        `Элементы: ${totalElementsPerm + totalElementsSPB}\n` +
        `<i>- Пермь: ${totalElementsPerm}</i>\n` +
        `<i>- СПБ: ${totalElementsSPB}</i>`;

      const dealsAmount = groups.flatMap((g) => g.deals).length;

      const calls = managersReports.reduce((a, b) => a + b.calls, 0);
      const conversionDealsToCalls = calls
        ? +((dealsAmount / calls) * 100).toFixed(2)
        : 0;

      // Формируем текст уведомления на основе собранных данных
      const summaryText =
        `<b>Подробный отчет за вчерашний день</b>\n` +
        `Общая сумма оформленных: <b>${totalSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</b>\n` +
        `Общие расходы на рекламу: <b>${totalAdExpenses.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</b>\n` +
        `ДРР: <b>${totalDRR}%</b>\n` +
        `Сумма отправленых: <b>${sendDeliveriesPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</b>\n` +
        `Выручка общая: <b>${fact.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</b>\n` +
        `Заявки: <b>${calls}</b>\n` +
        `Сделки: <b>${dealsAmount}</b>\n` +
        `% из заявки в продажу: <b>${conversionDealsToCalls}%</b>\n` +
        msgs.map((m) => m.text).join('') +
        '\n' +
        prodInfo;

      // const chatId = 317401874;
      // await this.telegramService.sendToChat(chatId, summaryText);

      // Вариант 2: Если нужно уведомить конкретных пользователей (например, всех админов)
      const admins = ['317401874', '368152093'];
      // const admins = ['317401874'];
      for (const admin of admins) {
        await this.telegramService.sendToChat(admin, summaryText);
      }

      this.logger.log('Daily notification sent successfully');
    } catch (error) {
      this.logger.error(`Error in daily summary: ${error.message}`);
    }
  }
  // @Cron('0 59 11 * * *')
  @Cron('30 59 23 * * *')
  async sendMonthSummary() {
    this.logger.log('Starting daily data collection and notification...');
    if (this.env === 'development') {
      this.logger.debug(`[dev] skip telegram`);
      return;
    }

    try {
      const thisPeriod = new Date(new Date().setDate(new Date().getDate() - 1))
        .toISOString()
        .slice(0, 7);
      // const thisPeriod = '2025-12-12';
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
                startsWith: thisPeriod,
              },
              reservation: false,
            },
          },
          dops: {
            where: {
              saleDate: { startsWith: thisPeriod },
              deal: {
                reservation: false,
                deletedAt: null,
                status: {
                  not: 'Возврат',
                },
              },
            },
          },
          adExpenses: {
            where: {
              date: {
                startsWith: thisPeriod,
              },
            },
          },
        },
      });

      const sendDeliveries = await this.prisma.delivery.findMany({
        where: {
          date: { startsWith: thisPeriod },
          deal: {
            status: { not: 'Возврат' },
            reservation: false,
            deletedAt: null,
          },
        },
        include: {
          deal: {
            include: {
              dops: true,
            },
          },
        },
      });

      const managersReports = await this.prisma.managerReport.findMany({
        where: {
          date: { startsWith: thisPeriod },
        },
        include: {
          user: {
            select: {
              groupId: true,
            },
          },
        },
      });

      const payments = await this.prisma.payment.findMany({
        where: {
          date: { startsWith: thisPeriod },
          deal: {
            reservation: false,
            deletedAt: null,
            status: { not: 'Возврат' },
          },
        },
        include: {
          deal: { select: { groupId: true } },
        },
      });

      const fact = payments.reduce((acc, p) => acc + p.price, 0);

      function getDaysInMonth(year: number, month: number): number {
        return new Date(year, month, 0).getDate();
      }

      const daysInMonth = getDaysInMonth(
        +thisPeriod.split('-')[0],
        +thisPeriod.split('-')[1],
      );
      const isThismounth =
        thisPeriod.split('-')[1] === new Date().toISOString().slice(5, 7);
      const todayDay = isThismounth
        ? new Date().toISOString().slice(8, 10)
        : daysInMonth;

      const msgs = groups
        .map((g) => {
          const projectName = g.title;
          const dealsSales = g.deals.reduce((a, b) => a + b.price, 0);
          const dopsSales = g.dops.reduce((a, b) => a + b.price, 0);
          const totalSales = dealsSales + dopsSales;
          const adExpenses = g.adExpenses.reduce((a, b) => a + b.price, 0);
          const drr = totalSales
            ? +((adExpenses / totalSales) * 100).toFixed(2)
            : 0;

          const dealsAmount = g.deals.length;

          const sendDeliveriesPrice = sendDeliveries
            .filter((d) => d.deal.groupId === g.id)
            .reduce(
              (acc, d) =>
                acc +
                (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
              0,
            );

          const calls = managersReports
            .filter((r) => r.user.groupId === g.id)
            .reduce((a, b) => a + b.calls, 0);
          const conversionDealsToCalls = calls
            ? +((dealsAmount / calls) * 100).toFixed(2)
            : 0;

          const groupPayments = payments.filter((p) => p.deal.groupId === g.id);
          const fact = groupPayments.reduce((a, b) => a + b.price, 0);
          const temp = +((totalSales / +todayDay) * daysInMonth).toFixed();

          const text =
            `\n<u>${projectName}</u>\n` +
            `Сумма оформленных: ${totalSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽\n` +
            `<i> - Заказы: ${dealsSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
            `<i> - Допы: ${dopsSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
            `Темп: ${temp.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽\n` +
            `Сумма отправленных: ${sendDeliveriesPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽\n` +
            `Выручка: ${fact.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽\n` +
            `<i> Расходы на рекламу: ${adExpenses.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</i>\n` +
            `<i> ДРР: ${drr}%\n</i>` +
            `<i> Заявки: ${calls}\n</i>` +
            `<i> % из заявки в продажу: ${conversionDealsToCalls}%\n</i>`;
          return totalSales > 0 ||
            sendDeliveriesPrice > 0 ||
            adExpenses > 0 ||
            calls > 0
            ? { totalSales, text, adExpenses }
            : { totalSales: 0, text: '', adExpenses: 0 };
        })
        .sort((a, b) => b.totalSales - a.totalSales);

      const totalSales = msgs.reduce((a, b) => a + b.totalSales, 0);
      const totalAdExpenses = msgs.reduce((a, b) => a + b.adExpenses, 0);
      const totalDRR = totalSales
        ? +((totalAdExpenses / totalSales) * 100).toFixed(2)
        : 0;

      const reportsPerm = await this.prisma.masterReport.findMany({
        where: {
          date: { startsWith: thisPeriod },
          user: {
            groupId: 12,
          },
        },
      });
      const reportsSPB = await this.prisma.masterReport.findMany({
        where: {
          date: { startsWith: thisPeriod },
          user: {
            groupId: 6,
          },
        },
      });

      const totalElementsPerm = reportsPerm.reduce((a, b) => a + b.els, 0);
      const totalElementsSPB = reportsSPB.reduce((a, b) => a + b.els, 0);
      const sendDeliveriesPrice = sendDeliveries.reduce(
        (acc, d) =>
          acc + (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
        0,
      );

      const prodInfo =
        `<b>Производство</b>\n` +
        `Элементы: ${totalElementsPerm + totalElementsSPB}\n` +
        `<i>- Пермь: ${totalElementsPerm}</i>\n` +
        `<i>- СПБ: ${totalElementsSPB}</i>`;

      const dealsAmount = groups.flatMap((g) => g.deals).length;

      const calls = managersReports.reduce((a, b) => a + b.calls, 0);
      const conversionDealsToCalls = calls
        ? +((dealsAmount / calls) * 100).toFixed(2)
        : 0;

      const temp = +((totalSales / +todayDay) * daysInMonth).toFixed();

      // Формируем текст уведомления на основе собранных данных
      const summaryText =
        `<b>Подробный отчет за этот месяц</b>\n` +
        `Сумма оформленных: <b>${totalSales.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</b>\n` +
        `Темп: <b>${temp.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</b>\n` +
        `Расходы на рекламу: <b>${totalAdExpenses.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</b>\n` +
        `ДРР: <b>${totalDRR}%</b>\n` +
        `Сумма отправленых: <b>${sendDeliveriesPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</b>\n` +
        `Выручка общая: <b>${fact.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}₽</b>\n` +
        `Заявки: <b>${calls}</b>\n` +
        `Сделки: <b>${dealsAmount}</b>\n` +
        `% из заявки в продажу: <b>${conversionDealsToCalls}%</b>\n` +
        msgs.map((m) => m.text).join('') +
        '\n' +
        prodInfo;

      // const chatId = 317401874;
      // await this.telegramService.sendToChat(chatId, summaryText);

      // Вариант 2: Если нужно уведомить конкретных пользователей (например, всех админов)
      const admins = ['317401874', '368152093'];
      // const admins = ['317401874'];
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
    if (this.env === 'development') {
      this.logger.debug(`[dev] skip importNewCustomersDaily`);
      return;
    }
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

  // Автоматическая синхронизация операций Т-Банка каждый час с 8 утра до полуночи
  @Cron('0 0 * * * *', { timeZone: 'Europe/Moscow' })
  async syncTbankOperations() {
    if (this.env === 'development') {
      this.logger.debug(`[dev] skip syncTbankOperations`);
      return;
    }
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

  // Нормализация позиций задач во всех колонках
  @Cron('0 30 4 * * *', { timeZone: 'Europe/Moscow' })
  async normalizeTaskPositions() {
    if (this.env === 'development') {
      this.logger.debug(`[dev] skip normalizeTaskPositions`);
      return;
    }
    // Защита от повторного выполнения
    if (this.isPositionNormalizationRunning) {
      this.logger.warn('[Position Normalization] Already running, skipping...');
      return;
    }

    this.isPositionNormalizationRunning = true;
    const startTime = new Date();

    try {
      this.logger.log(
        `[Position Normalization] Starting at ${startTime.toISOString()}`,
      );

      const POSITION_SCALE = 4;

      const formatPosition = (value: number): string => {
        return value.toFixed(POSITION_SCALE);
      };

      // Получаем все доски
      const boards = await this.prisma.board.findMany({
        select: { id: true, title: true },
      });

      let totalColumnsProcessed = 0;
      let totalTasksProcessed = 0;

      for (const board of boards) {
        this.logger.log(
          `[Position Normalization] Processing board: ${board.title} (ID: ${board.id})`,
        );

        // Получаем все колонки в доске, отсортированные по позиции
        const columns = await this.prisma.column.findMany({
          where: {
            boardId: board.id,
          },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
          },
        });

        for (const column of columns) {
          // Получаем все задачи в колонке
          const tasks = await this.prisma.kanbanTask.findMany({
            where: {
              boardId: board.id,
              columnId: column.id,
            },
            orderBy: { position: 'asc' },
            select: {
              id: true,
            },
          });

          if (tasks.length === 0) {
            continue;
          }

          this.logger.log(
            `  [Position Normalization] Column "${column.title}": found ${tasks.length} tasks`,
          );

          // Перенумеровываем задачи: 1, 2, 3, 4...
          // Используем raw SQL для обновления позиций без изменения updatedAt
          for (let i = 0; i < tasks.length; i++) {
            const newPosition = i + 1;
            const formattedPosition = formatPosition(newPosition);

            // Обновляем позицию задачи через raw SQL, чтобы не изменять updatedAt
            await this.prisma.$executeRaw`
              UPDATE "KanbanTask"
              SET position = ${formattedPosition}::DECIMAL(10, 4)
              WHERE id = ${tasks[i].id}
            `;
          }

          totalColumnsProcessed++;
          totalTasksProcessed += tasks.length;
          this.logger.log(
            `  [Position Normalization] Positions updated: 1, 2, ..., ${tasks.length}`,
          );
        }
      }

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      this.logger.log(
        `[Position Normalization] Completed successfully. Processed ${totalColumnsProcessed} columns, ${totalTasksProcessed} tasks in ${duration}ms`,
      );

      await this.notifyAdmins(
        `✅ Нормализация позиций задач завершена: ${totalColumnsProcessed} колонок, ${totalTasksProcessed} задач за ${(duration / 1000).toFixed(1)}с`,
      );
    } catch (error) {
      this.logger.error(
        `[Position Normalization] Failed: ${error.message}`,
        error.stack,
      );
      await this.notifyAdmins(
        `🔥 Нормализация позиций задач упала: ${error.message}`,
      );
    } finally {
      this.isPositionNormalizationRunning = false;
    }
  }

  // Автоматическая архивация задач старше 7 дней для доски 17
  // ВАЖНО: Установите время выполнения на текущее время + 10 минут
  // Формат cron: 'секунды минуты часы день месяц день_недели'
  // Например, для выполнения в 15:25: '0 25 15 * * *'
  // TODO: Обновите время выполнения перед деплоем!
  @Cron('0 20 3 * * *', { timeZone: 'Europe/Moscow' })
  async autoArchiveBoard17Tasks() {
    if (this.env === 'development') {
      this.logger.debug(`[dev] skip autoArchiveBoard17Tasks`);
      return;
    }
    const startTime = new Date();
    try {
      const BOARD_IDS = [17];
      const IGNORE_COLUMNS_IDS: number[] = []; // Можно добавить ID колонок для исключения
      const DAYS = 7;
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - DAYS);

      this.logger.log(
        `[autoArchiveBoard17Tasks] Starting at ${startTime.toISOString()}, checking tasks older than ${sevenDaysAgo.toISOString()}`,
      );
      this.logger.log(
        `[autoArchiveBoard17Tasks] Ignoring columns: ${IGNORE_COLUMNS_IDS.length > 0 ? IGNORE_COLUMNS_IDS.join(', ') : 'none'}`,
      );

      // Получаем все активные задачи с их аудитом и comments
      const tasks = await this.prisma.kanbanTask.findMany({
        where: {
          deletedAt: null,
          archived: false,
          boardId: { in: BOARD_IDS },
          ...(IGNORE_COLUMNS_IDS.length > 0 && {
            columnId: { notIn: IGNORE_COLUMNS_IDS },
          }),
        },
        select: {
          id: true,
          title: true,
          boardId: true,
          columnId: true,
          audits: {
            select: {
              id: true,
              createdAt: true,
              action: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
          comments: {
            where: {
              deletedAt: null, // Исключаем удаленные комментарии
            },
            select: {
              id: true,
              updatedAt: true,
            },
          },
        },
      });

      this.logger.log(
        `[autoArchiveBoard17Tasks] Found ${tasks.length} active tasks to check`,
      );

      const tasksToArchive: number[] = [];
      const tasksWithoutAudit: number[] = [];
      const tasksWithRecentActivity: number[] = [];
      const tasksWithRecentComments: number[] = [];

      // Проверяем каждую задачу
      for (const task of tasks) {
        // Если у задачи нет записей аудита, пропускаем
        if (task.audits.length === 0) {
          tasksWithoutAudit.push(task.id);
          continue;
        }

        // Проверяем, все ли записи аудита старше 7 дней
        const allAuditsOld = task.audits.every(
          (audit) => audit.createdAt < sevenDaysAgo,
        );

        // Проверяем, все ли comments старше 7 дней (если есть)
        const allCommentsOld =
          task.comments.length === 0 ||
          task.comments.every((comment) => comment.updatedAt < sevenDaysAgo);

        // Архивируем только если все условия выполнены
        if (allAuditsOld && allCommentsOld) {
          tasksToArchive.push(task.id);
        } else {
          if (!allAuditsOld) {
            tasksWithRecentActivity.push(task.id);
          }
          if (!allCommentsOld) {
            tasksWithRecentComments.push(task.id);
          }
        }
      }

      this.logger.log(
        `[autoArchiveBoard17Tasks] Tasks without audit: ${tasksWithoutAudit.length}, with recent activity: ${tasksWithRecentActivity.length}, with recent comments: ${tasksWithRecentComments.length}, to archive: ${tasksToArchive.length}`,
      );

      if (tasksToArchive.length === 0) {
        this.logger.log('[autoArchiveBoard17Tasks] No tasks to archive');
        await this.notifyAdmins(
          `🗂️ Автоархив задач (доска 17): нет задач для архивации\nПроверено: ${tasks.length}\nБез аудита: ${tasksWithoutAudit.length}\nС недавней активностью: ${tasksWithRecentActivity.length}\nС недавними комментариями: ${tasksWithRecentComments.length}${IGNORE_COLUMNS_IDS.length > 0 ? `\nИсключены колонки: ${IGNORE_COLUMNS_IDS.join(', ')}` : ''}`,
        );
        return;
      }

      // Архивируем задачи через raw SQL без изменения updatedAt
      const archivedCount = await this.prisma.$executeRaw`
        UPDATE "KanbanTask"
        SET archived = true
        WHERE id = ANY(${tasksToArchive}::int[])
      `;

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.log(
        `[autoArchiveBoard17Tasks] Archived ${archivedCount} tasks in ${duration}ms`,
      );

      await this.notifyAdmins(
        `🗂️ Автоархив задач (доска 17) завершён.\nАрхивировано: ${archivedCount}\nДоски: ${BOARD_IDS.join(', ')}\nПроверено задач: ${tasks.length}\nБез аудита: ${tasksWithoutAudit.length}\nС недавней активностью: ${tasksWithRecentActivity.length}\nС недавними комментариями: ${tasksWithRecentComments.length}${IGNORE_COLUMNS_IDS.length > 0 ? `\nИсключены колонки: ${IGNORE_COLUMNS_IDS.join(', ')}` : ''}\nВремя выполнения: ${(duration / 1000).toFixed(1)}с`,
      );
    } catch (e: unknown) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      this.logger.error(
        `[autoArchiveBoard17Tasks] failed after ${duration}ms: ${e instanceof Error ? e.message : String(e)}`,
      );
      await this.notifyAdmins(
        `🔥 Автоархив задач (доска 17) упал: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Автоматическая архивация задач старше 5 дней на заданных досках
  // Архивирует задачи, у которых все записи аудита и comments старше 5 дней
  // Сейчас — только для boardId=3
  @Cron('0 10 3 * * *', { timeZone: 'Europe/Moscow' })
  async autoArchiveOldTasks() {
    if (this.env === 'development') {
      this.logger.debug(`[dev] skip autoArchiveOldTasks`);
      return;
    }
    const startTime = new Date();
    try {
      const BOARD_IDS = [3];
      const IGNORE_COLUMNS_IDS = [18, 19, 20, 21, 22, 23, 24, 104, 42];
      const DAYS = 5;
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - DAYS);

      this.logger.log(
        `[autoArchiveOldTasks] Starting at ${startTime.toISOString()}, checking tasks older than ${fiveDaysAgo.toISOString()}`,
      );
      this.logger.log(
        `[autoArchiveOldTasks] Ignoring columns: ${IGNORE_COLUMNS_IDS.join(', ')}`,
      );

      // Получаем все активные задачи с их аудитом и comments
      const tasks = await this.prisma.kanbanTask.findMany({
        where: {
          deletedAt: null,
          archived: false,
          boardId: { in: BOARD_IDS },
          columnId: { notIn: IGNORE_COLUMNS_IDS }, // Исключаем задачи из указанных колонок
        },
        select: {
          id: true,
          title: true,
          boardId: true,
          columnId: true,
          audits: {
            select: {
              id: true,
              createdAt: true,
              action: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
          comments: {
            where: {
              deletedAt: null, // Исключаем удаленные комментарии
            },
            select: {
              id: true,
              updatedAt: true,
            },
          },
        },
      });

      this.logger.log(
        `[autoArchiveOldTasks] Found ${tasks.length} active tasks to check`,
      );

      const tasksToArchive: number[] = [];
      const tasksWithoutAudit: number[] = [];
      const tasksWithRecentActivity: number[] = [];
      const tasksWithRecentComments: number[] = [];

      // Проверяем каждую задачу
      for (const task of tasks) {
        // Если у задачи нет записей аудита, пропускаем
        if (task.audits.length === 0) {
          tasksWithoutAudit.push(task.id);
          continue;
        }

        // Проверяем, все ли записи аудита старше 5 дней
        const allAuditsOld = task.audits.every(
          (audit) => audit.createdAt < fiveDaysAgo,
        );

        // Проверяем, все ли comments старше 5 дней (если есть)
        const allCommentsOld =
          task.comments.length === 0 ||
          task.comments.every((comment) => comment.updatedAt < fiveDaysAgo);

        // Архивируем только если все условия выполнены
        if (allAuditsOld && allCommentsOld) {
          tasksToArchive.push(task.id);
        } else {
          if (!allAuditsOld) {
            tasksWithRecentActivity.push(task.id);
          }
          if (!allCommentsOld) {
            tasksWithRecentComments.push(task.id);
          }
        }
      }

      this.logger.log(
        `[autoArchiveOldTasks] Tasks without audit: ${tasksWithoutAudit.length}, with recent activity: ${tasksWithRecentActivity.length}, with recent comments: ${tasksWithRecentComments.length}, to archive: ${tasksToArchive.length}`,
      );

      if (tasksToArchive.length === 0) {
        this.logger.log('[autoArchiveOldTasks] No tasks to archive');
        await this.notifyAdmins(
          `🗂️ Автоархив задач: нет задач для архивации\nПроверено: ${tasks.length}\nБез аудита: ${tasksWithoutAudit.length}\nС недавней активностью: ${tasksWithRecentActivity.length}\nС недавними комментариями: ${tasksWithRecentComments.length}\nИсключены колонки: ${IGNORE_COLUMNS_IDS.join(', ')}`,
        );
        return;
      }

      // Архивируем задачи через raw SQL без изменения updatedAt
      const archivedCount = await this.prisma.$executeRaw`
        UPDATE "KanbanTask"
        SET archived = true
        WHERE id = ANY(${tasksToArchive}::int[])
      `;

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.log(
        `[autoArchiveOldTasks] Archived ${archivedCount} tasks in ${duration}ms`,
      );

      await this.notifyAdmins(
        `🗂️ Автоархив задач завершён.\nАрхивировано: ${archivedCount}\nДоски: ${BOARD_IDS.join(', ')}\nПроверено задач: ${tasks.length}\nБез аудита: ${tasksWithoutAudit.length}\nС недавней активностью: ${tasksWithRecentActivity.length}\nС недавними комментариями: ${tasksWithRecentComments.length}\nИсключены колонки: ${IGNORE_COLUMNS_IDS.join(', ')}\nВремя выполнения: ${(duration / 1000).toFixed(1)}с`,
      );
    } catch (e: unknown) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      this.logger.error(
        `[autoArchiveOldTasks] failed after ${duration}ms: ${e instanceof Error ? e.message : String(e)}`,
      );
      await this.notifyAdmins(
        `🔥 Автоархив задач упал: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Автоматическая архивация задач старше 40 дней на досках 10 и 5
  // Архивирует задачи, у которых все записи аудита и comments старше 40 дней
  @Cron('0 30 3 * * *', { timeZone: 'Europe/Moscow' })
  async autoArchiveProdTasks() {
    if (this.env === 'development') {
      this.logger.debug(`[dev] skip autoArchiveProdTasks`);
      return;
    }
    const startTime = new Date();
    try {
      const BOARD_IDS = [10, 5];
      const IGNORE_COLUMNS_IDS: number[] = [];
      const DAYS = 40;
      const fortyDaysAgo = new Date();
      fortyDaysAgo.setDate(fortyDaysAgo.getDate() - DAYS);

      this.logger.log(
        `[autoArchiveProdTasks] Starting at ${startTime.toISOString()}, checking tasks older than ${fortyDaysAgo.toISOString()}`,
      );
      this.logger.log(
        `[autoArchiveProdTasks] Ignoring columns: ${IGNORE_COLUMNS_IDS.length > 0 ? IGNORE_COLUMNS_IDS.join(', ') : 'none'}`,
      );

      const tasks = await this.prisma.kanbanTask.findMany({
        where: {
          deletedAt: null,
          archived: false,
          boardId: { in: BOARD_IDS },
          ...(IGNORE_COLUMNS_IDS.length > 0 && {
            columnId: { notIn: IGNORE_COLUMNS_IDS },
          }),
        },
        select: {
          id: true,
          title: true,
          boardId: true,
          columnId: true,
          audits: {
            select: {
              id: true,
              createdAt: true,
              action: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
          comments: {
            where: {
              deletedAt: null,
            },
            select: {
              id: true,
              updatedAt: true,
            },
          },
        },
      });

      this.logger.log(
        `[autoArchiveProdTasks] Found ${tasks.length} active tasks to check`,
      );

      const tasksToArchive: number[] = [];
      const tasksWithoutAudit: number[] = [];
      const tasksWithRecentActivity: number[] = [];
      const tasksWithRecentComments: number[] = [];

      for (const task of tasks) {
        if (task.audits.length === 0) {
          tasksWithoutAudit.push(task.id);
          continue;
        }

        const allAuditsOld = task.audits.every(
          (audit) => audit.createdAt < fortyDaysAgo,
        );

        const allCommentsOld =
          task.comments.length === 0 ||
          task.comments.every((comment) => comment.updatedAt < fortyDaysAgo);

        if (allAuditsOld && allCommentsOld) {
          tasksToArchive.push(task.id);
        } else {
          if (!allAuditsOld) {
            tasksWithRecentActivity.push(task.id);
          }
          if (!allCommentsOld) {
            tasksWithRecentComments.push(task.id);
          }
        }
      }

      this.logger.log(
        `[autoArchiveProdTasks] Tasks without audit: ${tasksWithoutAudit.length}, with recent activity: ${tasksWithRecentActivity.length}, with recent comments: ${tasksWithRecentComments.length}, to archive: ${tasksToArchive.length}`,
      );

      if (tasksToArchive.length === 0) {
        this.logger.log('[autoArchiveProdTasks] No tasks to archive');
        await this.notifyAdmins(
          `🗂️ Автоархив задач (доски 10, 5): нет задач для архивации\nПроверено: ${tasks.length}\nБез аудита: ${tasksWithoutAudit.length}\nС недавней активностью: ${tasksWithRecentActivity.length}\nС недавними комментариями: ${tasksWithRecentComments.length}${IGNORE_COLUMNS_IDS.length > 0 ? `\nИсключены колонки: ${IGNORE_COLUMNS_IDS.join(', ')}` : ''}`,
        );
        return;
      }

      const archivedCount = await this.prisma.$executeRaw`
        UPDATE "KanbanTask"
        SET archived = true
        WHERE id = ANY(${tasksToArchive}::int[])
      `;

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.log(
        `[autoArchiveProdTasks] Archived ${archivedCount} tasks in ${duration}ms`,
      );

      await this.notifyAdmins(
        `🗂️ Автоархив задач (доски 10, 5) завершён.\nАрхивировано: ${archivedCount}\nДоски: ${BOARD_IDS.join(', ')}\nПроверено задач: ${tasks.length}\nБез аудита: ${tasksWithoutAudit.length}\nС недавней активностью: ${tasksWithRecentActivity.length}\nС недавними комментариями: ${tasksWithRecentComments.length}${IGNORE_COLUMNS_IDS.length > 0 ? `\nИсключены колонки: ${IGNORE_COLUMNS_IDS.join(', ')}` : ''}\nВремя выполнения: ${(duration / 1000).toFixed(1)}с`,
      );
    } catch (e: unknown) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      this.logger.error(
        `[autoArchiveProdTasks] failed after ${duration}ms: ${e instanceof Error ? e.message : String(e)}`,
      );
      await this.notifyAdmins(
        `🔥 Автоархив задач (доски 10, 5) упал: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Ночная проверка реестров СДЭК
  @Cron('0 0 2 * * *', { timeZone: 'Europe/Moscow' })
  async checkCdekRegistersNightly() {
    if (this.env === 'development') {
      this.logger.debug(`[dev] skip checkCdekRegistersNightly`);
      return;
    }
    if (this.isCheckRegistersRunning) {
      this.logger.warn('[CDEK Registers] Job is already running, skipping...');
      return;
    }

    this.isCheckRegistersRunning = true;
    const startTime = new Date();
    try {
      const period = this.ymInMoscow(new Date());
      this.logger.log(
        `[CDEK Registers] Starting at ${startTime.toISOString()}, period=${period}`,
      );

      const result = await this.deliveriesService.checkRegisters(period);

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      this.logger.log(
        `[CDEK Registers] Completed in ${duration}ms: ${result?.message ?? 'ok'}`,
      );
      if (result?.message) {
        await this.notifyAdmins(`✅ ${result.message}`);
      }
    } catch (e: unknown) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `[CDEK Registers] failed after ${duration}ms: ${message}`,
      );
      await this.notifyAdmins(`🔥 Проверка реестров СДЭК упала: ${message}`);
    } finally {
      this.isCheckRegistersRunning = false;
    }
  }

  // Автоматическая синхронизация расходов VK Ads в AdExpense
  // Если за последние 5 дней (до вчера по МСК) нет записи AdExpense, создаём на основе VkAdsDailyStat
  @Cron('0 0 8 * * *', { timeZone: 'Europe/Moscow' })
  async syncVkAdsExpenses() {
    if (this.env === 'development') {
      this.logger.debug(`[dev] skip syncVkAdsExpenses`);
      return;
    }

    // Защита от повторного выполнения
    if (this.isVkAdsExpenseSyncRunning) {
      this.logger.warn(
        '[VK Ads Expenses] Sync is already running, skipping...',
      );
      return;
    }

    this.isVkAdsExpenseSyncRunning = true;
    const startTime = new Date();

    try {
      this.logger.log(
        `[VK Ads Expenses] Starting sync at ${startTime.toISOString()}`,
      );

      // Даты считаем явно по Москве
      const todayMsk = this.ymdInMoscow(new Date());
      const yesterdayMsk = this.addDaysYmd(todayMsk, -1);
      const daysToSync: string[] = [];
      for (let i = 4; i >= 0; i -= 1) {
        daysToSync.push(this.addDaysYmd(yesterdayMsk, -i));
      }

      this.logger.log(
        `[VK Ads Expenses] Checking expenses for dates (MSK): ${daysToSync.join(', ')}`,
      );

      // Конфигурация проектов
      const projectConfigs = [
        { project: 'neon', adSourceId: 1, workSpaceId: 3, groupId: 3 },
        { project: 'book', adSourceId: 19, workSpaceId: 3, groupId: 19 },
      ];

      const results: string[] = [];

      for (const dayStr of daysToSync) {
        this.logger.log(
          `[VK Ads Expenses] Checking day ${dayStr} (MSK)`,
        );
        for (const config of projectConfigs) {
          this.logger.log(
            `[VK Ads Expenses] Processing project: ${config.project} (${dayStr})`,
          );

          // Проверяем, есть ли уже запись AdExpense за день для этого проекта
          const existingExpense = await this.prisma.adExpense.findFirst({
            where: {
              adSourceId: config.adSourceId,
              workSpaceId: config.workSpaceId,
              groupId: config.groupId,
              date: {
                startsWith: dayStr,
              },
            },
          });

          if (existingExpense) {
            this.logger.log(
              `[VK Ads Expenses] ${config.project}: AdExpense already exists for ${dayStr} (id=${existingExpense.id}, price=${existingExpense.price})`,
            );
            results.push(
              `${dayStr} ${config.project}: уже есть (${existingExpense.price}₽)`,
            );
            continue;
          }

          // Записи нет — ищем VkAdsDailyStat за день
          const vkStats = await this.prisma.vkAdsDailyStat.findMany({
            where: {
              project: config.project,
              date: dayStr,
              entity: 'ad_plans',
            },
          });

          if (vkStats.length === 0) {
            this.logger.log(
              `[VK Ads Expenses] ${config.project}: No VkAdsDailyStat found for ${dayStr}`,
            );
            results.push(`${dayStr} ${config.project}: нет данных VK Ads`);
            continue;
          }

          // Суммируем spentNds по всем записям
          const totalSpentNds = vkStats.reduce(
            (sum, stat) => sum + stat.spentNds,
            0,
          );
          const priceInt = Math.round(totalSpentNds);

          this.logger.log(
            `[VK Ads Expenses] ${config.project}: Found ${vkStats.length} VkAdsDailyStat records, totalSpentNds=${totalSpentNds}, priceInt=${priceInt}`,
          );

          // Создаём запись AdExpense
          const newExpense = await this.prisma.adExpense.create({
            data: {
              price: priceInt,
              date: dayStr,
              period: '',
              adSourceId: config.adSourceId,
              workSpaceId: config.workSpaceId,
              groupId: config.groupId,
            },
          });

          this.logger.log(
            `[VK Ads Expenses] ${config.project}: Created AdExpense id=${newExpense.id}, price=${newExpense.price}`,
          );
          results.push(`${dayStr} ${config.project}: создано ${priceInt}₽`);
        }
      }

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.log(`[VK Ads Expenses] Sync completed in ${duration}ms`);

      await this.notifyAdmins(
        `📊 Синхронизация расходов VK Ads за 5 дней (до ${yesterdayMsk}):\n${results.join('\n')}\nВремя: ${(duration / 1000).toFixed(1)}с`,
      );
    } catch (error) {
      this.logger.error(
        `[VK Ads Expenses] Failed: ${error.message}`,
        error.stack,
      );
      await this.notifyAdmins(
        `🔥 Синхронизация расходов VK Ads упала: ${error.message}`,
      );
    } finally {
      this.isVkAdsExpenseSyncRunning = false;
    }
  }
}
