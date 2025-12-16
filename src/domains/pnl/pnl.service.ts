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
          (a, b) => a + b.priceForItem * b.quantity,
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
      this.getIncomeDatas(periods, { in: [19] }),

      // Расходы на производство - оптимизированный запрос
      this.getExpensesByCategory(periods, 143),

      // Расходы на дизайн - оптимизированный запрос
      this.getExpensesByCategory(periods, 141),

      // Расходы на рекламу - оптимизированный запрос
      this.getAdExpensesByPeriods(periods, 19),

      // Зарплаты (используем уже полученные списки пользователей)
      // this.getSalariesForUsers(periods, mops, getManagerDatasCached),
      // this.getSalariesForUsers(periods, rops, getManagerDatasCached),
      // this.getSalariesForUsers(periods, movs, getManagerDatasCached),
    ]);

    const rops = await this.prisma.user.findMany({
      where: {
        role: {
          shortName: 'ROP',
        },
        groupId: 19,
      },
    });

    const ropSalaries = income.map((i) => {
      // console.log(i.revenue);
      return {
        period: i.period,
        value: i.revenue * 0.01 * rops.length,
      };
    });

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
  ): Promise<{ period: string; value: number }[]> {
    // Один запрос вместо 4-х
    const allExpenses = await this.prisma.operationPosition.findMany({
      where: {
        expenseCategoryId: categoryId,
        OR: periods.map((p) => ({
          originalOperation: {
            operationDate: {
              startsWith: p,
            },
          },
        })),
      },
      select: {
        amount: true,
        originalOperation: {
          select: {
            operationDate: true,
          },
        },
      },
    });

    // Группируем по периодам
    const grouped = periods.map((period) => {
      const value = allExpenses
        .filter((exp) =>
          exp.originalOperation?.operationDate.startsWith(period),
        )
        .reduce((sum, exp) => sum + exp.amount, 0);

      return { period, value };
    });

    return grouped;
  }

  // Приватная функция: один запрос на рекламные расходы
  private async getAdExpensesByPeriods(
    periods: string[],
    groupId: number,
  ): Promise<{ period: string; value: number }[]> {
    // Один запрос вместо 4-х
    const allAdExpenses = await this.prisma.adExpense.findMany({
      where: {
        groupId,
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

  // Приватная функция: расчет зарплат для списка пользователей
  private async getSalariesForUsers(
    periods: string[],
    users: { id: number }[],
    getManagerDatasCached: (period: string, userId: number) => Promise<any>,
  ): Promise<{ period: string; value: number }[]> {
    return await Promise.all(
      periods.map(async (period) => {
        const salaries = await Promise.all(
          users.map(async (u) => {
            const result = await getManagerDatasCached(period, u.id);
            return result;
          }),
        );

        const value = +salaries
          .reduce((sum, data) => sum + data.totalSalary, 0)
          .toFixed(2);

        return { value, period };
      }),
    );
  }
}
