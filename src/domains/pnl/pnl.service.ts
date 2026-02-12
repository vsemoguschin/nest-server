import { Injectable } from '@nestjs/common';
import { subMonths, format } from 'date-fns';
import { CommercialDatasService } from '../commercial-datas/commercial-datas.service';
import { PrismaService } from 'src/prisma/prisma.service';

function getLastMonths(dateStr: string, m: number): string[] {
  // Парсим входную строку в объект Date (предполагаем формат YYYY-MM)
  const [year, month] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1); // Месяцы в JS начинаются с 0

  // Создаем массив для хранения результатов
  const result: string[] = [];

  // Добавляем даты за последние 6 месяцев
  for (let i = 0; i < m; i++) {
    const pastDate = subMonths(date, i); // Вычитаем i месяцев
    const formattedDate = format(pastDate, 'yyyy-MM'); // Форматируем в YYYY-MM
    result.push(formattedDate);
  }

  // return result.sort((a, b) => a.localeCompare(b));
  return result.sort((a, b) => a.localeCompare(b));
}

@Injectable()
export class PnlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commercialDatasService: CommercialDatasService,
  ) {}

  private async getIncomeDatas(
    periods: string[],
    groupSearch: { gt: number } | { in: number[] },
  ) {
    // Запускаем обработку всех периодов параллельно
    const income = await Promise.all(
      periods.map(async (p) => {
        // const periodStart = Date.now();
        // console.log(`  [Income] Начало обработки периода ${p}`);

        // Все 4 запроса для одного периода выполняются параллельно
        const [deals, dops, payments, sendDeliveries] = await Promise.all([
          this.prisma.deal.findMany({
            where: {
              saleDate: { startsWith: p },
              reservation: false,
              status: { not: 'Возврат' },
              deletedAt: null,
              groupId: groupSearch,
            },
            select: { price: true },
          }),

          this.prisma.dop.findMany({
            where: {
              saleDate: { startsWith: p },
              deal: {
                reservation: false,
                status: { not: 'Возврат' },
                deletedAt: null,
              },
              groupId: groupSearch,
            },
            select: { price: true },
          }),

          this.prisma.payment.findMany({
            where: {
              date: { startsWith: p },
              deal: {
                reservation: false,
                status: { not: 'Возврат' },
                deletedAt: null,
                groupId: groupSearch,
              },
            },
            select: { price: true },
          }),

          this.prisma.delivery.findMany({
            where: {
              date: { startsWith: p },
              deal: {
                status: { not: 'Возврат' },
                reservation: false,
                deletedAt: null,
                groupId: groupSearch,
              },
            },
            include: {
              deal: {
                include: { dops: true },
              },
            },
          }),
        ]);

        const dopsPrice = dops.reduce((a, b) => a + b.price, 0);
        // console.log(
        //   deals.reduce((a, b) => a + b.price, 0),
        //   'dealsPrice',
        // );
        // console.log(dopsPrice, 'dopsPrice');
        const allDealsPrice =
          deals.reduce((a, b) => a + b.price, 0) + dopsPrice;
        const revenue = payments.reduce((a, b) => a + b.price, 0);
        const sendDeals = sendDeliveries.reduce(
          (a, b) =>
            a + b.deal.price + b.deal.dops.reduce((a, b) => a + b.price, 0),
          0,
        );

        // console.log(
        //   `  [Income] ✓ Период ${p} обработан за ${Date.now() - periodStart}ms`,
        // );
        return {
          period: p,
          allDealsPrice,
          revenue,
          sendDeals,
        };
      }),
    );

    return income;
  }

  async getNeonPLDatas(period: string) {
    const groupSearch = { in: [2, 3, 4, 18] };
    const periods = getLastMonths(period, 4);

    const income = await this.getIncomeDatas(periods, groupSearch);
    // console.log({income});

    const adExpenses = await Promise.all(
      periods.map(async (p) => {
        const adExpenses = await this.prisma.adExpense.findMany({
          where: {
            date: {
              startsWith: p,
            },
            groupId: groupSearch,
          },
          include: {
            adSource: {
              select: {
                title: true,
              },
            },
          },
        });
        const value = adExpenses.reduce((a, b) => a + b.price, 0);

        return {
          period: p,
          value,
        };
      }),
    );

    const disSalaries = await Promise.all(
      periods.map(async (p) => {
        const designers = await this.prisma.user.findMany({
          where: {
            role: {
              shortName: 'DIZ',
            },
          },
          include: {
            salaryPays: {
              where: {
                period: p,
              },
            },
          },
        });
        const value = designers.reduce(
          (a, b) => a + b.salaryPays.reduce((a, b) => a + b.price, 0),
          0,
        );
        return {
          period: p,
          value,
        };
      }),
    );
    const movSalaries = await Promise.all(
      periods.map(async (p) => {
        const movs = await this.prisma.user.findMany({
          where: {
            role: {
              shortName: {
                in: ['MOV', 'ROV'],
              },
            },
            groupId: groupSearch,
          },
          include: {
            salaryPays: {
              where: {
                period: p,
              },
            },
          },
        });
        const value = movs.reduce(
          (a, b) => a + b.salaryPays.reduce((a, b) => a + b.price, 0),
          0,
        );
        return {
          period: p,
          value,
        };
      }),
    );
    const kdSalaries = await Promise.all(
      periods.map(async (p) => {
        return {
          period: p,
          value: 0,
        };
      }),
    );
    const prodExpenses = await Promise.all(
      periods.map(async (p) => {
        const supplies = await this.prisma.suppliePosition.findMany({
          where: {
            supplie: {
              date: {
                startsWith: p,
              },
            },
          },
        });
        const value = supplies.reduce(
          (a, b) => a + b.priceForItem * b.quantity.toNumber(),
          0,
        );
        return {
          period: p,
          value,
        };
      }),
    );
    const mastersSalaries = await Promise.all(
      periods.map(async (p) => {
        const reports = await this.prisma.masterReport.findMany({
          where: {
            date: {
              startsWith: p,
            },
          },
        });
        const reportsCost = reports.reduce(
          (a, b) => a + (b.cost + b.lightingCost - b.penaltyCost),
          0,
        );

        const value = reportsCost;
        return {
          period: p,
          value,
        };
      }),
    );
    const packersSalaries = await Promise.all(
      periods.map(async (p) => {
        const reports = await this.prisma.packerReport.findMany({
          where: {
            date: {
              startsWith: p,
            },
          },
        });
        const reportsCost = reports.reduce(
          (a, b) => a + b.cost - b.penaltyCost,
          0,
        );

        const value = reportsCost;
        return {
          period: p,
          value,
        };
      }),
    );
    const frezerSalaries = await Promise.all(
      periods.map(async (p) => {
        const reports = await this.prisma.frezerReport.findMany({
          where: {
            date: {
              startsWith: p,
            },
          },
        });
        const reportsCost = reports.reduce(
          (a, b) => a + b.cost - b.penaltyCost,
          0,
        );
        const value = reportsCost;
        return {
          period: p,
          value,
        };
      }),
    );
    const mastersRepairsSalaries = await Promise.all(
      periods.map(async (p) => {
        const reports = await this.prisma.masterRepairReport.findMany({
          where: {
            date: {
              startsWith: p,
            },
          },
        });
        const reportsCost = reports.reduce(
          (a, b) => a + (b.cost - b.penaltyCost),
          0,
        );
        const value = reportsCost;
        return {
          period: p,
          value,
        };
      }),
    );
    const otherSalaries = await Promise.all(
      periods.map(async (p) => {
        const reports = await this.prisma.otherReport.findMany({
          where: {
            date: {
              startsWith: p,
            },
          },
        });
        const reportsCost = reports.reduce(
          (a, b) => a + b.cost - b.penaltyCost,
          0,
        );
        const value = reportsCost;
        return {
          period: p,
          value,
        };
      }),
    );
    const logisticsSalaries = await Promise.all(
      periods.map(async (p) => {
        const reports = await this.prisma.logistShift.findMany({
          where: {
            shift_date: {
              startsWith: p,
            },
          },
        });
        const reportsCost = reports.reduce((a, b) => a + b.cost, 0);
        return {
          period: p,
          value: reportsCost,
        };
      }),
    );

    const mopSalaries = await Promise.all(
      periods.map(async (p) => {
        const value = await this.commercialDatasService.getMOPNeonPNLDatas(p);
        return {
          period: p,
          value,
        };
      }),
    );

    return {
      periods,
      income, //доходы
      //расходы
      //Отдел производства
      prodExpenses, //расходы на поставки
      //зарплаты производства
      mastersSalaries, // мастера
      mastersRepairsSalaries, // ремонты
      packersSalaries, // упаковщиков
      frezerSalaries, // фрезеровщики
      otherSalaries, // другие расходы
      logisticsSalaries, // логисты

      //Коммерческий отдел
      adExpenses, //расходы на рекламу
      // зарплаты коммерческого отдела
      mopSalaries, // мопы
      disSalaries, // дизайнеры
      movSalaries, // менеджеры отдела ведения
      kdSalaries, // коммерческий директор
    };
  }

  async getBookPLDatas(period: string) {
    const periods = getLastMonths(period, 4);

    const movSalaries = await Promise.all(
      periods.map(async (p) => {
        const value = await this.commercialDatasService.getMOVBookPNLDatas(p);
        return {
          period: p,
          value,
        };
      }),
    );

    const ropSalaries = await Promise.all(
      periods.map(async (p) => {
        const value = await this.commercialDatasService.getROPBookPNLDatas(p);
        return {
          period: p,
          value,
        };
      }),
    );

    const mopSalaries = await Promise.all(
      periods.map(async (p) => {
        const value = await this.commercialDatasService.getMOPBookPNLDatas(p);
        return {
          period: p,
          value,
        };
      }),
    );
    // console.log(mopSalaries);

    // Оптимизация 2: Запускаем все запросы параллельно
    const [
      income,
      prodExpensesByPeriod,
      designExpensesByPeriod,
      adExpenses,
      // mopSalaries,
      // ropSalaries,
      // movSalaries,
    ] = await Promise.all([
      // Income
      this.getIncomeDatas(periods, { in: [19, 17] }),

      // Расходы на производство - оптимизированный запрос
      this.getExpensesByCategory(periods, 143, 2),

      // Расходы на дизайн - оптимизированный запрос
      this.getExpensesByCategory(periods, 141, 2),

      // Расходы на рекламу - оптимизированный запрос
      this.getAdExpensesByPeriods(periods, [19, 17]),
    ]);

    return {
      periods,
      income,
      prodExpensesByPeriod,
      adExpenses,
      mopSalaries,
      ropSalaries,
      movSalaries,
      designExpensesByPeriod,
    };
  }

  // Приватная функция: один запрос на все периоды
  private async getExpensesByCategory(
    periods: string[],
    categoryId: number,
    projectId?: number,
  ): Promise<{ period: string; value: number }[]> {
    // Один запрос вместо 4-х
    const where: {
      expenseCategoryId: number;
      period: { in: string[] };
      projectId?: number;
    } = {
      expenseCategoryId: categoryId,
      period: { in: periods },
    };
    if (typeof projectId === 'number') {
      where.projectId = projectId;
    }
    const allExpenses = await this.prisma.operationPosition.findMany({
      where,
      select: {
        amount: true,
        period: true,
      },
    });

    // Группируем по периодам
    const grouped = periods.map((period) => {
      const periodExpenses = allExpenses.filter((exp) => exp.period === period);
      const value = periodExpenses.reduce((sum, exp) => sum + exp.amount, 0);

      return { period, value };
    });

    return grouped;
  }

  // Приватная функция: сумма по категории за период через originalOperation.operationDate
  private async getExpenseAmountByCategoryForPeriod(
    period: string,
    categoryId: number,
    projectId?: number,
  ): Promise<number> {
    const where: {
      expenseCategoryId: number;
      originalOperation: { operationDate: { startsWith: string } };
      projectId?: number;
    } = {
      expenseCategoryId: categoryId,
      originalOperation: {
        operationDate: { startsWith: period },
      },
    };

    if (typeof projectId === 'number') {
      where.projectId = projectId;
    }

    const positions = await this.prisma.operationPosition.findMany({
      where,
      select: {
        amount: true,
      },
    });

    const total = positions.reduce((sum, position) => sum + position.amount, 0);
    return Math.round(total * 100) / 100;
  }

  async getDdsData(period: string) {
    const EASYNEON_PROJECT_ID = 3;
    const EASYBOOK_PROJECT_ID = 2;
    const GENERAL_PROJECT_ID = 1;
    const [periodYear, periodMonth] = period.split('-').map(Number);
    const prevPeriod = format(
      subMonths(new Date(periodYear, periodMonth - 1), 1),
      'yyyy-MM',
    );

    const roundToCents = (value: number) => Math.round(value * 100) / 100;
    const vkCashbackBaseTotal =
      await this.getExpenseAmountByCategoryForPeriod(prevPeriod, 39);
    const vkCashbackTotal = roundToCents(vkCashbackBaseTotal * 0.17);

    const itemsConfig = [
      { id: 2, projectId: EASYNEON_PROJECT_ID },
      { id: 4, projectId: EASYNEON_PROJECT_ID },
      { id: 10, projectId: EASYNEON_PROJECT_ID },
      { id: 1, projectId: EASYNEON_PROJECT_ID },
      { id: 3, projectId: EASYNEON_PROJECT_ID },
      { id: 5, projectId: EASYNEON_PROJECT_ID },
      { id: 2, projectId: EASYBOOK_PROJECT_ID },
      { id: 4, projectId: EASYBOOK_PROJECT_ID },
      { id: 10, projectId: EASYBOOK_PROJECT_ID },
      { id: 1, projectId: EASYBOOK_PROJECT_ID },
      { id: 3, projectId: EASYBOOK_PROJECT_ID },
      { id: 5, projectId: EASYBOOK_PROJECT_ID },
      { id: 14 },
      { id: 158 },
      { id: 13 },
      { id: 154 },
      { id: 148 },
      { id: 18, projectId: EASYNEON_PROJECT_ID },
      { id: 17, projectId: EASYNEON_PROJECT_ID },
      { id: 152, projectId: EASYNEON_PROJECT_ID },
      { id: 153, projectId: EASYNEON_PROJECT_ID },
      { id: 22, projectId: EASYNEON_PROJECT_ID },
      { id: 23, projectId: EASYNEON_PROJECT_ID },
      { id: 146, projectId: EASYNEON_PROJECT_ID },
      { id: 21, projectId: EASYNEON_PROJECT_ID },
      { id: 24, projectId: EASYNEON_PROJECT_ID },
      { id: 47, projectId: EASYNEON_PROJECT_ID },
      { id: 34, projectId: EASYNEON_PROJECT_ID },
      { id: 26, projectId: EASYNEON_PROJECT_ID },
      { id: 52, projectId: EASYNEON_PROJECT_ID },
      { id: 54, projectId: EASYNEON_PROJECT_ID },
      { id: 55, projectId: EASYNEON_PROJECT_ID },
      { id: 89, projectId: EASYNEON_PROJECT_ID },
      { id: 56, projectId: EASYNEON_PROJECT_ID },
      { id: 29, projectId: EASYNEON_PROJECT_ID },
      { id: 31, projectId: EASYNEON_PROJECT_ID },
      { id: 48, projectId: EASYNEON_PROJECT_ID },
      { id: 81, projectId: EASYNEON_PROJECT_ID },
      { id: 71, projectId: EASYNEON_PROJECT_ID },
      { id: 72, projectId: EASYNEON_PROJECT_ID },
      { id: 75, projectId: EASYNEON_PROJECT_ID },
      { id: 79, projectId: EASYNEON_PROJECT_ID },
      { id: 80, projectId: EASYNEON_PROJECT_ID },
      { id: 76, projectId: EASYNEON_PROJECT_ID },
      { id: 39, projectId: EASYNEON_PROJECT_ID },
      { id: 45, projectId: EASYNEON_PROJECT_ID },
      { id: 143, projectId: EASYBOOK_PROJECT_ID },
      { id: 81, projectId: EASYBOOK_PROJECT_ID },
      { id: 71, projectId: EASYBOOK_PROJECT_ID },
      { id: 141, projectId: EASYBOOK_PROJECT_ID },
      { id: 75, projectId: EASYBOOK_PROJECT_ID },
      { id: 140, projectId: EASYBOOK_PROJECT_ID },
      { id: 142, projectId: EASYBOOK_PROJECT_ID },
      { id: 39, projectId: EASYBOOK_PROJECT_ID },
      { id: 45, projectId: EASYBOOK_PROJECT_ID },
      { id: 29, projectId: EASYBOOK_PROJECT_ID },
      { id: 48, projectId: EASYBOOK_PROJECT_ID },
      { id: 68, projectId: GENERAL_PROJECT_ID },
      { id: 87, projectId: GENERAL_PROJECT_ID },
      { id: 151, projectId: GENERAL_PROJECT_ID },
      { id: 43, projectId: GENERAL_PROJECT_ID },
      { id: 31, projectId: GENERAL_PROJECT_ID },
      { id: 45, projectId: GENERAL_PROJECT_ID },
      { id: 48, projectId: GENERAL_PROJECT_ID },
      { id: 159 },
      { id: 147 },
      { id: 63 },
      { id: 49 },
      { id: 67 },
      { id: 138 },
    ];

    const items = await Promise.all(
      itemsConfig.map(async ({ id, projectId }) => {
        if (id === 154) {
          return { id, projectId, value: vkCashbackTotal };
        }
        const value = await this.getExpenseAmountByCategoryForPeriod(
          period,
          id,
          projectId,
        );
        return { id, projectId, value };
      }),
    );

    return {
      period,
      items,
    };
  }

  // Приватная функция: один запрос на рекламные расходы
  private async getAdExpensesByPeriods(
    periods: string[],
    groupIds: number[],
  ): Promise<{ period: string; value: number }[]> {
    // Один запрос вместо 4-х
    const allAdExpenses = await this.prisma.adExpense.findMany({
      where: {
        groupId: { in: groupIds },
        OR: periods.map((p) => ({ date: { startsWith: p } })),
      },
      select: {
        price: true,
        date: true,
      },
    });

    // Группируем по периодам
    return periods.map((period) => {
      const value = allAdExpenses
        .filter((ad) => ad.date.startsWith(period))
        .reduce((sum, ad) => sum + ad.price, 0);

      return { period, value };
    });
  }

  //v2
  async getDatasV2(period: string) {
    //Выручка от реализации товара
    const deliveries = await this.prisma.delivery.findMany({
      where: {
        OR: [
          {
            date: { startsWith: period },
          },
          {
            deliveredDate: { startsWith: period },
          },
        ],
        deal: {
          status: { not: 'Возврат' },
          reservation: false,
          deletedAt: null,
        },
      },
      include: {
        deal: {
          include: { dops: true },
        },
      },
    });
    const sendDeliveries = deliveries.filter((d) => d.deliveredDate === '');
    const deliveredDeliveries = deliveries.filter(
      (d) => d.deliveredDate !== '',
    );
  }

  async getNewDatas(period: string) {
    const EASYNEON_GROUP_IDS = [2, 3, 18];
    const EASYBOOK_GROUP_IDS = [19, 17];
    const PRODUCTION_BOARD_IDS = [10, 5];
    const EASYNEON_PROJECT_ID = 3;
    const EASYBOOK_PROJECT_ID = 2;
    const GENERAL_PROJECT_ID = 1;
    const [periodYear, periodMonth] = period.split('-').map(Number);
    const prevPeriod = format(
      subMonths(new Date(periodYear, periodMonth - 1), 1),
      'yyyy-MM',
    );

    const baseDealWhere = {
      saleDate: { startsWith: period },
      reservation: false,
      status: { not: 'Возврат' },
      deletedAt: null,
    };

    const baseDopWhere = {
      saleDate: { startsWith: period },
      deal: {
        reservation: false,
        status: { not: 'Возврат' },
        deletedAt: null,
      },
    };

    const baseDeliveryDealWhere = {
      status: { not: 'Возврат' },
      reservation: false,
      deletedAt: null,
    };

    const resolveNumber = (value: unknown) => {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
      }
      if (
        value &&
        typeof value === 'object' &&
        'toNumber' in value &&
        typeof (value as { toNumber?: () => number }).toNumber === 'function'
      ) {
        const numeric = (value as { toNumber: () => number }).toNumber();
        return Number.isFinite(numeric) ? numeric : 0;
      }
      const normalized = Number(value ?? 0);
      return Number.isFinite(normalized) ? normalized : 0;
    };

    const sumPrices = (items: Array<{ price: unknown }>) =>
      items.reduce((sum, item) => sum + resolveNumber(item.price), 0);

    const sumDeliveries = (
      deliveries: Array<{
        deal: { price: unknown; dops: Array<{ price: unknown }> };
      }>,
    ) =>
      deliveries.reduce(
        (sum, delivery) =>
          sum +
          resolveNumber(delivery.deal.price) +
          sumPrices(delivery.deal.dops),
        0,
      );

    const getProjectData = async (groupIds: number[]) => {
      const [deals, dops, latestDeliveriesRaw] = await Promise.all([
        this.prisma.deal.findMany({
          where: {
            ...baseDealWhere,
            groupId: { in: groupIds },
          },
          select: { price: true },
        }),
        this.prisma.dop.findMany({
          where: {
            ...baseDopWhere,
            groupId: { in: groupIds },
          },
          select: { price: true },
        }),
        this.prisma.delivery.findMany({
          where: {
            deletedAt: null,
            purpose: 'Заказ',
            deal: {
              ...baseDeliveryDealWhere,
              groupId: { in: groupIds },
            },
          },
          orderBy: { date: 'desc' },
          include: {
            deal: {
              include: { dops: true },
            },
          },
        }),
      ]);

      const latestDeliveries: typeof latestDeliveriesRaw = [];
      const seenDealIds = new Set<number>();
      for (const delivery of latestDeliveriesRaw) {
        if (!seenDealIds.has(delivery.dealId)) {
          latestDeliveries.push(delivery);
          seenDealIds.add(delivery.dealId);
        }
      }

      const shippedDeliveries = latestDeliveries.filter((delivery) =>
        delivery.date.startsWith(period),
      );

      return {
        orders: sumPrices(deals) + sumPrices(dops),
        shipped: sumDeliveries(shippedDeliveries),
        deliveries: shippedDeliveries,
        shippedDealIds: Array.from(
          new Set(shippedDeliveries.map((delivery) => delivery.dealId)),
        ),
      };
    };

    const [easyneon, easybook] = await Promise.all([
      getProjectData(EASYNEON_GROUP_IDS),
      getProjectData(EASYBOOK_GROUP_IDS),
    ]);

    const easyneonDealIds = await this.prisma.deal.findMany({
      where: {
        ...baseDealWhere,
        groupId: { in: EASYNEON_GROUP_IDS },
      },
      select: { id: true },
    });

    const easyneonTasks = easyneonDealIds.length
      ? await this.prisma.kanbanTask.findMany({
          where: {
            dealId: { in: easyneonDealIds.map((deal) => deal.id) },
            boardId: { in: PRODUCTION_BOARD_IDS },
          },
          include: {
            orders: {
              include: {
                orderCost: true,
              },
            },
          },
        })
      : [];

    const shippedEasyneonTasks = easyneon.shippedDealIds.length
      ? await this.prisma.kanbanTask.findMany({
          where: {
            dealId: { in: easyneon.shippedDealIds },
            boardId: { in: PRODUCTION_BOARD_IDS },
          },
          select: {
            id: true,
            orders: {
              select: { id: true },
            },
          },
        })
      : [];

    const shippedTaskIds = shippedEasyneonTasks.map((task) => task.id);
    const shippedOrderIds = shippedEasyneonTasks.flatMap((task) =>
      task.orders.map((order) => order.id),
    );

    const [shippedMasterReports, shippedPackerReports] = await Promise.all([
      shippedOrderIds.length
        ? this.prisma.masterReport.findMany({
            where: {
              orderId: { in: shippedOrderIds },
              deletedAt: null,
            },
            select: { cost: true, penaltyCost: true },
          })
        : Promise.resolve([] as Array<{ cost: number; penaltyCost: number }>),
      shippedTaskIds.length
        ? this.prisma.packerReport.findMany({
            where: {
              taskId: { in: shippedTaskIds },
              deletedAt: null,
            },
            select: { cost: true, penaltyCost: true },
          })
        : Promise.resolve([] as Array<{ cost: number; penaltyCost: number }>),
    ]);

    const orderCostTotals = {
      priceForBoard: 0,
      priceForScreen: 0,
      adapterPrice: 0,
      neonPrice: 0,
      lightingPrice: 0,
      wireAcoustic: 0,
      wireShvvp: 0,
    };

    easyneonTasks.forEach((task) => {
      task.orders.forEach((order) => {
        const cost = order.orderCost;
        if (!cost) {
          return;
        }
        orderCostTotals.priceForBoard += resolveNumber(cost.priceForBoard);
        orderCostTotals.priceForScreen += resolveNumber(cost.priceForScreen);
        orderCostTotals.adapterPrice += resolveNumber(cost.adapterPrice);
        orderCostTotals.neonPrice += resolveNumber(cost.neonPrice);
        orderCostTotals.lightingPrice += resolveNumber(cost.lightingPrice);

        const wireType = String(cost.wireType ?? '').toLowerCase();
        if (wireType.includes('шввп')) {
          orderCostTotals.wireShvvp += resolveNumber(cost.wirePrice);
        } else {
          orderCostTotals.wireAcoustic += resolveNumber(cost.wirePrice);
        }
      });
    });

    const SUPPLIE_CATEGORIES = ['Акрил', 'Пленки', 'Упаковка', 'Другое'];

    const suppliePositions = await this.prisma.suppliePosition.findMany({
      where: {
        category: { in: SUPPLIE_CATEGORIES },
        supplie: {
          shipmentDate: { startsWith: period },
        },
      },
      select: {
        category: true,
        quantity: true,
        priceForItem: true,
      },
    });

    const supplieTotals = SUPPLIE_CATEGORIES.reduce<Record<string, number>>(
      (acc, category) => {
        acc[category] = 0;
        return acc;
      },
      {},
    );

    suppliePositions.forEach((position) => {
      const category = position.category;
      if (!category) {
        return;
      }
      const total =
        resolveNumber(position.quantity) * resolveNumber(position.priceForItem);
      supplieTotals[category] = (supplieTotals[category] ?? 0) + total;
    });

    const [
      logistShifts,
      frezerReports,
      masterRepairReports,
      otherReports,
      easyneonAdExpenses,
      easybookAdExpenses,
      mopNeonSalesManagers,
      mopBookSalesManagers,
      movBookAccountManagers,
      bookPLDatas,
      installationExpenses,
      productionHeadExpenses,
      easyneonDesignExpenses,
      easyneonDesignLeadExpenses,
      easybookDesignLeadExpenses,
      easyneonSalesDirectorSalary,
      easybookSalesDirectorSalary,
      easyneonMarketingTarget,
      easyneonMarketingAvito,
      easyneonMarketingSmm,
      easybookMarketingTarget,
      easybookMarketingAvito,
      easybookMarketingSmm,
      easyneonMarketingAds38,
      easyneonMarketingAds42,
      easyneonMarketingAds45,
      easybookMarketingAds38,
      easybookMarketingAds42,
      easybookMarketingAds45,
      easyneonRentExpenses,
      easybookRentExpenses,
      vkCashbackExpensesPrev,
      accountingExpenses,
      hrExpenses,
      dividendsExpenses,
      rkoExpenses,
      financeExpenses,
      depositInterestExpenses,
      interestExpenses,
      programmersExpenses,
      easyneonPackPartsExpenses,
      easyneonMasterPartsExpenses,
      easyneonVkAccountManagers,
      easyneonVkOrderManagers,
      easybookBookLeadManagers,
      easybookBookOrderManagers,
    ] = await Promise.all([
      this.prisma.logistShift.findMany({
        where: {
          shift_date: { startsWith: period },
        },
        select: { cost: true },
      }),
      this.prisma.frezerReport.findMany({
        where: {
          date: { startsWith: period },
        },
        select: { cost: true, penaltyCost: true },
      }),
      this.prisma.masterRepairReport.findMany({
        where: {
          date: { startsWith: period },
          deletedAt: null,
        },
        select: { cost: true, penaltyCost: true },
      }),
      this.prisma.otherReport.findMany({
        where: {
          date: { startsWith: period },
          deletedAt: null,
        },
        select: { cost: true, penaltyCost: true },
      }),
      this.prisma.adExpense.findMany({
        where: {
          date: { startsWith: period },
          groupId: { in: EASYNEON_GROUP_IDS },
        },
        select: { price: true },
      }),
      this.prisma.adExpense.findMany({
        where: {
          date: { startsWith: period },
          groupId: { in: EASYBOOK_GROUP_IDS },
        },
        select: { price: true },
      }),
      this.commercialDatasService.getMOPNeonPNLDatas(period),
      this.commercialDatasService.getMOPBookPNLDatas(period),
      this.commercialDatasService.getMOVBookPNLDatas(period),
      this.getBookPLDatas(period),
      this.getExpensesByCategory([period], 57, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 52, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 72, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 71, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 71, EASYBOOK_PROJECT_ID),
      this.getExpensesByCategory([period], 81, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 81, EASYBOOK_PROJECT_ID),
      this.getExpensesByCategory([period], 83, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 84, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 85, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 83, EASYBOOK_PROJECT_ID),
      this.getExpensesByCategory([period], 84, EASYBOOK_PROJECT_ID),
      this.getExpensesByCategory([period], 85, EASYBOOK_PROJECT_ID),
      this.getExpensesByCategory([period], 38, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 42, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 45, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 38, EASYBOOK_PROJECT_ID),
      this.getExpensesByCategory([period], 42, EASYBOOK_PROJECT_ID),
      this.getExpensesByCategory([period], 45, EASYBOOK_PROJECT_ID),
      this.getExpensesByCategory([period], 36, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 36, EASYBOOK_PROJECT_ID),
      this.getExpensesByCategory([prevPeriod], 39),
      this.getExpensesByCategory([period], 68),
      this.getExpensesByCategory([period], 43),
      this.getExpensesByCategory([period], 138, GENERAL_PROJECT_ID),
      this.getExpensesByCategory([period], 48),
      this.getExpensesByCategory([period], 151),
      this.getExpensesByCategory([period], 13),
      this.getExpensesByCategory([period], 63),
      this.getExpensesByCategory([period], 87),
      this.getExpensesByCategory([period], 23, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 24, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 79, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 80, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 142, EASYBOOK_PROJECT_ID),
      this.getExpensesByCategory([period], 140, EASYBOOK_PROJECT_ID),
    ]);

    const sumCostMinusPenalty = (
      items: Array<{ cost: unknown; penaltyCost?: unknown }>,
    ) =>
      items.reduce(
        (sum, item) =>
          sum + resolveNumber(item.cost) - resolveNumber(item.penaltyCost ?? 0),
        0,
      );

    const assemblersTotal = sumCostMinusPenalty(shippedMasterReports);
    const packersTotal = sumCostMinusPenalty(shippedPackerReports);
    const logistTotal = logistShifts.reduce(
      (sum, shift) => sum + resolveNumber(shift.cost),
      0,
    );
    const frezerTotal = sumCostMinusPenalty(frezerReports);
    const repairsTotal = sumCostMinusPenalty(masterRepairReports);
    const otherReportsTotal = sumCostMinusPenalty(otherReports);
    const easyneonDeliveryTotal = easyneon.deliveries
      .filter((delivery) => delivery.type === 'Бесплатно')
      .reduce((sum, delivery) => sum + resolveNumber(delivery.price), 0);
    const easybookDeliveryTotal = easybook.deliveries
      .filter((delivery) => delivery.type === 'Бесплатно')
      .reduce((sum, delivery) => sum + resolveNumber(delivery.price), 0);
    const promotionEasyneonTotal = sumPrices(easyneonAdExpenses);
    const promotionEasybookTotal = sumPrices(easybookAdExpenses);
    const salesManagersEasyneonTotal = resolveNumber(mopNeonSalesManagers);
    const salesManagersEasybookTotal = resolveNumber(mopBookSalesManagers);
    const easyneonVkAccountManagersTotal = resolveNumber(
      easyneonVkAccountManagers?.[0]?.value ?? 0,
    );
    const easyneonVkOrderManagersTotal = resolveNumber(
      easyneonVkOrderManagers?.[0]?.value ?? 0,
    );
    const accountManagersEasybookTotal = resolveNumber(movBookAccountManagers);
    const easybookBookLeadManagersTotal = resolveNumber(
      easybookBookLeadManagers?.[0]?.value ?? 0,
    );
    const easybookBookOrderManagersTotal = resolveNumber(
      easybookBookOrderManagers?.[0]?.value ?? 0,
    );
    const ropsEasybookTotal = resolveNumber(
      bookPLDatas?.ropSalaries?.find((row) => row.period === period)?.value ??
        0,
    );
    const bookPrintTotal = resolveNumber(
      bookPLDatas?.prodExpensesByPeriod?.find((row) => row.period === period)
        ?.value ?? 0,
    );
    const bookDesignTotal = resolveNumber(
      bookPLDatas?.designExpensesByPeriod?.find((row) => row.period === period)
        ?.value ?? 0,
    );
    const installersTotal = resolveNumber(
      installationExpenses?.[0]?.value ?? 0,
    );
    const productionHeadTotal = resolveNumber(
      productionHeadExpenses?.[0]?.value ?? 0,
    );
    const easyneonDesignTotal = resolveNumber(
      easyneonDesignExpenses?.[0]?.value ?? 0,
    );
    const easyneonDesignLeadTotal = resolveNumber(
      easyneonDesignLeadExpenses?.[0]?.value ?? 0,
    );
    const easybookDesignLeadTotal = resolveNumber(
      easybookDesignLeadExpenses?.[0]?.value ?? 0,
    );
    const easyneonSalesDirectorSalaryTotal = resolveNumber(
      easyneonSalesDirectorSalary?.[0]?.value ?? 0,
    );
    const easybookSalesDirectorSalaryTotal = resolveNumber(
      easybookSalesDirectorSalary?.[0]?.value ?? 0,
    );
    const easyneonMarketingTargetTotal = resolveNumber(
      easyneonMarketingTarget?.[0]?.value ?? 0,
    );
    const easyneonMarketingAvitoTotal = resolveNumber(
      easyneonMarketingAvito?.[0]?.value ?? 0,
    );
    const easyneonMarketingSmmTotal = resolveNumber(
      easyneonMarketingSmm?.[0]?.value ?? 0,
    );
    const easybookMarketingTargetTotal = resolveNumber(
      easybookMarketingTarget?.[0]?.value ?? 0,
    );
    const easybookMarketingAvitoTotal = resolveNumber(
      easybookMarketingAvito?.[0]?.value ?? 0,
    );
    const easybookMarketingSmmTotal = resolveNumber(
      easybookMarketingSmm?.[0]?.value ?? 0,
    );
    const easyneonMarketingAdsTotal =
      resolveNumber(easyneonMarketingAds38?.[0]?.value ?? 0) +
      resolveNumber(easyneonMarketingAds42?.[0]?.value ?? 0) +
      resolveNumber(easyneonMarketingAds45?.[0]?.value ?? 0);
    const easybookMarketingAdsTotal =
      resolveNumber(easybookMarketingAds38?.[0]?.value ?? 0) +
      resolveNumber(easybookMarketingAds42?.[0]?.value ?? 0) +
      resolveNumber(easybookMarketingAds45?.[0]?.value ?? 0);
    const easyneonPackPartsTotal = resolveNumber(
      easyneonPackPartsExpenses?.[0]?.value ?? 0,
    );
    const easyneonMasterPartsTotal = resolveNumber(
      easyneonMasterPartsExpenses?.[0]?.value ?? 0,
    );
    const easyneonRentTotal = resolveNumber(
      easyneonRentExpenses?.[0]?.value ?? 0,
    );
    const easybookRentTotal = resolveNumber(
      easybookRentExpenses?.[0]?.value ?? 0,
    );

    const vkCashbackBaseTotal = resolveNumber(
      vkCashbackExpensesPrev?.[0]?.value ?? 0,
    );
    const vkCashbackTotalRaw = vkCashbackBaseTotal * 0.17;
    const vkCashbackTotal = vkCashbackTotalRaw ? vkCashbackTotalRaw : 0;
    const accountingTotal = resolveNumber(accountingExpenses?.[0]?.value ?? 0);
    const hrTotal = resolveNumber(hrExpenses?.[0]?.value ?? 0);
    const dividendsTotal = resolveNumber(dividendsExpenses?.[0]?.value ?? 0);
    const rkoTotal = resolveNumber(rkoExpenses?.[0]?.value ?? 0);
    const financeTotal = resolveNumber(financeExpenses?.[0]?.value ?? 0);
    const depositInterestTotal = resolveNumber(
      depositInterestExpenses?.[0]?.value ?? 0,
    );
    const interestExpensesTotal = resolveNumber(
      interestExpenses?.[0]?.value ?? 0,
    );
    console.log('[PNL] Deposit interest totals (new-my)', {
      period,
      depositInterestTotal,
    });
    console.log('[PNL] Deposit interest totals (new)', {
      period,
      depositInterestTotal,
    });
    const programmersTotal = resolveNumber(
      programmersExpenses?.[0]?.value ?? 0,
    );

    const staffTotal =
      productionHeadTotal +
      assemblersTotal +
      packersTotal +
      logistTotal +
      frezerTotal;

    const easyneonMaterialsTotal =
      orderCostTotals.priceForBoard +
      orderCostTotals.priceForScreen +
      orderCostTotals.adapterPrice +
      orderCostTotals.neonPrice +
      orderCostTotals.lightingPrice +
      orderCostTotals.wireAcoustic +
      orderCostTotals.wireShvvp +
      (supplieTotals['Акрил'] ?? 0) +
      (supplieTotals['Пленки'] ?? 0) +
      (supplieTotals['Упаковка'] ?? 0) +
      easyneonPackPartsTotal +
      easyneonMasterPartsTotal +
      (supplieTotals['Другое'] ?? 0);

    const easyneonCogsTotal =
      easyneonMaterialsTotal +
      staffTotal +
      installersTotal +
      repairsTotal +
      otherReportsTotal +
      easyneonDeliveryTotal +
      easyneonRentTotal;

    const easybookCogsTotal =
      bookPrintTotal + easybookDeliveryTotal + easybookRentTotal;

    const grossProfitEasyneon = easyneon.shipped - easyneonCogsTotal;
    const grossProfitEasybook = easybook.shipped - easybookCogsTotal;
    const totalRevenue = easyneon.shipped + easybook.shipped;
    const roundPercent = (value: number) => Math.round(value * 100) / 100;
    const grossMarginEasyneon =
      easyneon.shipped > 0
        ? roundPercent((grossProfitEasyneon / easyneon.shipped) * 100)
        : 0;
    const grossMarginEasybook =
      easybook.shipped > 0
        ? roundPercent((grossProfitEasybook / easybook.shipped) * 100)
        : 0;
    const grossMarginTotal =
      totalRevenue > 0
        ? roundPercent(
            ((grossProfitEasyneon + grossProfitEasybook) / totalRevenue) * 100,
          )
        : 0;
    const vatEasyneon = easyneon.shipped * 0.05;
    const vatEasybook = easybook.shipped * 0.05;

    const commercialEasyneon =
      easyneonDesignLeadTotal +
      easyneonDesignTotal +
      easyneonSalesDirectorSalaryTotal +
      salesManagersEasyneonTotal +
      easyneonVkAccountManagersTotal +
      easyneonVkOrderManagersTotal +
      easyneonMarketingTargetTotal +
      easyneonMarketingAvitoTotal +
      easyneonMarketingSmmTotal +
      easyneonMarketingAdsTotal;

    const commercialEasybook =
      easybookDesignLeadTotal +
      bookDesignTotal +
      easybookSalesDirectorSalaryTotal +
      salesManagersEasybookTotal +
      accountManagersEasybookTotal +
      // easybookBookLeadManagersTotal +
      // easybookBookOrderManagersTotal +
      easybookMarketingTargetTotal +
      easybookMarketingAvitoTotal +
      easybookMarketingSmmTotal +
      easybookMarketingAdsTotal +
      ropsEasybookTotal;

    const commercialWithPromotionEasyneon =
      commercialEasyneon + promotionEasyneonTotal;
    const commercialWithPromotionEasybook =
      commercialEasybook + promotionEasybookTotal;

    const marginalIncomeEasyneon =
      grossProfitEasyneon - commercialWithPromotionEasyneon - vatEasyneon;
    const marginalIncomeEasybook =
      grossProfitEasybook - commercialWithPromotionEasybook - vatEasybook;

    const operatingExpensesTotal =
      accountingTotal + hrTotal + rkoTotal + programmersTotal;

    const ebitdaTotal =
      marginalIncomeEasyneon + marginalIncomeEasybook - operatingExpensesTotal;
    const ebitdaMargin =
      totalRevenue > 0 ? roundPercent((ebitdaTotal / totalRevenue) * 100) : 0;

    const belowEbitdaTotal = 0;
    const profitBeforeTax =
      ebitdaTotal +
      vkCashbackTotal +
      depositInterestTotal -
      interestExpensesTotal;
    const profitBeforeTaxMargin =
      totalRevenue > 0
        ? roundPercent((profitBeforeTax / totalRevenue) * 100)
        : 0;

    const taxesPayroll = 0;
    const profitTax = (totalRevenue - (vatEasyneon + vatEasybook)) * 0.01;
    const taxLoadBase = totalRevenue - (vatEasyneon + vatEasybook);
    const taxLoad =
      taxLoadBase > 0
        ? roundPercent(
            ((taxesPayroll + profitTax + vatEasyneon + vatEasybook) /
              taxLoadBase) *
              100,
          )
        : 0;

    const netProfit = profitBeforeTax - taxesPayroll - profitTax;
    const netProfitMargin =
      totalRevenue > 0 ? roundPercent((netProfit / totalRevenue) * 100) : 0;
    const marginalMarginEasyneon =
      easyneon.shipped > 0
        ? roundPercent((marginalIncomeEasyneon / easyneon.shipped) * 100)
        : 0;
    const marginalMarginEasybook =
      easybook.shipped > 0
        ? roundPercent((marginalIncomeEasybook / easybook.shipped) * 100)
        : 0;
    const marginalMarginTotal =
      totalRevenue > 0
        ? roundPercent(
            ((marginalIncomeEasyneon + marginalIncomeEasybook) / totalRevenue) *
              100,
          )
        : 0;

    return {
      period,
      rows: {
        'revenue-easyneon-orders': easyneon.orders,
        revenue: easyneon.shipped + easybook.shipped,
        'revenue-easyneon': easyneon.shipped,
        'revenue-easybook': easybook.shipped,
        'revenue-easyneon-shipped': easyneon.shipped,
        'revenue-easybook-orders': easybook.orders,
        'revenue-easybook-shipped': easybook.shipped,
        'gross-profit-easyneon': grossProfitEasyneon,
        'gross-profit-easybook': grossProfitEasybook,
        'gross-margin': grossMarginTotal,
        'gross-margin-easyneon': grossMarginEasyneon,
        'gross-margin-easybook': grossMarginEasybook,
        'vat-easyneon': vatEasyneon,
        'vat-easybook': vatEasybook,
        'marginal-income-easyneon': marginalIncomeEasyneon,
        'marginal-income-easybook': marginalIncomeEasybook,
        'marginal-margin': marginalMarginTotal,
        'marginal-margin-easyneon': marginalMarginEasyneon,
        'marginal-margin-easybook': marginalMarginEasybook,
        'promotion-easyneon': promotionEasyneonTotal,
        'promotion-easybook': promotionEasybookTotal,
        'easyneon-sales-managers': salesManagersEasyneonTotal,
        'easyneon-sales-accounts': easyneonVkAccountManagersTotal,
        'easyneon-sales-vk-ordering': easyneonVkOrderManagersTotal,
        'easybook-sales-managers': salesManagersEasybookTotal,
        'easybook-sales-accounts': accountManagersEasybookTotal,
        // 'easybook-sales-book-lead': easybookBookLeadManagersTotal,
        // 'easybook-sales-book-ordering': easybookBookOrderManagersTotal,
        'easybook-sales-rops': ropsEasybookTotal,
        'easyneon-design-head': easyneonDesignLeadTotal,
        'easyneon-design-team': easyneonDesignTotal,
        'easybook-design-head': easybookDesignLeadTotal,
        'easyneon-sales-cd-salary': easyneonSalesDirectorSalaryTotal,
        'easybook-sales-cd-salary': easybookSalesDirectorSalaryTotal,
        'easyneon-marketing-target': easyneonMarketingTargetTotal,
        'easyneon-marketing-avito': easyneonMarketingAvitoTotal,
        'easyneon-marketing-smm': easyneonMarketingSmmTotal,
        'easyneon-marketing-ads': easyneonMarketingAdsTotal,
        'easybook-marketing-target': easybookMarketingTargetTotal,
        'easybook-marketing-avito': easybookMarketingAvitoTotal,
        'easybook-marketing-smm': easybookMarketingSmmTotal,
        'easybook-marketing-ads': easybookMarketingAdsTotal,
        'operating-expenses-accounting': accountingTotal,
        'operating-expenses-finance': financeTotal,
        'operating-expenses-hr': hrTotal,
        'operating-expenses-rko': rkoTotal,
        'cogs-easybook-print': bookPrintTotal,
        'cogs-easybook-delivery': easybookDeliveryTotal,
        'cogs-easybook-rent': easybookRentTotal,
        'easybook-design-team': bookDesignTotal,
        'operating-expenses-dev': programmersTotal,
        ebitda: ebitdaTotal,
        'ebitda-margin': ebitdaMargin,
        'below-ebitda': belowEbitdaTotal,
        'below-ebitda-interest': interestExpensesTotal,
        'other-income-vk-cashback': vkCashbackTotal,
        'other-income-deposit-interest': depositInterestTotal,
        'profit-before-tax': profitBeforeTax,
        'profit-before-tax-margin': profitBeforeTaxMargin,
        'taxes-payroll': taxesPayroll,
        'taxes-profit': profitTax,
        'taxes-load': taxLoad,
        'net-profit': netProfit,
        'net-profit-margin': netProfitMargin,
        'net-profit-dividends': dividendsTotal,
        'cogs-easyneon-materials': easyneonMaterialsTotal,
        'cogs-easyneon-staff': staffTotal,
        'cogs-easyneon-prod-head': productionHeadTotal,
        'cogs-easyneon-assemblers': assemblersTotal,
        'cogs-easyneon-packers': packersTotal,
        'cogs-easyneon-logist': logistTotal,
        'cogs-easyneon-millers': frezerTotal,
        'cogs-easyneon-installers': installersTotal,
        'cogs-easyneon-repair': repairsTotal,
        'cogs-easyneon-repair-other': otherReportsTotal,
        'cogs-easyneon-delivery': easyneonDeliveryTotal,
        'cogs-easyneon-rent': easyneonRentTotal,
        'cogs-easyneon-polycarbonate': orderCostTotals.priceForBoard,
        'cogs-easyneon-screen': orderCostTotals.priceForScreen,
        'cogs-easyneon-power': orderCostTotals.adapterPrice,
        'cogs-easyneon-neon': orderCostTotals.neonPrice,
        'cogs-easyneon-lighting': orderCostTotals.lightingPrice,
        'cogs-easyneon-acoustic': orderCostTotals.wireAcoustic,
        'cogs-easyneon-shvvp': orderCostTotals.wireShvvp,
        'cogs-easyneon-acrylic': supplieTotals['Акрил'],
        'cogs-easyneon-film': supplieTotals['Пленки'],
        'cogs-easyneon-pack': supplieTotals['Упаковка'],
        'cogs-easyneon-pack-parts': easyneonPackPartsTotal,
        'cogs-easyneon-master-parts': easyneonMasterPartsTotal,
        'cogs-easyneon-other': supplieTotals['Другое'],
      },
    };
  }

  async getMyNewDatas(period: string) {
    const EASYNEON_GROUP_IDS = [2, 3, 18];
    const EASYBOOK_GROUP_IDS = [19, 17];
    const PRODUCTION_BOARD_IDS = [10, 5];
    const EASYNEON_PROJECT_ID = 1;
    const EASYBOOK_PROJECT_ID = 2;
    const GENERAL_PROJECT_ID = 3;
    const [periodYear, periodMonth] = period.split('-').map(Number);
    const prevPeriod = format(
      subMonths(new Date(periodYear, periodMonth - 1), 1),
      'yyyy-MM',
    );

    const baseDealWhere = {
      saleDate: { startsWith: period },
      reservation: false,
      status: { not: 'Возврат' },
      deletedAt: null,
    };

    const baseDopWhere = {
      saleDate: { startsWith: period },
      deal: {
        reservation: false,
        status: { not: 'Возврат' },
        deletedAt: null,
      },
    };

    const baseDeliveryDealWhere = {
      saleDate: { startsWith: period },
      status: { not: 'Возврат' },
      reservation: false,
      deletedAt: null,
    };

    const resolveNumber = (value: unknown) => {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
      }
      if (
        value &&
        typeof value === 'object' &&
        'toNumber' in value &&
        typeof (value as { toNumber?: () => number }).toNumber === 'function'
      ) {
        const numeric = (value as { toNumber: () => number }).toNumber();
        return Number.isFinite(numeric) ? numeric : 0;
      }
      const normalized = Number(value ?? 0);
      return Number.isFinite(normalized) ? normalized : 0;
    };

    const sumPrices = (items: Array<{ price: unknown }>) =>
      items.reduce((sum, item) => sum + resolveNumber(item.price), 0);

    const sumPayments = (
      items: Array<{ payments?: Array<{ price: unknown }> }>,
    ) => items.reduce((sum, item) => sum + sumPrices(item.payments ?? []), 0);

    const sumDeliveries = (
      deliveries: Array<{
        deal: { price: unknown; dops: Array<{ price: unknown }> };
      }>,
    ) =>
      deliveries.reduce(
        (sum, delivery) =>
          sum +
          resolveNumber(delivery.deal.price) +
          sumPrices(delivery.deal.dops),
        0,
      );

    const getProjectData = async (groupIds: number[]) => {
      const [deals, dops, deliveries] = await Promise.all([
        this.prisma.deal.findMany({
          where: {
            ...baseDealWhere,
            groupId: { in: groupIds },
          },
          select: {
            price: true,
            payments: {
              select: { price: true },
            },
          },
        }),
        this.prisma.dop.findMany({
          where: {
            ...baseDopWhere,
            groupId: { in: groupIds },
          },
          select: { price: true },
        }),
        this.prisma.delivery.findMany({
          where: {
            date: { startsWith: period },
            deal: {
              ...baseDeliveryDealWhere,
              groupId: { in: groupIds },
            },
          },
          include: {
            deal: {
              include: { dops: true },
            },
          },
        }),
      ]);

      return {
        orders: sumPrices(deals) + sumPrices(dops),
        paid: sumPayments(deals),
        shipped: sumDeliveries(deliveries),
        deliveries,
        shippedDealIds: Array.from(
          new Set(deliveries.map((delivery) => delivery.dealId)),
        ),
      };
    };

    const [easyneon, easybook] = await Promise.all([
      getProjectData(EASYNEON_GROUP_IDS),
      getProjectData(EASYBOOK_GROUP_IDS),
    ]);

    const easyneonDealIds = await this.prisma.deal.findMany({
      where: {
        ...baseDealWhere,
        groupId: { in: EASYNEON_GROUP_IDS },
      },
      select: { id: true },
    });

    const easyneonTasks = easyneonDealIds.length
      ? await this.prisma.kanbanTask.findMany({
          where: {
            dealId: { in: easyneonDealIds.map((deal) => deal.id) },
            boardId: { in: PRODUCTION_BOARD_IDS },
          },
          include: {
            orders: {
              include: {
                orderCost: true,
              },
            },
          },
        })
      : [];

    const shippedEasyneonTasks = easyneon.shippedDealIds.length
      ? await this.prisma.kanbanTask.findMany({
          where: {
            dealId: { in: easyneon.shippedDealIds },
            boardId: { in: PRODUCTION_BOARD_IDS },
          },
          select: {
            id: true,
            orders: {
              select: { id: true },
            },
          },
        })
      : [];

    const shippedTaskIds = shippedEasyneonTasks.map((task) => task.id);
    const shippedOrderIds = shippedEasyneonTasks.flatMap((task) =>
      task.orders.map((order) => order.id),
    );

    const [shippedMasterReports, shippedPackerReports] = await Promise.all([
      shippedOrderIds.length
        ? this.prisma.masterReport.findMany({
            where: {
              orderId: { in: shippedOrderIds },
              deletedAt: null,
            },
            select: { cost: true, penaltyCost: true },
          })
        : Promise.resolve([] as Array<{ cost: number; penaltyCost: number }>),
      shippedTaskIds.length
        ? this.prisma.packerReport.findMany({
            where: {
              taskId: { in: shippedTaskIds },
              deletedAt: null,
            },
            select: { cost: true, penaltyCost: true },
          })
        : Promise.resolve([] as Array<{ cost: number; penaltyCost: number }>),
    ]);

    const orderCostTotals = {
      priceForBoard: 0,
      priceForScreen: 0,
      adapterPrice: 0,
      neonPrice: 0,
      lightingPrice: 0,
      wireAcoustic: 0,
      wireShvvp: 0,
    };

    easyneonTasks.forEach((task) => {
      task.orders.forEach((order) => {
        const cost = order.orderCost;
        if (!cost) {
          return;
        }
        orderCostTotals.priceForBoard += resolveNumber(cost.priceForBoard);
        orderCostTotals.priceForScreen += resolveNumber(cost.priceForScreen);
        orderCostTotals.adapterPrice += resolveNumber(cost.adapterPrice);
        orderCostTotals.neonPrice += resolveNumber(cost.neonPrice);
        orderCostTotals.lightingPrice += resolveNumber(cost.lightingPrice);

        const wireType = String(cost.wireType ?? '').toLowerCase();
        if (wireType.includes('шввп')) {
          orderCostTotals.wireShvvp += resolveNumber(cost.wirePrice);
        } else {
          orderCostTotals.wireAcoustic += resolveNumber(cost.wirePrice);
        }
      });
    });

    const SUPPLIE_CATEGORIES = [
      'Акрил',
      'Пленки',
      'Упаковка',
      'Комплектующие для упаковки',
      'Комплектующие для мастеров',
      'Другое',
    ];

    const suppliePositions = await this.prisma.suppliePosition.findMany({
      where: {
        category: { in: SUPPLIE_CATEGORIES },
        supplie: {
          shipmentDate: { startsWith: period },
        },
      },
      select: {
        category: true,
        quantity: true,
        priceForItem: true,
      },
    });

    const supplieTotals = SUPPLIE_CATEGORIES.reduce<Record<string, number>>(
      (acc, category) => {
        acc[category] = 0;
        return acc;
      },
      {},
    );

    suppliePositions.forEach((position) => {
      const category = position.category;
      if (!category) {
        return;
      }
      const total =
        resolveNumber(position.quantity) * resolveNumber(position.priceForItem);
      supplieTotals[category] = (supplieTotals[category] ?? 0) + total;
    });

    const [
      logistShifts,
      frezerReports,
      masterRepairReports,
      otherReports,
      easyneonAdExpenses,
      easybookAdExpenses,
      mopNeonSalesManagers,
      mopBookSalesManagers,
      movBookAccountManagers,
      bookPLDatas,
      installationExpenses,
      productionHeadExpenses,
      easyneonDesignExpenses,
      easyneonDesignLeadExpenses,
      easybookDesignLeadExpenses,
      easyneonSalesDirectorSalary,
      easybookSalesDirectorSalary,
      easyneonMarketingTarget,
      easyneonMarketingAvito,
      easyneonMarketingSmm,
      easyneonMarketingAds38,
      easyneonMarketingAds42,
      easyneonMarketingSubs,
      easyneonRentExpenses,
      easybookRentExpenses,
      vkCashbackExpensesPrev,
      accountingExpenses,
      hrExpenses,
      dividendsExpenses,
      rkoExpenses,
      financeExpenses,
      depositInterestExpenses,
      interestExpenses,
    ] = await Promise.all([
      this.prisma.logistShift.findMany({
        where: {
          shift_date: { startsWith: period },
        },
        select: { cost: true },
      }),
      this.prisma.frezerReport.findMany({
        where: {
          date: { startsWith: period },
        },
        select: { cost: true, penaltyCost: true },
      }),
      this.prisma.masterRepairReport.findMany({
        where: {
          date: { startsWith: period },
          deletedAt: null,
        },
        select: { cost: true, penaltyCost: true },
      }),
      this.prisma.otherReport.findMany({
        where: {
          date: { startsWith: period },
          deletedAt: null,
        },
        select: { cost: true, penaltyCost: true },
      }),
      this.prisma.adExpense.findMany({
        where: {
          date: { startsWith: period },
          groupId: { in: EASYNEON_GROUP_IDS },
        },
        select: { price: true },
      }),
      this.prisma.adExpense.findMany({
        where: {
          date: { startsWith: period },
          groupId: { in: EASYBOOK_GROUP_IDS },
        },
        select: { price: true },
      }),
      this.commercialDatasService.getMOPNeonPNLDatas(period),
      this.commercialDatasService.getMOPBookPNLDatas(period),
      this.commercialDatasService.getMOVBookPNLDatas(period),
      this.getBookPLDatas(period),
      this.getExpensesByCategory([period], 57, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 52, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 72, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 71, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 71, EASYBOOK_PROJECT_ID),
      this.getExpensesByCategory([period], 81, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 81, EASYBOOK_PROJECT_ID),
      this.getExpensesByCategory([period], 83, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 84, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 85, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 38),
      this.getExpensesByCategory([period], 42),
      this.getExpensesByCategory([period], 45),
      this.getExpensesByCategory([period], 36, EASYNEON_PROJECT_ID),
      this.getExpensesByCategory([period], 36, EASYBOOK_PROJECT_ID),
      this.getExpensesByCategory([prevPeriod], 39),
      this.getExpensesByCategory([period], 68),
      this.getExpensesByCategory([period], 43),
      this.getExpensesByCategory([period], 138, GENERAL_PROJECT_ID),
      this.getExpensesByCategory([period], 48),
      this.getExpensesByCategory([period], 151),
      this.getExpensesByCategory([period], 13),
      this.getExpensesByCategory([period], 155),
    ]);

    const sumCostMinusPenalty = (
      items: Array<{ cost: unknown; penaltyCost?: unknown }>,
    ) =>
      items.reduce(
        (sum, item) =>
          sum + resolveNumber(item.cost) - resolveNumber(item.penaltyCost ?? 0),
        0,
      );

    const assemblersTotal = sumCostMinusPenalty(shippedMasterReports);
    const packersTotal = sumCostMinusPenalty(shippedPackerReports);
    const logistTotal = logistShifts.reduce(
      (sum, shift) => sum + resolveNumber(shift.cost),
      0,
    );
    const frezerTotal = sumCostMinusPenalty(frezerReports);
    const repairsTotal = sumCostMinusPenalty(masterRepairReports);
    const otherReportsTotal = sumCostMinusPenalty(otherReports);
    const easyneonDeliveryTotal = easyneon.deliveries
      .filter((delivery) => delivery.type === 'Бесплатно')
      .reduce((sum, delivery) => sum + resolveNumber(delivery.price), 0);
    const easybookDeliveryTotal = easybook.deliveries
      .filter((delivery) => delivery.type === 'Бесплатно')
      .reduce((sum, delivery) => sum + resolveNumber(delivery.price), 0);
    const promotionEasyneonTotal = sumPrices(easyneonAdExpenses);
    const promotionEasybookTotal = sumPrices(easybookAdExpenses);
    const salesManagersEasyneonTotal = resolveNumber(mopNeonSalesManagers);
    const salesManagersEasybookTotal = resolveNumber(mopBookSalesManagers);
    const accountManagersEasybookTotal = resolveNumber(movBookAccountManagers);
    const ropsEasybookTotal = resolveNumber(
      bookPLDatas?.ropSalaries?.find((row) => row.period === period)?.value ??
        0,
    );
    const bookPrintTotal = resolveNumber(
      bookPLDatas?.prodExpensesByPeriod?.find((row) => row.period === period)
        ?.value ?? 0,
    );
    const bookDesignTotal = resolveNumber(
      bookPLDatas?.designExpensesByPeriod?.find((row) => row.period === period)
        ?.value ?? 0,
    );
    const installersTotal = resolveNumber(
      installationExpenses?.[0]?.value ?? 0,
    );
    const productionHeadTotal = resolveNumber(
      productionHeadExpenses?.[0]?.value ?? 0,
    );
    const easyneonDesignTotal = resolveNumber(
      easyneonDesignExpenses?.[0]?.value ?? 0,
    );
    const easyneonDesignLeadTotal = resolveNumber(
      easyneonDesignLeadExpenses?.[0]?.value ?? 0,
    );
    const easybookDesignLeadTotal = resolveNumber(
      easybookDesignLeadExpenses?.[0]?.value ?? 0,
    );
    const easyneonSalesDirectorSalaryTotal = resolveNumber(
      easyneonSalesDirectorSalary?.[0]?.value ?? 0,
    );
    const easybookSalesDirectorSalaryTotal = resolveNumber(
      easybookSalesDirectorSalary?.[0]?.value ?? 0,
    );
    const easyneonMarketingTargetTotal = resolveNumber(
      easyneonMarketingTarget?.[0]?.value ?? 0,
    );
    const easyneonMarketingAvitoTotal = resolveNumber(
      easyneonMarketingAvito?.[0]?.value ?? 0,
    );
    const easyneonMarketingSmmTotal = resolveNumber(
      easyneonMarketingSmm?.[0]?.value ?? 0,
    );
    const easyneonMarketingAdsTotal =
      resolveNumber(easyneonMarketingAds38?.[0]?.value ?? 0) +
      resolveNumber(easyneonMarketingAds42?.[0]?.value ?? 0);
    const easyneonMarketingSubsTotal = resolveNumber(
      easyneonMarketingSubs?.[0]?.value ?? 0,
    );
    const easyneonRentTotal = resolveNumber(
      easyneonRentExpenses?.[0]?.value ?? 0,
    );
    const easybookRentTotal = resolveNumber(
      easybookRentExpenses?.[0]?.value ?? 0,
    );

    const vkCashbackBaseTotal = resolveNumber(
      vkCashbackExpensesPrev?.[0]?.value ?? 0,
    );
    const vkCashbackTotalRaw = vkCashbackBaseTotal * 0.17;
    const vkCashbackTotal = vkCashbackTotalRaw ? vkCashbackTotalRaw : 0;
    const accountingTotal = resolveNumber(accountingExpenses?.[0]?.value ?? 0);
    const hrTotal = resolveNumber(hrExpenses?.[0]?.value ?? 0);
    const dividendsTotal = resolveNumber(dividendsExpenses?.[0]?.value ?? 0);
    const rkoTotal = resolveNumber(rkoExpenses?.[0]?.value ?? 0);
    const financeTotal = resolveNumber(financeExpenses?.[0]?.value ?? 0);
    const depositInterestTotal = resolveNumber(
      depositInterestExpenses?.[0]?.value ?? 0,
    );
    const interestExpensesTotal = resolveNumber(
      interestExpenses?.[0]?.value ?? 0,
    );

    const staffTotal =
      productionHeadTotal +
      assemblersTotal +
      packersTotal +
      logistTotal +
      frezerTotal;

    const easyneonMaterialsTotal =
      orderCostTotals.priceForBoard +
      orderCostTotals.priceForScreen +
      orderCostTotals.adapterPrice +
      orderCostTotals.neonPrice +
      orderCostTotals.lightingPrice +
      orderCostTotals.wireAcoustic +
      orderCostTotals.wireShvvp +
      (supplieTotals['Акрил'] ?? 0) +
      (supplieTotals['Пленки'] ?? 0) +
      (supplieTotals['Упаковка'] ?? 0) +
      (supplieTotals['Комплектующие для упаковки'] ?? 0) +
      (supplieTotals['Комплектующие для мастеров'] ?? 0) +
      (supplieTotals['Другое'] ?? 0);

    const easyneonCogsTotal =
      easyneonMaterialsTotal +
      staffTotal +
      installersTotal +
      repairsTotal +
      otherReportsTotal +
      easyneonDeliveryTotal +
      easyneonRentTotal;

    const easybookCogsTotal =
      bookPrintTotal + easybookDeliveryTotal + easybookRentTotal;

    const grossProfitEasyneon = easyneon.shipped - easyneonCogsTotal;
    const grossProfitEasybook = easybook.shipped - easybookCogsTotal;
    const totalRevenue = easyneon.shipped + easybook.shipped;
    const roundPercent = (value: number) => Math.round(value * 100) / 100;
    const grossMarginEasyneon =
      easyneon.shipped > 0
        ? roundPercent((grossProfitEasyneon / easyneon.shipped) * 100)
        : 0;
    const grossMarginEasybook =
      easybook.shipped > 0
        ? roundPercent((grossProfitEasybook / easybook.shipped) * 100)
        : 0;
    const grossMarginTotal =
      totalRevenue > 0
        ? roundPercent(
            ((grossProfitEasyneon + grossProfitEasybook) / totalRevenue) * 100,
          )
        : 0;
    const vatEasyneon = easyneon.shipped * 0.05;
    const vatEasybook = easybook.shipped * 0.05;

    const commercialEasyneon =
      easyneonDesignLeadTotal +
      easyneonDesignTotal +
      easyneonSalesDirectorSalaryTotal +
      salesManagersEasyneonTotal +
      easyneonMarketingTargetTotal +
      easyneonMarketingAvitoTotal +
      easyneonMarketingSmmTotal;

    const commercialEasybook =
      easybookDesignLeadTotal +
      bookDesignTotal +
      easybookSalesDirectorSalaryTotal +
      salesManagersEasybookTotal +
      accountManagersEasybookTotal +
      ropsEasybookTotal;

    const commercialWithPromotionEasyneon =
      commercialEasyneon + promotionEasyneonTotal;
    const commercialWithPromotionEasybook =
      commercialEasybook + promotionEasybookTotal;

    const marginalIncomeEasyneon =
      grossProfitEasyneon - commercialWithPromotionEasyneon - vatEasyneon;
    const marginalIncomeEasybook =
      grossProfitEasybook - commercialWithPromotionEasybook - vatEasybook;

    const servicesSubscriptionsTotal =
      easyneonMarketingAdsTotal + easyneonMarketingSubsTotal;
    const operatingExpensesTotal =
      accountingTotal +
      servicesSubscriptionsTotal +
      hrTotal +
      rkoTotal +
      100000;

    const ebitdaTotal =
      marginalIncomeEasyneon + marginalIncomeEasybook - operatingExpensesTotal;
    const ebitdaMargin =
      totalRevenue > 0 ? roundPercent((ebitdaTotal / totalRevenue) * 100) : 0;

    const belowEbitdaTotal = 0;
    const profitBeforeTax =
      ebitdaTotal +
      vkCashbackTotal +
      depositInterestTotal -
      interestExpensesTotal;
    const profitBeforeTaxMargin =
      totalRevenue > 0
        ? roundPercent((profitBeforeTax / totalRevenue) * 100)
        : 0;

    const taxesPayroll = 0;
    const profitTax = (totalRevenue - (vatEasyneon + vatEasybook)) * 0.01;
    const taxLoadBase = totalRevenue - (vatEasyneon + vatEasybook);
    const taxLoad =
      taxLoadBase > 0
        ? roundPercent(
            ((taxesPayroll + profitTax + vatEasyneon + vatEasybook) /
              taxLoadBase) *
              100,
          )
        : 0;

    const netProfit = profitBeforeTax - taxesPayroll - profitTax;
    const netProfitMargin =
      totalRevenue > 0 ? roundPercent((netProfit / totalRevenue) * 100) : 0;
    const marginalMarginEasyneon =
      easyneon.shipped > 0
        ? roundPercent((marginalIncomeEasyneon / easyneon.shipped) * 100)
        : 0;
    const marginalMarginEasybook =
      easybook.shipped > 0
        ? roundPercent((marginalIncomeEasybook / easybook.shipped) * 100)
        : 0;
    const marginalMarginTotal =
      totalRevenue > 0
        ? roundPercent(
            ((marginalIncomeEasyneon + marginalIncomeEasybook) / totalRevenue) *
              100,
          )
        : 0;

    return {
      period,
      rows: {
        'revenue-easyneon-orders': easyneon.orders,
        'revenue-easyneon-paid': easyneon.paid,
        revenue: easyneon.shipped + easybook.shipped,
        'revenue-easyneon': easyneon.shipped,
        'revenue-easybook': easybook.shipped,
        'revenue-easyneon-shipped': easyneon.shipped,
        'revenue-easybook-orders': easybook.orders,
        'revenue-easybook-paid': easybook.paid,
        'revenue-easybook-shipped': easybook.shipped,
        'gross-profit-easyneon': grossProfitEasyneon,
        'gross-profit-easybook': grossProfitEasybook,
        'gross-margin': grossMarginTotal,
        'gross-margin-easyneon': grossMarginEasyneon,
        'gross-margin-easybook': grossMarginEasybook,
        'vat-easyneon': vatEasyneon,
        'vat-easybook': vatEasybook,
        'marginal-income-easyneon': marginalIncomeEasyneon,
        'marginal-income-easybook': marginalIncomeEasybook,
        'marginal-margin': marginalMarginTotal,
        'marginal-margin-easyneon': marginalMarginEasyneon,
        'marginal-margin-easybook': marginalMarginEasybook,
        'promotion-easyneon': promotionEasyneonTotal,
        'promotion-easybook': promotionEasybookTotal,
        'easyneon-sales-managers': salesManagersEasyneonTotal,
        'easybook-sales-managers': salesManagersEasybookTotal,
        'easybook-sales-accounts': accountManagersEasybookTotal,
        'easybook-sales-rops': ropsEasybookTotal,
        'easyneon-design-head': easyneonDesignLeadTotal,
        'easyneon-design-team': easyneonDesignTotal,
        'easybook-design-head': easybookDesignLeadTotal,
        'easyneon-sales-cd-salary': easyneonSalesDirectorSalaryTotal,
        'easybook-sales-cd-salary': easybookSalesDirectorSalaryTotal,
        'easyneon-marketing-target': easyneonMarketingTargetTotal,
        'easyneon-marketing-avito': easyneonMarketingAvitoTotal,
        'easyneon-marketing-smm': easyneonMarketingSmmTotal,
        'operating-expenses-accounting': accountingTotal,
        'operating-expenses-services': servicesSubscriptionsTotal,
        'operating-expenses-finance': financeTotal,
        'operating-expenses-hr': hrTotal,
        'operating-expenses-rko': rkoTotal,
        'cogs-easybook-print': bookPrintTotal,
        'cogs-easybook-delivery': easybookDeliveryTotal,
        'cogs-easybook-rent': easybookRentTotal,
        'easybook-design-team': bookDesignTotal,
        'operating-expenses-dev': 100000,
        ebitda: ebitdaTotal,
        'ebitda-margin': ebitdaMargin,
        'below-ebitda': belowEbitdaTotal,
        'below-ebitda-interest': interestExpensesTotal,
        'other-income-vk-cashback': vkCashbackTotal,
        'other-income-deposit-interest': depositInterestTotal,
        'profit-before-tax': profitBeforeTax,
        'profit-before-tax-margin': profitBeforeTaxMargin,
        'taxes-payroll': taxesPayroll,
        'taxes-profit': profitTax,
        'taxes-load': taxLoad,
        'net-profit': netProfit,
        'net-profit-margin': netProfitMargin,
        'net-profit-dividends': dividendsTotal,
        'cogs-easyneon-materials': easyneonMaterialsTotal,
        'cogs-easyneon-staff': staffTotal,
        'cogs-easyneon-prod-head': productionHeadTotal,
        'cogs-easyneon-assemblers': assemblersTotal,
        'cogs-easyneon-packers': packersTotal,
        'cogs-easyneon-logist': logistTotal,
        'cogs-easyneon-millers': frezerTotal,
        'cogs-easyneon-installers': installersTotal,
        'cogs-easyneon-repair': repairsTotal,
        'cogs-easyneon-repair-other': otherReportsTotal,
        'cogs-easyneon-delivery': easyneonDeliveryTotal,
        'cogs-easyneon-rent': easyneonRentTotal,
        'cogs-easyneon-polycarbonate': orderCostTotals.priceForBoard,
        'cogs-easyneon-screen': orderCostTotals.priceForScreen,
        'cogs-easyneon-power': orderCostTotals.adapterPrice,
        'cogs-easyneon-neon': orderCostTotals.neonPrice,
        'cogs-easyneon-lighting': orderCostTotals.lightingPrice,
        'cogs-easyneon-acoustic': orderCostTotals.wireAcoustic,
        'cogs-easyneon-shvvp': orderCostTotals.wireShvvp,
        'cogs-easyneon-acrylic': supplieTotals['Акрил'],
        'cogs-easyneon-film': supplieTotals['Пленки'],
        'cogs-easyneon-pack': supplieTotals['Упаковка'],
        'cogs-easyneon-pack-parts': supplieTotals['Комплектующие для упаковки'],
        'cogs-easyneon-master-parts':
          supplieTotals['Комплектующие для мастеров'],
        'cogs-easyneon-other': supplieTotals['Другое'],
      },
    };
  }
}
