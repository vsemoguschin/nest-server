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
            role: true,
            workSpace: true,
            dealSales: {
              where: {
                deal: {
                  period,
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
            dops: { where: { period } },
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

    const userData = workSpace.users.map((u) => {
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
        salesBonus, //% с продаж(₽)
        dopBonus, //% с допов(₽)
        bonus, //премия(₽)
        totalSales, //продажи(₽)
        dealSales, //сделки(₽)
        dopSales, //допы(₽)
        conversion, //конверсия(%)
        averageBill, //средний чек(₽)
        topBonus: 0,
      };
    });

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
            role: true,
            workSpace: true,
            dealSales: {
              where: {
                deal: {
                  period,
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
            dops: { where: { period } },
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

    // Расчет продаж для каждого пользователя
    const usersWithSales = workSpace.users.map((u) => {
      const dealSales = u.dealSales.reduce((a, b) => a + b.price, 0);
      const dopSales = u.dops.reduce((a, b) => a + b.price, 0);
      const totalSales = dealSales + dopSales;
      const dimmerSales = u.dops
        .filter((d) => d.type === 'Диммер')
        .reduce((a, b) => a + b.price, 0);

      const userDeals = u.dealSales.flatMap((d) => d.deal);

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
        id: u.id,
        manager: u.fullName,
        dealSales,
        dopSales,
        totalSales,
        dimmerSales,
        dealsWithoutDesigners: dealsWithoutDesigners.length,
        salesWithoutDesigners,
        conversionDayToDay,
      };
    });

    // Определение топов
    const topTotalSales = [...usersWithSales]
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 3)
      .map((u) => ({ user: u.manager, sales: u.totalSales }));

    const topDopSales = [...usersWithSales]
      .sort((a, b) => b.dopSales - a.dopSales)
      .slice(0, 3)
      .map((u) => ({ user: u.manager, sales: u.dopSales }));

    const topDimmerSales = [...usersWithSales]
      .sort((a, b) => b.dimmerSales - a.dimmerSales)
      .slice(0, 3)
      .map((u) => ({ user: u.manager, sales: u.dimmerSales }));

    const topSalesWithoutDesigners = [...usersWithSales]
      .sort((a, b) => b.salesWithoutDesigners - a.salesWithoutDesigners)
      .slice(0, 3)
      .map((u) => ({ user: u.manager, sales: u.salesWithoutDesigners }));

    const topConversionDayToDay = [...usersWithSales]
      .sort((a, b) => b.conversionDayToDay - a.conversionDayToDay)
      .slice(0, 3)
      .map((u) => ({ user: u.manager, sales: u.conversionDayToDay }));

    // Формирование финального ответа с учетом премий за топ
    const res = workSpace.users.map((u) => {
      const userSales = usersWithSales.find((us) => us.id === u.id)!;

      // Определение процентной ставки и премии
      let bonusPercentage = 0;
      let bonusPremium = 0;

      if (userSales.totalSales < 400_000) {
        bonusPercentage = 3;
      } else if (
        userSales.totalSales >= 400_000 &&
        userSales.totalSales < 600_000
      ) {
        bonusPercentage = 5;
      } else if (
        userSales.totalSales >= 600_000 &&
        userSales.totalSales < 700_000
      ) {
        bonusPercentage = 6;
      } else if (
        userSales.totalSales >= 700_000 &&
        userSales.totalSales < 1_000_000
      ) {
        bonusPercentage = 7;
      } else if (userSales.totalSales >= 1_000_000) {
        bonusPercentage = 7;
        bonusPremium = 10_000; // Премия за достижение 1 млн
      }

      // Расчет salesBonus
      const salesBonus =
        Math.floor((userSales.totalSales * bonusPercentage) / 100) +
        bonusPremium;

      // Расчет премии за топ
      const getTopBonus = (rank: number): number => {
        switch (rank) {
          case 1:
            return 3000;
          case 2:
            return 2000;
          case 3:
            return 1000;
          default:
            return 0;
        }
      };

      const topBonus =
        (topTotalSales.findIndex((t) => t.user === u.fullName) + 1 > 0
          ? getTopBonus(
              topTotalSales.findIndex((t) => t.user === u.fullName) + 1,
            )
          : 0) +
        (topDopSales.findIndex((t) => t.user === u.fullName) + 1 > 0
          ? getTopBonus(topDopSales.findIndex((t) => t.user === u.fullName) + 1)
          : 0) +
        (topDimmerSales.findIndex((t) => t.user === u.fullName) + 1 > 0
          ? getTopBonus(
              topDimmerSales.findIndex((t) => t.user === u.fullName) + 1,
            )
          : 0) +
        (topSalesWithoutDesigners.findIndex((t) => t.user === u.fullName) + 1 >
        0
          ? getTopBonus(
              topSalesWithoutDesigners.findIndex((t) => t.user === u.fullName) +
                1,
            )
          : 0) +
        (topConversionDayToDay.findIndex((t) => t.user === u.fullName) + 1 > 0
          ? getTopBonus(
              topConversionDayToDay.findIndex((t) => t.user === u.fullName) + 1,
            )
          : 0);
      const dimmerSales = u.dops
        .filter((d) => d.type === 'Диммер')
        .reduce((a, b) => a + b.price, 0);

      const userDeals = u.dealSales.flatMap((d) => d.deal);

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
        id: u.id,
        manager: u.fullName,
        dealSales: userSales.dealSales,
        dopSales: userSales.dopSales,
        totalSales: userSales.totalSales,
        salesBonus,
        topBonus,
        dimmerSales,
        totalSalary: salesBonus + topBonus,
        dealsWithoutDesigners: dealsWithoutDesigners.length,
        salesWithoutDesigners,
        conversionDayToDay,
      };
    });

    return {
      users: res,
      topTotalSales,
      topDopSales,
      topDimmerSales,
      topSalesWithoutDesigners,
      topConversionDayToDay,
    };
  }
}
