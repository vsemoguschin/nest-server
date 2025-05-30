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
          // where: { role: { shortName: 'MOP' } },
          include: {
            role: true,
            workSpace: true,
            salaryPays: {
              where: {
                period,
              },
            },
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
                    payments: true,
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
      };
    }

    const userData = workSpace.users
      .map((u) => {
        let totalSalary = 0;
        let payments = 0;
        //выплаты
        const pays = u.salaryPays.reduce((a, b) => a + b.price, 0) || 0;

        //Суммы по продажам сделок, допов, общее
        const dealSales = u.dealSales.reduce((a, b) => a + b.price, 0);
        const dopSales = u.dops.reduce((a, b) => a + b.price, 0);
        const totalSales = dealSales + dopSales;

        // Процент с продаж в зп
        let bonusPercentage = 0;
        let bonus = 0;

        if (totalSales < 400_000) {
          bonusPercentage = 0.03;
        } else if (totalSales < 560_000) {
          bonusPercentage = 0.035;
        } else if (totalSales < 680_000) {
          bonusPercentage = 0.04;
        } else if (totalSales < 800_000) {
          bonusPercentage = 0.045;
          totalSalary += 10480;
          bonus += 10480;
        } else if (totalSales < 1_000_000) {
          bonusPercentage = 0.05;
          totalSalary += 15000;
          bonus += 15000;
        } else if (totalSales < 1_100_000) {
          bonusPercentage = 0.05;
          totalSalary += 17500;
          bonus += 17500;
        } else if (totalSales < 1_200_000) {
          bonusPercentage = 0.05;
          totalSalary += 20000;
          bonus += 20000;
        } else if (totalSales < 1_350_000) {
          bonusPercentage = 0.05;
          totalSalary += 23700;
          bonus += 23700;
        } else if (totalSales < 1_500_000) {
          bonusPercentage = 0.05;
          totalSalary += 27500;
          bonus += 27500;
        } else if (totalSales < 1_700_000) {
          bonusPercentage = 0.05;
          totalSalary += 32500;
          bonus += 32500;
        } else if (totalSales < 2_000_000) {
          bonusPercentage = 0.05;
          totalSalary += 40000;
          bonus += 40000;
        }

        // оплата за допы
        u.dops.map((dop) => {
          const dopPrice = dop.price; //сумма допа
          const dealDops = dop.deal.dops; //все допы сделки
          const dealDopsPrice = dealDops.reduce((a, b) => a + b.price, 0); //стоимость всех допов
          //Оплаты по сделке
          const dealPays = dop.deal.payments.reduce((a, b) => a + b.price, 0);
          const paysForDops =
            dealPays >= dealDopsPrice ? dealDopsPrice : dealPays;
          const userPart = dealDopsPrice ? dopPrice / dealDopsPrice : 0;
          totalSalary += paysForDops * userPart * 0.1;
          payments += paysForDops * userPart;
        });

        // Сделки менеджера
        const userDeals = u.dealSales.flatMap((d) => d.deal);

        u.dealSales.map((dealer) => {
          const { deal } = dealer;
          const dealPayments = deal.payments; //платежи
          const dealPrice = deal.price; //стоимость сделки
          const dealDopsPrice = deal.dops.reduce((a, b) => a + b.price, 0); //стоимость сделки
          const paymentsPrice = dealPayments.reduce((a, b) => a + b.price, 0); //сумма платежей
          //если сумма платежей больше суммы допов, то за сделку в остатке сумма платежей минус сумма допов
          const dealPays =
            paymentsPrice > dealDopsPrice ? paymentsPrice - dealDopsPrice : 0;
          const dealerPart = dealPrice ? dealer.price / dealPrice : 0; //часть менеджера
          totalSalary += dealPays * dealerPart * bonusPercentage;
          payments += dealPays * dealerPart;
        });

        // Количество заявок
        const totalCalls = u.managerReports.reduce((a, b) => a + b.calls, 0);
        // Конверсия
        const conversion = totalCalls
          ? +((userDeals.length / totalCalls) * 100).toFixed(2)
          : 0;
        // средний чек
        const averageBill = userDeals.length
          ? +(totalSales / userDeals.length).toFixed()
          : 0;
        // бонус
        const dopBonus = +(dopSales * 0.1).toFixed();

        return {
          id: u.id,
          manager: u.fullName, //менеджер
          totalSalary: +totalSalary.toFixed(2), //ЗП(₽)
          pays, //выплачено(₽)
          rem: +(totalSalary - pays).toFixed(2),
          bonusPercentage: +(bonusPercentage * 100).toFixed(), //% с продаж(₽)
          payments: +payments.toFixed(2), //факт
          bonus, //премия(₽)
          totalSales, //продажи(₽)
          dealSales, //сделки(₽)
          dopBonus, //% с допов(₽)
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
      if (u.id === topDealSales[0].id && topDealSales[0].sales > 0) {
        u.topBonus += 2000;
        u.totalSalary += 2000;
      }
      if (u.id === topDopSales[0].id && topDopSales[0].sales > 0) {
        u.topBonus += 2000;
        u.totalSalary += 2000;
      }
      if (u.id === topAverageBill[0].id && topAverageBill[0].sales > 0) {
        u.topBonus += 2000;
        u.totalSalary += 2000;
      }
      if (u.id === topConversion[0].id && topConversion[0].sales > 0) {
        u.topBonus += 2000;
        u.totalSalary += 2000;
      }
      return u;
    });
    userData.push({
      id: 0,
      manager: 'ОБЩЕЕ', //менеджер
      totalSalary: +userData.reduce((a, b) => a + b.totalSalary, 0).toFixed(2), //ЗП(₽)
      pays: userData.reduce((a, b) => a + b.pays, 0),
      rem: +userData.reduce((a, b) => a + b.rem, 0).toFixed(2),
      bonusPercentage: 0,
      payments: userData.reduce((a, b) => a + b.payments, 0),
      bonus: userData.reduce((a, b) => a + b.bonus, 0),
      totalSales: userData.reduce((a, b) => a + b.totalSales, 0),
      dealSales: userData.reduce((a, b) => a + b.dealSales, 0),
      dopBonus: userData.reduce((a, b) => a + b.dopBonus, 0),
      dopSales: userData.reduce((a, b) => a + b.dopSales, 0),
      conversion: 0,
      averageBill: 0,
      topBonus: userData.reduce((a, b) => a + b.topBonus, 0),
      shift: userData.reduce((a, b) => a + b.shift, 0),
      fired: false,
    });

    // console.log(
    //   userData.reduce((a, b) => a + b.payments, 0),
    //   2426443 - 2427243,
    // ); //2426443 2427243 2427243

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

  async getVKMopSalaries(user: UserDto, period: string) {
    if (!['Admin', 'ВК'].includes(user.workSpace!.title)) {
      throw new ForbiddenException('У вас нет доступа к этой операции');
    }

    const workSpace = await this.prisma.workSpace.findFirst({
      where: { title: 'ВК' },
      include: {
        users: {
          // where: { role: { shortName: 'MOP' } },
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
                saleDate: {
                  startsWith: period,
                },
                deal: {
                  status: { not: 'Возврат' },
                  reservation: false,
                },
              },
              include: {
                deal: {
                  include: {
                    dops: true,
                    payments: true,
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
            deal: {
              reservation: false,
              status: { not: 'Возврат' },
            },
          },
        },
        payments: {
          where: {
            deal: {
              saleDate: {
                startsWith: period,
              },
              reservation: false,
              status: { not: 'Возврат' },
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
        if (u.fullName.includes('Добротин')) {
          console.log(u.dops.map((d) => d.saleDate));
          console.log(
            u.dops.reduce((a, b) => a + b.price, 0),
            'ecqrveww',
          );
        }
        let totalSalary = 0;
        const pays = u.salaryPays.reduce((a, b) => a + b.price, 0) || 0;

        //Смены и премия за план
        const shift = u.managerReports.length;
        const shiftBonus = u.managerReports.reduce(
          (a, b) => a + b.shiftCost,
          0,
        );
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
          const { deal } = dealer; //сделка
          const dealPrice = deal.price; //стоимость сделки
          const dealDopsPrice = deal.dops.reduce((a, b) => a + b.price, 0); //стоимость допов
          const dealTotalPrice = dealPrice + dealDopsPrice; //общаяя стоимость
          const dealPayments = deal.payments.reduce((a, b) => a + b.price, 0);
          const dealerPart = dealTotalPrice ? dealer.price / dealTotalPrice : 0;
          userPayments += dealerPart * dealPayments;
        });

        u.dops.map((dop) => {
          const { deal } = dop;
          const dopPrice = dop.price;
          const dealPrice = deal.price;
          const dealDopsPrice = deal.dops.reduce((a, b) => a + b.price, 0);
          const dealTotalPrice = dealPrice + dealDopsPrice;
          const dealerPart = dealTotalPrice ? dopPrice / dealTotalPrice : 0;
          const dealPayments = deal.payments.reduce((a, b) => a + b.price, 0);

          userPayments += dealerPart * dealPayments;
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
          totalSalary: +totalSalary.toFixed(2), //ЗП(₽)
          bonusPercentage,
          salesBonus,
          payments: +userPayments.toFixed(2), //факт
          rem: +totalSalary.toFixed(2) - pays,
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
        return { user: u.manager, sales: u.dopSales };
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
        return { user: u.manager, sales: u.dimmerSales };
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
        return { user: u.manager, sales: u.salesWithoutDesigners };
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
        return { user: u.manager, sales: u.conversionDayToDay };
      });

    // console.log(
    //   'допы WS ',
    //   workSpace?.dops.reduce((a, b) => a + b.price, 0),
    // );
    // console.log(
    //   'допы USERS ',
    //   usersWithSales.reduce((a, b) => a + b.dopSales, 0),
    // );

    usersWithSales.push({
      id: 0,
      manager: 'ОБЩЕЕ',
      dealSales: usersWithSales.reduce((a, b) => a + b.dealSales, 0),
      dopSales: usersWithSales.reduce((a, b) => a + b.dopSales, 0),
      totalSales: +usersWithSales
        .reduce((a, b) => a + b.totalSales, 0)
        .toFixed(2),
      pays: usersWithSales.reduce((a, b) => a + b.pays, 0),
      totalSalary: usersWithSales.reduce((a, b) => a + b.totalSalary, 0),
      bonusPercentage: 0,
      salesBonus: usersWithSales.reduce((a, b) => a + b.salesBonus, 0),
      payments: usersWithSales.reduce((a, b) => a + b.payments, 0),
      rem: +usersWithSales.reduce((a, b) => a + b.rem, 0).toFixed(2),
      shift: usersWithSales.reduce((a, b) => a + b.shift, 0),
      shiftBonus: usersWithSales.reduce((a, b) => a + b.shiftBonus, 0),
      topBonus: usersWithSales.reduce((a, b) => a + b.topBonus, 0),
      dimmerSales: usersWithSales.reduce((a, b) => a + b.dimmerSales, 0),
      dealsWithoutDesigners: usersWithSales.reduce(
        (a, b) => a + b.dealsWithoutDesigners,
        0,
      ),
      salesWithoutDesigners: usersWithSales.reduce(
        (a, b) => a + b.salesWithoutDesigners,
        0,
      ),
      conversionDayToDay: 0,
      fired: false,
      workSpacePlanBonus: usersWithSales.reduce(
        (a, b) => a + b.workSpacePlanBonus,
        0,
      ),
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
