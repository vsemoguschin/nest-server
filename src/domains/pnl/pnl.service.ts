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
    // Запускаем обработку всех периодов параллельно
    const income = await Promise.all(
      periods.map(async (p) => {
        const periodStart = Date.now();
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

  async getPLDatas(period: string, project: string = 'all', user: UserDto) {
    let groupSearch: { gt: number } | { in: number[] } = { gt: 0 };
    if (project === 'all') {
      groupSearch = { gt: 0 };
    } else if (project === 'neon') {
      groupSearch = { in: [2, 3, 4, 18] };
    } else if (project === 'book') {
      groupSearch = { in: [19] };
    }
    const periods = getLastMonths(period, 4);
    // console.log(
    //   `[PNL] Определение групп и периодов: ${Date.now() - startTime}ms`,
    // );
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
    // console.log(`[PNL] Получение income данных: ${Date.now() - startTime}ms`);

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
    // console.log(
    //   `[PNL] Форматирование income с changePercent: ${Date.now() - startTime}ms`,
    // );

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
      // console.log(
      //   `[PNL] Получение и обработка supplies: ${Date.now() - startTime}ms`,
      // );

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
      // console.log(
      //   `[PNL] Получение и обработка production salaries: ${Date.now() - startTime}ms`,
      // );
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
    // console.log(
    //   `[PNL] Получение и обработка ad expenses: ${Date.now() - startTime}ms`,
    // );

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
          // console.log(
          //   `  [MOP] Найдено ${mops.length} менеджеров для периода ${p}`,
          // );

          // Параллельная обработка всех менеджеров
          const salariesStart = Date.now();
          const salaries = await Promise.all(
            mops.map(async (m) => {
              const start = Date.now();
              const result = await getManagerDatasCached(p, m.id);
              const time = Date.now() - start;
              // if (time > 1000) {
              //   console.log(`    ⚠️ Медленный менеджер [${m.id}]: ${time}ms`);
              // }
              return result;
            }),
          );
          // console.log(
          //   `  [MOP] Обработка ${mops.length} менеджеров заняла ${Date.now() - salariesStart}ms`,
          // );

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
          // console.log(`  [ROP] Найдено ${rops.length} РОПов для периода ${p}`);

          // Параллельная обработка всех РОПов
          const salariesStart = Date.now();
          const salaries = await Promise.all(
            rops.map(async (r) => {
              const start = Date.now();
              const result = await getManagerDatasCached(p, r.id);
              const time = Date.now() - start;
              // console.log(`    [ROP ${r.id}] Обработка заняла: ${time}ms`);
              return result;
            }),
          );
          // console.log(
          //   `  [ROP] Обработка ${rops.length} РОПов заняла ${Date.now() - salariesStart}ms`,
          // );

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
    // console.log(
    //   `[PNL] ✓ Получение MOP и ROP salaries завершено за: ${Date.now() - salariesStartTime}ms (общее время: ${Date.now() - startTime}ms)`,
    // );

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
              shortName: {
                in: ['MOV', 'ROV'],
              },
            },
            groupId: 4,
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
    // console.log(
    //   `[PNL] Получение всех commercial salaries (MOP, ROP, DIZ, MOV, KD): ${Date.now() - startTime}ms`,
    // );

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

    // console.log(
    //   `[PNL] ✅ Завершение getPLDatas. Общее время: ${Date.now() - startTime}ms`,
    // );
    return res;
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
