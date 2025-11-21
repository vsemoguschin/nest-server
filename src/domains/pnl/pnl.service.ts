import { Injectable } from '@nestjs/common';
import { UserDto } from '../users/dto/user.dto';
import { subMonths, format } from 'date-fns';
import { CommercialDatasService } from '../commercial-datas/commercial-datas.service';
import { PrismaService } from 'src/prisma/prisma.service';

type resType = {
  periods: string[];
  income: {
    allDealsPrice: {
      period: string;
      value: number;
      changePercent?: number;
    }[];
    sendDeals: {
      period: string;
      value: number;
      changePercent?: number;
    }[];
    revenue: {
      period: string;
      value: number;
      changePercent?: number;
    }[];
  };
  expenses: {
    production: {
      supplies: {
        data: {
          category: string;
          data: { period: string; value: number; changePercent: number }[];
        }[];
        totals: { value: number; changePercent: number }[];
      };
      productionSalaries: {
        data: {
          role: string;
          data: { period: string; value: number; changePercent: number }[];
        }[];
        totals: { value: number; changePercent: number }[];
      };
    };
    commercial: {
      adExpenses: {
        data: {
          title: string;
          data: { period: string; value: number; changePercent: number }[];
        }[];
        totals: { value: number; changePercent: number }[];
      };
      commercialSalaries: {
        data: {
          role: string;
          data: { period: string; value: number; changePercent: number }[];
        }[];
        totals: { value: number; changePercent: number }[];
      };
    };
    totals: {
      data: {
        title: string;
        data: { value: number; changePercent: number }[];
      }[];
      totals: { value: number; changePercent: number }[];
    };
  };
};

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
    const income = await periods.reduce(
      async (
        accPromise: Promise<
          {
            period: string;
            allDealsPrice: number;
            revenue: number;
            sendDeals: number;
          }[]
        >,
        p,
      ) => {
        const acc = await accPromise;
        const periodStart = Date.now();
        console.log(`  [Income] Начало обработки периода ${p}`);

        const deals = await this.prisma.deal.findMany({
          where: {
            saleDate: {
              startsWith: p,
            },
            reservation: false,
            status: { not: 'Возврат' },
            groupId: groupSearch,
          },
          select: {
            price: true,
          },
        });
        console.log(
          `  [Income] Запрос deals для ${p}: ${Date.now() - periodStart}ms`,
        );

        const dops = await this.prisma.dop.findMany({
          where: {
            saleDate: {
              startsWith: p,
            },
            deal: {
              reservation: false,
              status: { not: 'Возврат' },
              deletedAt: null,
            },
            groupId: groupSearch,
          },
          select: {
            price: true,
          },
        });
        console.log(
          `  [Income] Запрос dops для ${p}: ${Date.now() - periodStart}ms`,
        );

        const dopsPrice = dops.reduce((a, b) => a + b.price, 0);
        const allDealsPrice =
          deals.reduce((a, b) => a + b.price, 0) + dopsPrice;

        const payments = await this.prisma.payment.findMany({
          where: {
            date: {
              startsWith: p,
            },
            deal: {
              reservation: false,
              status: { not: 'Возврат' },
              deletedAt: null,
              groupId: groupSearch,
            },
          },
          select: {
            price: true,
          },
        });
        console.log(
          `  [Income] Запрос payments для ${p}: ${Date.now() - periodStart}ms`,
        );

        const revenue = payments.reduce((a, b) => a + b.price, 0);

        // Отправленные доставки
        const sendDeliveries = await this.prisma.delivery.findMany({
          where: {
            date: {
              startsWith: p,
            },
            // status: 'Отправлена',
            deal: {
              status: { not: 'Возврат' },
              reservation: false,
              deletedAt: null,
              groupId: groupSearch,
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
        console.log(
          `  [Income] Запрос deliveries для ${p}: ${Date.now() - periodStart}ms`,
        );

        const sendDeals = sendDeliveries.reduce(
          (a, b) =>
            a + b.deal.price + b.deal.dops.reduce((a, b) => a + b.price, 0),
          0,
        );

        console.log(
          `  [Income] ✓ Период ${p} обработан за ${Date.now() - periodStart}ms`,
        );
        acc.push({
          period: p,
          allDealsPrice,
          revenue,
          sendDeals,
        });
        return acc;
      },
      Promise.resolve([]),
    );

    return income;
  }

  async getPLDatas(period: string, project: string = 'all', user: UserDto) {
    const startTime = Date.now();
    console.log(
      `[PNL] Начало выполнения getPLDatas для периода ${period}, проект: ${project}`,
    );

    let groupSearch: { gt: number } | { in: number[] } = { gt: 0 };
    if (project === 'all') {
      groupSearch = { gt: 0 };
    } else if (project === 'neon') {
      groupSearch = { in: [2, 3, 4, 18] };
    } else if (project === 'book') {
      groupSearch = { in: [19] };
    }
    const periods = getLastMonths(period, 4);
    console.log(
      `[PNL] Определение групп и периодов: ${Date.now() - startTime}ms`,
    );
    type ManagerDatasResult = Awaited<
      ReturnType<typeof this.commercialDatasService.getManagerDatas>
    >;
    const managerDatasCache = new Map<string, ManagerDatasResult>();
    const getManagerDatasCached = async (
      periodKey: string,
      managerId: number,
    ) => {
      const cacheKey = `${managerId}:${periodKey}`;
      const cached = managerDatasCache.get(cacheKey);
      if (cached) {
        return cached;
      }
      const data = await this.commercialDatasService.getManagerDatas(
        user,
        periodKey,
        managerId,
      );
      managerDatasCache.set(cacheKey, data);
      return data;
    };
    const getTotals = (
      model: {
        data: {
          // period: string;
          value: number;
          changePercent: number;
        }[];
      }[],
    ) => {
      // console.log(model);
      return periods.map((p, i) => {
        const sendDeals = res.income.sendDeals[i].value;
        const value = model.reduce((a, b) => a + b.data[i]?.value || 0, 0);
        // const value = model[i].data.reduce((a, b) => a + b.value, 0);

        return {
          value,
          changePercent: sendDeals ? +((value / sendDeals) * 100) : 0,
        };
      });
    };

    const res: resType = {
      periods,
      income: {
        allDealsPrice: [],
        sendDeals: [],
        revenue: [],
      },
      expenses: {
        production: {
          supplies: {
            data: [],
            totals: [],
          },
          productionSalaries: {
            data: [],
            totals: [],
          },
        },
        commercial: {
          adExpenses: {
            data: [],
            totals: [],
          },
          commercialSalaries: {
            data: [],
            totals: [],
          },
        },
        totals: {
          data: [],
          totals: [],
        },
      },
    };

    const income = await this.getIncomeDatas(periods, groupSearch);
    console.log(`[PNL] Получение income данных: ${Date.now() - startTime}ms`);

    // Присваивание в нужный формат с расчетом changePercent
    res.income = {
      allDealsPrice: income.map((r, index) => ({
        period: r.period,
        value: r.allDealsPrice,
        changePercent:
          index === 0
            ? 0
            : +(
                ((r.allDealsPrice - income[index - 1].allDealsPrice) /
                  (income[index - 1].allDealsPrice || 1)) *
                100
              ).toFixed(2),
      })),
      sendDeals: income.map((r, index) => ({
        period: r.period,
        value: r.sendDeals,
        changePercent:
          index === 0
            ? 0
            : +(
                ((r.sendDeals - income[index - 1].sendDeals) /
                  (income[index - 1].sendDeals || 1)) *
                100
              ).toFixed(2),
      })),
      revenue: income.map((r, index) => ({
        period: r.period,
        value: r.revenue,
        changePercent:
          index === 0
            ? 0
            : +(
                ((r.revenue - income[index - 1].revenue) /
                  (income[index - 1].revenue || 1)) *
                100
              ).toFixed(2),
      })),
    };
    console.log(
      `[PNL] Форматирование income с changePercent: ${Date.now() - startTime}ms`,
    );

    if (project !== 'book') {
      const supplieCategories = await this.prisma.suppliePosition.findMany({
        select: {
          category: true,
        },
        distinct: ['category'],
      });

      const supplies = await Promise.all(
        supplieCategories.map(async (sup) => {
          const data = await Promise.all(
            periods.map(async (p, index) => {
              const supplies = await this.prisma.supplie.findMany({
                where: {
                  date: {
                    startsWith: p,
                  },
                  positions: {
                    some: {
                      category: sup.category,
                    },
                  },
                },
                include: {
                  positions: true,
                },
              });

              const value = supplies
                .flatMap((s) => s.positions)
                .filter((p) => p.category === sup.category)
                .reduce((a, b) => a + b.priceForItem * b.quantity, 0);

              const sendDeals = res.income.sendDeals[index].value;

              return {
                period: p,
                value,
                changePercent: sendDeals
                  ? +((value / sendDeals) * 100).toFixed(2)
                  : 0,
              };
            }),
          );
          return {
            category: sup.category || 'Без категории',
            data,
          };
        }),
      );

      // Сортировка по значению value последнего периода по убыванию
      res.expenses.production.supplies.data = supplies.sort((a, b) => {
        const lastA = a.data[a.data.length - 1]?.value || 0;
        const lastB = b.data[b.data.length - 1]?.value || 0;
        return lastB - lastA;
      });

      res.expenses.production.supplies.totals = getTotals(supplies);
      console.log(
        `[PNL] Получение и обработка supplies: ${Date.now() - startTime}ms`,
      );

      const prodRoles = [
        'Упаковщики',
        'Фрезеровщики',
        'Сборщики',
        'Ремонты',
        'Другое',
        // 'Директор производства?',
        // 'Монтажники?',
        // 'Аренда?',
        // 'Содержание офиса?',
      ];

      const prodSalaries = await Promise.all(
        prodRoles.map(async (role) => {
          if (role === 'Фрезеровщики') {
            const data = await Promise.all(
              periods.map(async (p, index) => {
                const frezerReports = await this.prisma.frezerReport.findMany({
                  where: {
                    date: {
                      startsWith: p, // Исправлено с period на p
                    },
                  },
                });

                const sendDeals = res.income.sendDeals[index].value;
                const value = frezerReports.reduce(
                  (a, b) => a + b.cost - b.penaltyCost,
                  0,
                );

                return {
                  period: p,
                  value,
                  changePercent: sendDeals
                    ? +((value / sendDeals) * 100).toFixed(2)
                    : 0,
                };
              }),
            );
            return {
              role,
              data,
            };
          }
          if (role === 'Сборщики') {
            const data = await Promise.all(
              periods.map(async (p, index) => {
                const masterReports = await this.prisma.masterReport.findMany({
                  where: {
                    date: {
                      startsWith: p, // Исправлено с period на p
                    },
                  },
                });
                const sendDeals = res.income.sendDeals[index].value;
                const value = masterReports.reduce(
                  (a, b) => a + b.cost - b.penaltyCost,
                  0,
                );
                return {
                  period: p,
                  value,
                  changePercent: sendDeals
                    ? +((value / sendDeals) * 100).toFixed(2)
                    : 0,
                };
              }),
            );
            return {
              role,
              data,
            };
          }
          if (role === 'Упаковщики') {
            const data = await Promise.all(
              periods.map(async (p, index) => {
                const packerReports = await this.prisma.packerReport.findMany({
                  where: {
                    date: {
                      startsWith: p, // Исправлено с period на p
                    },
                  },
                });
                const sendDeals = res.income.sendDeals[index].value;
                const value = packerReports.reduce(
                  (a, b) => a + b.cost - b.penaltyCost,
                  0,
                );
                return {
                  period: p,
                  value,
                  changePercent: sendDeals
                    ? +((value / sendDeals) * 100).toFixed(2)
                    : 0,
                };
              }),
            );
            return {
              role,
              data,
            };
          }
          if (role === 'Ремонты') {
            const data = await Promise.all(
              periods.map(async (p, index) => {
                const repairReports =
                  await this.prisma.masterRepairReport.findMany({
                    where: {
                      date: {
                        startsWith: p, // Исправлено с period на p
                      },
                    },
                  });
                const sendDeals = res.income.sendDeals[index].value;
                const value = repairReports.reduce(
                  (a, b) => a + b.cost - b.penaltyCost,
                  0,
                );
                return {
                  period: p,
                  value,
                  changePercent: sendDeals
                    ? +((value / sendDeals) * 100).toFixed(2)
                    : 0,
                };
              }),
            );
            return {
              role,
              data,
            };
          }
          if (role === 'Другое') {
            const data = await Promise.all(
              periods.map(async (p, index) => {
                const otherReports = await this.prisma.otherReport.findMany({
                  where: {
                    date: {
                      startsWith: p, // Исправлено с period на p
                    },
                  },
                });
                const sendDeals = res.income.sendDeals[index].value;
                const value = otherReports.reduce(
                  (a, b) => a + b.cost - b.penaltyCost,
                  0,
                );
                return {
                  period: p,
                  value,
                  changePercent: sendDeals
                    ? +((value / sendDeals) * 100).toFixed(2)
                    : 0,
                };
              }),
            );
            return {
              role,
              data,
            };
          }
        }),
      );

      // Сортировка по значению value последнего периода по убыванию
      const sortedProdSalaries = prodSalaries
        .filter((item): item is NonNullable<typeof item> => item !== undefined)
        .sort((a, b) => {
          const lastA = a.data[a.data.length - 1]?.value || 0;
          const lastB = b.data[b.data.length - 1]?.value || 0;
          return lastB - lastA;
        });

      // Подсчет totals для каждого периода
      const prodSalariesTotals = periods.map((p, index) => {
        const sendDeals = res.income.sendDeals[index].value;
        const value = sortedProdSalaries.reduce((sum, role) => {
          const periodData = role.data.find((d) => d.period === p);
          return sum + (periodData?.value || 0);
        }, 0);
        return {
          value,
          changePercent: sendDeals
            ? +((value / sendDeals) * 100).toFixed(2)
            : 0,
        };
      });

      res.expenses.production.productionSalaries = {
        data: sortedProdSalaries,
        totals: prodSalariesTotals,
      };
      console.log(
        `[PNL] Получение и обработка production salaries: ${Date.now() - startTime}ms`,
      );
    }
    const adSources = await this.prisma.adSource.findMany({
      select: {
        title: true,
      },
      where: {
        groupId: groupSearch,
      },
      distinct: ['title'],
    });

    const adExpenses = await Promise.all(
      adSources.map(async (ads) => {
        const data = await Promise.all(
          periods.map(async (p, index) => {
            const adExpenses = await this.prisma.adExpense.findMany({
              where: {
                date: {
                  startsWith: p,
                },
                adSource: {
                  title: ads.title,
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
            const sendDeals = res.income.sendDeals[index].value;
            const value = adExpenses.reduce((a, b) => a + b.price, 0);

            return {
              period: p,
              value,
              changePercent: sendDeals
                ? +((value / sendDeals) * 100).toFixed(2)
                : 0,
            };
          }),
        );
        return {
          title: ads.title,
          data,
        };
      }),
    );

    res.expenses.commercial.adExpenses.data = adExpenses.sort((a, b) => {
      const lastA = a.data[a.data.length - 1]?.value || 0;
      const lastB = b.data[b.data.length - 1]?.value || 0;
      return lastB - lastA;
    });

    res.expenses.commercial.adExpenses.totals = getTotals(adExpenses);
    console.log(
      `[PNL] Получение и обработка ad expenses: ${Date.now() - startTime}ms`,
    );

    // Параллельная обработка MOP и ROP одновременно
    const salariesStartTime = Date.now();
    const [mopSalaries, ropSalaries] = await Promise.all([
      // MOP Salaries
      Promise.all(
        periods.map(async (p, index) => {
          const mops = await this.prisma.user.findMany({
            where: {
              role: {
                shortName: { in: ['MOP', 'ROP'] },
              },
              groupId: groupSearch,
              OR: [
                { deletedAt: null }, // Не удаленные
                { deletedAt: { gte: subMonths(new Date(), 2) } }, // Удаленные менее 2 месяцев назад
              ],
            },
          });
          console.log(
            `  [MOP] Найдено ${mops.length} менеджеров для периода ${p}`,
          );

          // Параллельная обработка всех менеджеров
          const salariesStart = Date.now();
          const salaries = await Promise.all(
            mops.map(async (m) => {
              const start = Date.now();
              const result = await getManagerDatasCached(p, m.id);
              const time = Date.now() - start;
              if (time > 1000) {
                console.log(`    ⚠️ Медленный менеджер [${m.id}]: ${time}ms`);
              }
              return result;
            }),
          );
          console.log(
            `  [MOP] Обработка ${mops.length} менеджеров заняла ${Date.now() - salariesStart}ms`,
          );

          const value = salaries.reduce(
            (sum, data) => sum + data.totalSalary,
            0,
          );
          const sendDeals = res.income.sendDeals[index].value;

          return {
            value,
            period: p,
            changePercent: sendDeals
              ? +((value / sendDeals) * 100).toFixed(2)
              : 0,
          };
        }),
      ),
      // ROP Salaries
      Promise.all(
        periods.map(async (p, index) => {
          const rops = await this.prisma.user.findMany({
            where: {
              id: { in: [21] },
              groupId: groupSearch,
              OR: [
                { deletedAt: null }, // Не удаленные
                { deletedAt: { gte: subMonths(new Date(), 2) } }, // Удаленные менее 2 месяцев назад
              ],
            },
          });
          console.log(`  [ROP] Найдено ${rops.length} РОПов для периода ${p}`);

          // Параллельная обработка всех РОПов
          const salariesStart = Date.now();
          const salaries = await Promise.all(
            rops.map(async (r) => {
              const start = Date.now();
              const result = await getManagerDatasCached(p, r.id);
              const time = Date.now() - start;
              console.log(`    [ROP ${r.id}] Обработка заняла: ${time}ms`);
              return result;
            }),
          );
          console.log(
            `  [ROP] Обработка ${rops.length} РОПов заняла ${Date.now() - salariesStart}ms`,
          );

          const value = salaries.reduce(
            (sum, data) => sum + data.totalSalary,
            0,
          );
          const sendDeals = res.income.sendDeals[index].value;

          return {
            value,
            period: p,
            changePercent: sendDeals
              ? +((value / sendDeals) * 100).toFixed(2)
              : 0,
          };
        }),
      ),
    ]);
    console.log(
      `[PNL] ✓ Получение MOP и ROP salaries завершено за: ${Date.now() - salariesStartTime}ms (общее время: ${Date.now() - startTime}ms)`,
    );

    const disSalaries = await Promise.all(
      periods.map(async (p, index) => {
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
        const sendDeals = res.income.sendDeals[index].value;
        return {
          period: p,
          value,
          changePercent: sendDeals
            ? +((value / sendDeals) * 100).toFixed(2)
            : 0,
          // more: designers
          //   .map((d) => ({
          //     role: 'Дизайнер',
          //     manager: d.fullName,
          //     salary: +d.salaryPays.reduce((a, b) => a + b.price, 0).toFixed(2),
          //   }))
          //   .filter((d) => d.salary > 0),
        };
      }),
    );
    const movSalaries = await Promise.all(
      periods.map(async (p, index) => {
        const movs = await this.prisma.user.findMany({
          where: {
            role: {
              shortName: 'MOV',
            },
          },
          include: {
            salaryPays: {
              where: {
                period,
              },
            },
          },
        });
        const value = movs.reduce(
          (a, b) => a + b.salaryPays.reduce((a, b) => a + b.price, 0),
          0,
        );
        const sendDeals = res.income.sendDeals[index].value;
        return {
          period: p,
          value,
          changePercent: sendDeals
            ? +((value / sendDeals) * 100).toFixed(2)
            : 0,
          // more: movs
          //   .map((d) => ({
          //     role: 'Менеджеры отдела ведения',
          //     manager: d.fullName,
          //     salary: +d.salaryPays.reduce((a, b) => a + b.price, 0).toFixed(2),
          //   }))
          //   .filter((d) => d.salary > 0),
        };
      }),
    );
    const kdSalaries = await Promise.all(
      periods.map(async (p, index) => {
        const sendDeals = res.income.sendDeals[index].value;

        return {
          period: p,
          value: 100_000,
          changePercent: sendDeals
            ? +((100_000 / sendDeals) * 100).toFixed(2)
            : 0,
        };
      }),
    );
    const comSalariesData = [
      {
        role: 'Коммерческий директор?',
        data: kdSalaries,
      },
      {
        role: 'РОПы',
        data: ropSalaries,
      },
      {
        role: 'Менеджеры отдела продаж',
        data: mopSalaries,
      },
      {
        role: 'Менеджеры отдела ведения',
        data: movSalaries,
      },
      {
        role: 'Дизайнеры',
        data: disSalaries,
      },
    ];

    res.expenses.commercial.commercialSalaries.data = comSalariesData.sort(
      (a, b) => {
        const lastA = a.data[a.data.length - 1]?.value || 0;
        const lastB = b.data[b.data.length - 1]?.value || 0;
        return lastB - lastA;
      },
    );

    res.expenses.commercial.commercialSalaries.totals =
      getTotals(comSalariesData);
    console.log(
      `[PNL] Получение всех commercial salaries (MOP, ROP, DIZ, MOV, KD): ${Date.now() - startTime}ms`,
    );

    const mainTotals = [
      {
        title: 'Расходы на поставки',
        data: res.expenses.production.supplies.totals.map((item, index) => {
          const sendDeals = res.income.sendDeals[index].value;
          return {
            value: item.value,
            changePercent: sendDeals
              ? +((item.value / sendDeals) * 100).toFixed(2)
              : 0,
          };
        }),
      },
      {
        title: 'Зарплаты производства',
        data: res.expenses.production.productionSalaries.totals.map(
          (item, index) => {
            const sendDeals = res.income.sendDeals[index].value;
            return {
              value: item.value,
              changePercent: sendDeals
                ? +((item.value / sendDeals) * 100).toFixed(2)
                : 0,
            };
          },
        ),
      },
      {
        title: 'Расходы на рекламу',
        data: res.expenses.commercial.adExpenses.totals.map((item, index) => {
          const sendDeals = res.income.sendDeals[index].value;
          return {
            value: item.value,
            changePercent: sendDeals
              ? +((item.value / sendDeals) * 100).toFixed(2)
              : 0,
          };
        }),
      },
      {
        title: 'Зарплаты коммерческого отдела',
        data: res.expenses.commercial.commercialSalaries.totals.map(
          (item, index) => {
            const sendDeals = res.income.sendDeals[index].value;
            return {
              value: item.value,
              changePercent: sendDeals
                ? +((item.value / sendDeals) * 100).toFixed(2)
                : 0,
            };
          },
        ),
      },
    ];

    res.expenses.totals.data = mainTotals.sort((a, b) => {
      const lastA = a.data[a.data.length - 1]?.value || 0;
      const lastB = b.data[b.data.length - 1]?.value || 0;
      return lastB - lastA;
    });

    res.expenses.totals.totals = getTotals(mainTotals);

    console.log(
      `[PNL] ✅ Завершение getPLDatas. Общее время: ${Date.now() - startTime}ms`,
    );
    return res;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getBookPLDatas(period: string, user: UserDto) {
    const periods = getLastMonths(period, 4);
    type ManagerDatasResult = Awaited<
      ReturnType<typeof this.commercialDatasService.getManagerDatas>
    >;
    const managerDatasCache = new Map<string, ManagerDatasResult>();
    const getManagerDatasCached = async (
      periodKey: string,
      managerId: number,
    ) => {
      const cacheKey = `${managerId}:${periodKey}`;
      const cached = managerDatasCache.get(cacheKey);
      if (cached) {
        return cached;
      }
      const data = await this.commercialDatasService.getManagerDatas(
        user,
        periodKey,
        managerId,
      );
      managerDatasCache.set(cacheKey, data);
      return data;
    };

    const income = await this.getIncomeDatas(periods, { in: [19] });

    const prodExpensesByPeriod = await Promise.all(
      periods.map(async (period) => {
        const prodExpenses = await this.prisma.operationPosition.findMany({
          where: {
            originalOperation: {
              operationDate: {
                startsWith: period,
              },
            },
            expenseCategoryId: 143,
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
        const value = prodExpenses.reduce((sum, op) => sum + op.amount, 0);

        return {
          period,
          value,
        };
      }),
    );

    const designExpensesByPeriod = await Promise.all(
      periods.map(async (period) => {
        const designExpenses = await this.prisma.operationPosition.findMany({
          where: {
            originalOperation: {
              operationDate: {
                startsWith: period,
              },
            },
            expenseCategoryId: 141,
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
        const value = designExpenses.reduce((sum, op) => sum + op.amount, 0);
        return {
          period,
          value,
        };
      }),
    );

    const adExpenses = await Promise.all(
      periods.map(async (period) => {
        const adExpenses = await this.prisma.adExpense.findMany({
          where: {
            date: {
              startsWith: period,
            },
            groupId: 19,
          },
        });
        const value = adExpenses.reduce((sum, ad) => sum + ad.price, 0);
        return {
          period,
          value,
        };
      }),
    );

    const mopSalaries = await Promise.all(
      periods.map(async (p) => {
        const mops = await this.prisma.user.findMany({
          where: {
            role: {
              shortName: { in: ['MOP'] },
            },
            groupId: 19,
          },
        });

        // Параллельная обработка всех менеджеров
        const salaries = await Promise.all(
          mops.map(async (m) => {
            const result = await getManagerDatasCached(p, m.id);
            return result;
          }),
        );

        const value = +salaries
          .reduce((sum, data) => sum + data.totalSalary, 0)
          .toFixed(2);

        return {
          value,
          period: p,
        };
      }),
    );

    const ropSalaries = await Promise.all(
      periods.map(async (p) => {
        const mops = await this.prisma.user.findMany({
          where: {
            role: {
              shortName: { in: ['ROP'] },
            },
            groupId: 19,
          },
        });

        // Параллельная обработка всех менеджеров
        const salaries = await Promise.all(
          mops.map(async (m) => {
            const result = await getManagerDatasCached(p, m.id);
            return result;
          }),
        );

        const value = +salaries
          .reduce((sum, data) => sum + data.totalSalary, 0)
          .toFixed(2);

        return {
          value,
          period: p,
        };
      }),
    );

    const movSalaries = await Promise.all(
      periods.map(async (p) => {
        const mops = await this.prisma.user.findMany({
          where: {
            role: {
              shortName: { in: ['MOV'] },
            },
            groupId: 19,
          },
        });

        // Параллельная обработка всех менеджеров
        const salaries = await Promise.all(
          mops.map(async (m) => {
            const result = await getManagerDatasCached(p, m.id);
            return result;
          }),
        );

        const value = +salaries
          .reduce((sum, data) => sum + data.totalSalary, 0)
          .toFixed(2);

        return {
          value,
          period: p,
        };
      }),
    );

    return {
      periods,
      income,
      prodExpensesByPeriod, //Расходы на производство
      adExpenses, //Расходы на рекламу
      mopSalaries, //Зарплаты менеджеров отдела продаж
      ropSalaries, //Зарплаты менеджеров отдела ропа
      movSalaries, //Зарплаты менеджеров отдела ведения
      designExpensesByPeriod, //Расходы на дизайн
    };
  }
}
