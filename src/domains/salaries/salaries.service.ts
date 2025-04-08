import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserDto } from '../users/dto/user.dto';

@Injectable()
export class SalariesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAvitoMopSalaries(user: UserDto, period: string) {
    if (!['Admin', 'B2B'].includes(user.workSpace!.title)) {
      throw new ForbiddenException('У вас нет доступа к этой операции');
    }
    const workSpace = await this.prisma.workSpace.findFirst({
      where: {
        title: 'B2B',
      },
      include: {
        users: {
          where: { role: { shortName: 'MOP' } },
          include: {
            salaryPays: {
              where: {
                period,
              },
            },
            role: true,
            workSpace: true,
            dealSales: {
              where: {
                deal: {
                  saleDate: {
                    startsWith: period,
                  },
                  reservation: false,
                },
              },
              include: {
                deal: {
                  include: {
                    client: true,
                  },
                },
              },
            },
            dops: {
              where: {
                saleDate: {
                  startsWith: period,
                },
              },
            },
            managerReports: {
              where: {
                period,
              },
            },
          },
        },
      },
    });

    if (!workSpace?.users.length) {
      return {
        users: [],
        topTotalSales: [],
        topDopSales: [],
        topDimmerSales: [],
        topSalesWithoutDesigners: [],
        topConversionDayToDay: [],
      };
    }

    const userData = workSpace.users
      .map((u) => {
        const dealSales = u.dealSales.reduce((a, b) => a + b.price, 0);
        const dopSales = u.dops.reduce((a, b) => a + b.price, 0);
        const totalSales = dealSales + dopSales;
        const userDeals = u.dealSales.flatMap((d) => d.deal);
        const totalCalls = u.managerReports.reduce((a, b) => a + b.calls, 0);

        const conversion = totalCalls
          ? +((userDeals.length / totalCalls) * 100).toFixed(2)
          : 0;

        const averageBill = userDeals.length
          ? +(totalSales / userDeals.length).toFixed()
          : 0;

        const dopBonus = +(dopSales * 0.1).toFixed();

        let salesBonus = 0;
        let bonus = 0;

        if (totalSales < 400_000) {
          salesBonus = +(totalSales * 0.03).toFixed();
        } else if (totalSales < 560_000) {
          salesBonus = +(totalSales * 0.035).toFixed();
        } else if (totalSales < 680_000) {
          salesBonus = +(totalSales * 0.04).toFixed();
        } else if (totalSales < 800_000) {
          salesBonus = +(totalSales * 0.045).toFixed();
          bonus = 10480;
        } else if (totalSales < 1_000_000) {
          salesBonus = +(totalSales * 0.05).toFixed();
          bonus = 15000;
        } else if (totalSales < 1_100_000) {
          salesBonus = +(totalSales * 0.05).toFixed();
          bonus = 17500;
        } else if (totalSales < 1_200_000) {
          salesBonus = +(totalSales * 0.05).toFixed();
          bonus = 20000;
        } else if (totalSales < 1_350_000) {
          salesBonus = +(totalSales * 0.05).toFixed();
          bonus = 23700;
        } else if (totalSales < 1_500_000) {
          salesBonus = +(totalSales * 0.05).toFixed();
          bonus = 27500;
        } else if (totalSales < 1_700_000) {
          salesBonus = +(totalSales * 0.05).toFixed();
          bonus = 32500;
        } else if (totalSales < 2_000_000) {
          salesBonus = +(totalSales * 0.05).toFixed();
          bonus = 40000;
        }

        return {
          id: u.id,
          manager: u.fullName, //менеджер
          totalSalary: salesBonus + bonus, //ЗП(₽)
          pays: u.salaryPays.reduce((a, b) => a + b.price, 0), //выплачено(₽)
          salesBonus, //% с продаж(₽)
          dopBonus, //% с допов(₽)
          bonus, //премия(₽)
          totalSales, //продажи(₽)
          dealSales, //сделки(₽)
          dopSales, //допы(₽)
          conversion, //конверсия(%)
          averageBill, //средний чек(₽)
          topBonus: 0,
          shift: u.managerReports.length,
          fired: u.deletedAt ? true : false,
        };
      })
      .filter((u) => u.totalSales || !u.fired);

    // - Самая высокая Сумма Заказов в отделе
    const topDealSales = [...userData]
      .sort((a, b) => b.dealSales - a.dealSales)
      .slice(0, 1)
      .map((u) => ({
        id: u.id,
        user: u.manager,
        sales: u.dealSales,
        category: 'Топ суммы заказов',
      }));
    // - Самая высокая сумма Допов в отделе
    const topDopSales = [...userData]
      .sort((a, b) => b.dopSales - a.dopSales)
      .slice(0, 1)
      .map((u) => ({
        id: u.id,
        user: u.manager,
        sales: u.dopSales,
        category: 'Топ суммы допов',
      }));
    // - Самый Высокий средний чек в отделе
    const topAverageBill = [...userData]
      .sort((a, b) => b.averageBill - a.averageBill)
      .slice(0, 1)
      .map((u) => ({
        id: u.id,
        user: u.manager,
        sales: u.averageBill,
        category: 'Топ средний чек',
      }));
    // - Самая высокая конверсия в отделе
    const topConversion = [...userData]
      .sort((a, b) => b.conversion - a.conversion)
      .slice(0, 1)
      .map((u) => ({
        id: u.id,
        user: u.manager,
        sales: u.conversion,
        category: 'Топ конверсия',
      }));

    userData.map((u) => {
      if (u.id === topDealSales[0].id) {
        u.topBonus += 2000;
        u.totalSalary += 2000;
      }
      if (u.id === topDopSales[0].id) {
        u.topBonus += 2000;
        u.totalSalary += 2000;
      }
      if (u.id === topAverageBill[0].id) {
        u.topBonus += 2000;
        u.totalSalary += 2000;
      }
      if (u.id === topConversion[0].id) {
        u.topBonus += 2000;
        u.totalSalary += 2000;
      }
      return u;
    });

    return {
      userData,
      topList: [
        topDealSales[0],
        topDopSales[0],
        topAverageBill[0],
        topConversion[0],
      ],
    };
  }
  // подсчет по платежам(не закончен)
  async getVKMopSalaries111(user: UserDto, period: string) {
    if (!['Admin', 'ВК'].includes(user.workSpace!.title)) {
      throw new ForbiddenException('У вас нет доступа к этой операции');
    }

    const workSpace = await this.prisma.workSpace.findFirst({
      where: { title: 'ВК' },
      include: {
        payments: {
          where: {
            date: {
              startsWith: period,
            },
          },
          include: {
            deal: {
              include: {
                dops: {
                  include: {
                    user: {
                      include: {
                        role: true,
                      },
                    },
                  },
                },
                dealers: {
                  include: {
                    user: {
                      include: {
                        role: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!workSpace) {
      return {};
    }

    const userPayments = workSpace.payments.map((payment) => {
      const { deal } = payment;
      const { dealers } = deal;
      const { dops } = deal;
      const dealTotalPrice =
        deal.price + deal.dops.reduce((a, b) => a + b.price, 0);
      const dealSales = [...dealers, ...dops];
      const userPayments = dealSales.map((dop) => {
        const dealerPart = dealTotalPrice ? dop.price / dealTotalPrice : 0;
        return {
          id: dop.user.id,
          manager: dop.user.fullName,
          payments: +(payment.price * dealerPart).toFixed(2), //ФАКТ
        };
      });
      return userPayments.reduce((a, b) => a + b.payments, 0);
    });

    const workSpacePayments = workSpace.payments.reduce(
      (a, b) => a + b.price,
      0,
    );
    console.log(workSpacePayments, userPayments);
    return {};
  }

  async getVKMopSalaries(user: UserDto, period: string) {
    if (!['Admin', 'ВК'].includes(user.workSpace!.title)) {
      throw new ForbiddenException('У вас нет доступа к этой операции');
    }

    const workSpace = await this.prisma.workSpace.findFirst({
      where: { title: 'ВК' },
      include: {
        users: {
          where: { role: { shortName: 'MOP' } },
          include: {
            salaryPays: {
              where: {
                period,
              },
            },
            role: true,
            workSpace: true,
            dealSales: {
              where: {
                deal: {
                  saleDate: {
                    startsWith: period,
                  },
                  reservation: false,
                  status: { not: 'Возврат' },
                },
              },
              include: {
                deal: {
                  include: {
                    client: true,
                    payments: true,
                    dops: true,
                  },
                },
              },
            },
            dops: {
              where: {
                deal: {
                  status: { not: 'Возврат' },
                  reservation: false,
                  saleDate: {
                    startsWith: period,
                  },
                },
              },
              include: {
                deal: {
                  include: {
                    dops: true,
                  },
                },
              },
            },
            managerReports: {
              where: {
                period,
              },
            },
          },
        },
        deals: {
          where: {
            saleDate: {
              startsWith: period,
            },
            status: { not: 'Возврат' },
            reservation: false,
          },
        },
        dops: {
          where: {
            saleDate: {
              startsWith: period,
            },
          },
        },
      },
    });

    if (!workSpace) {
      return {
        users: [],
        topTotalSales: [],
        topDopSales: [],
        topDimmerSales: [],
        topSalesWithoutDesigners: [],
        topConversionDayToDay: [],
        overRopPlan: false,
      };
    }

    const ropPlan = await this.prisma.managersPlan.findFirst({
      where: {
        period,
        user: {
          role: {
            shortName: 'DO',
          },
          workSpaceId: workSpace?.id,
        },
      },
    });

    let isOverRopPlan = false;
    const ropPlanValue = ropPlan?.plan || 0;
    const workSpaceDealSales = workSpace.deals.reduce(
      (acc, d) => acc + d.price,
      0,
    );
    const workSpaceDopSales = workSpace.dops.reduce(
      (acc, d) => acc + d.price,
      0,
    );
    const workSpaceTotalSales = workSpaceDealSales + workSpaceDopSales;

    if (workSpaceTotalSales > ropPlanValue && ropPlanValue > 0) {
      isOverRopPlan = true;
    }

    // Расчет продаж для каждого пользователя
    const usersWithSales = workSpace.users
      .map((u) => {
        let totalSalary = 0;
        const pays = u.salaryPays.reduce((a, b) => a + b.price, 0) || 0;

        //Смены и премия за план
        const shift = u.managerReports.length;
        const shiftBonus = shift * 666;
        const workSpacePlanBonus = isOverRopPlan ? 3000 : 0;
        totalSalary += shiftBonus + workSpacePlanBonus;

        const dealSales = u.dealSales.reduce((a, b) => a + b.price, 0);
        const dopSales = u.dops.reduce((a, b) => a + b.price, 0);
        const totalSales = dealSales + dopSales;

        // Определение процентной ставки и премии
        let bonusPercentage = 0;

        if (totalSales < 400_000) {
          bonusPercentage = 3;
        } else if (totalSales >= 400_000 && totalSales < 600_000) {
          bonusPercentage = 5;
        } else if (totalSales >= 600_000 && totalSales < 700_000) {
          bonusPercentage = 6;
        } else if (totalSales >= 700_000 && totalSales < 1_000_000) {
          bonusPercentage = 7;
        } else if (totalSales >= 1_000_000) {
          bonusPercentage = 7;
          totalSalary += 10_000; // Премия за достижение 1 млн
        }

        let userPayments = 0;

        u.dealSales.map((dealer) => {
          const { deal } = dealer;
          const dealPrice = deal.price;
          const dealDopsPrice = deal.dops.reduce((a, b) => a + b.price, 0);
          const dealTotalPrice = dealPrice + dealDopsPrice;
          const dealerPrice = dealTotalPrice
            ? dealer.price / dealTotalPrice
            : 0;
          userPayments += +(dealerPrice * deal.price).toFixed(2);
        });

        u.dops.map((dop) => {
          const { deal } = dop;
          const dopPrice = dop.price;
          const dealPrice = deal.price;
          const dealDopsPrice = deal.dops.reduce((a, b) => a + b.price, 0);
          const dealTotalPrice = dealPrice + dealDopsPrice;
          const dealerPart = dealTotalPrice ? dopPrice / dealTotalPrice : 0;
          userPayments += +(dealerPart * deal.price).toFixed(2);
        });

        const calcTops = () => {
          const userDeals = u.dealSales.flatMap((d) => d.deal);

          const dimmerSales = u.dops
            .filter((d) => d.type === 'Диммер')
            .reduce((a, b) => a + b.price, 0);

          const dealsWithoutDesigners = userDeals.filter((d) =>
            [
              'Заготовка из базы',
              'Рекламный',
              'Из рассылки',
              'Визуализатор',
            ].includes(d.maketType),
          );
          const salesWithoutDesigners = dealsWithoutDesigners.reduce(
            (a, b) => a + b.price,
            0,
          );

          const dealsDayToDay = userDeals.filter(
            (d) => d.saleDate === d.client.firstContact,
          );

          const totalCalls = u.managerReports.reduce((a, b) => a + b.calls, 0);

          const conversionDayToDay = totalCalls
            ? +((dealsDayToDay.length / totalCalls) * 100).toFixed(2)
            : 0;

          return {
            dimmerSales,
            dealsWithoutDesigners: dealsWithoutDesigners.length,
            salesWithoutDesigners,
            conversionDayToDay,
          };
        };

        const salesBonus = +(userPayments * (bonusPercentage / 100)).toFixed();
        totalSalary += salesBonus;

        return {
          id: u.id,
          manager: u.fullName,
          dealSales,
          dopSales,
          totalSales,
          pays,
          totalSalary: +totalSalary.toFixed(), //ЗП(₽)
          bonusPercentage,
          salesBonus,
          payments: +userPayments.toFixed(2), //факт
          remainder: 0,
          shift,
          shiftBonus,
          topBonus: 0,
          ...calcTops(),
          fired: u.deletedAt ? true : false,
          workSpacePlanBonus,
        };
      })
      .filter((u) => u.totalSales || !u.fired);

    // Определение топов
    const topTotalSales = [...usersWithSales]
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 3)
      .map((u, i) => {
        const user = usersWithSales.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          user.topBonus += (-i + 3) * 1000;
          user.totalSalary += (-i + 3) * 1000;
        }
        return { user: u.manager, sales: u.totalSales };
      });

    const topDopSales = [...usersWithSales]
      .sort((a, b) => b.dopSales - a.dopSales)
      .slice(0, 3)
      .map((u, i) => {
        const user = usersWithSales.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          user.topBonus += (-i + 3) * 1000;
          user.totalSalary += (-i + 3) * 1000;
        }
        return { user: u.manager, sales: u.totalSales };
      });
    const topDimmerSales = [...usersWithSales]
      .sort((a, b) => b.dimmerSales - a.dimmerSales)
      .slice(0, 3)
      .map((u, i) => {
        const user = usersWithSales.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          user.topBonus += (-i + 3) * 1000;
          user.totalSalary += (-i + 3) * 1000;
        }
        return { user: u.manager, sales: u.totalSales };
      });
    const topSalesWithoutDesigners = [...usersWithSales]
      .sort((a, b) => b.salesWithoutDesigners - a.salesWithoutDesigners)
      .slice(0, 3)
      .map((u, i) => {
        const user = usersWithSales.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          user.topBonus += (-i + 3) * 1000;
          user.totalSalary += (-i + 3) * 1000;
        }
        return { user: u.manager, sales: u.totalSales };
      });
    const topConversionDayToDay = [...usersWithSales]
      .sort((a, b) => b.conversionDayToDay - a.conversionDayToDay)
      .slice(0, 3)
      .map((u, i) => {
        const user = usersWithSales.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          user.topBonus += (-i + 3) * 1000;
          user.totalSalary += (-i + 3) * 1000;
        }
        return { user: u.manager, sales: u.totalSales };
      });

    return {
      users: usersWithSales,
      topTotalSales,
      topDopSales,
      topDimmerSales,
      topSalesWithoutDesigners,
      topConversionDayToDay,
    };
  }
}
