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
          where: {
            role: {
              shortName: 'MOP',
            },
          },
          include: {
            role: true,
            workSpace: true,
            dealSales: {
              where: {
                deal: {
                  period,
                },
              },
            },
            dops: {
              where: {
                period,
              },
            },
          },
        },
      },
    });

    return workSpace?.users.map((u) => {
      const dealSales = u.dealSales.reduce((a, b) => a + b.price, 0);
      const dopSales = u.dops.reduce((a, b) => a + b.price, 0);
      return {
        id: u.id,
        manager: u.fullName,
        totalSalary: 0,
        dealSales,
        dopSales,
      };
    });
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
                deal: { period },
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
      return { users: [], topTotalSales: [], topDopSales: [] };
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
