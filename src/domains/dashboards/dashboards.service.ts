import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { WorkSpaceDto } from '../workspaces/dto/workspace.dto';
import { UserDto } from '../users/dto/user.dto';

// Определяем тип для деталей выручки
interface RevenueDetail {
  dealId: number;
  dealTotalPrice: number;
  dopsTotalPrice: number;
  totalDealCost: number;
  totalPayments: number;
  managerPrice: number;
  managerSharePercentage: number;
  revenue: number;
}

@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkspaces(user: UserDto): Promise<WorkSpaceDto[]> {
    let where: Partial<{ deletedAt: null; id: { gt: number } | number }> = {
      deletedAt: null,
    };
    if (['DO', 'ROD', 'DP', 'RP'].includes(user.role.shortName)) {
      where = { id: user.workSpaceId, deletedAt: null };
    }
    const workspaces = await this.prisma.workSpace.findMany({
      where,
      include: {
        groups: {
          include: {
            users: {
              where: { deletedAt: null },
              include: {
                role: true,
              },
            },
          },
        },
      },
    });

    return workspaces;
  }

  async getDeals(user: UserDto) {
    let workSpacesSearch = {
      deletedAt: null as null,
      id: { gt: 0 } as { gt: number } | number,
    };

    if (['DO', 'ROP', 'MOP', 'DP', 'RP'].includes(user.role.shortName)) {
      workSpacesSearch = {
        id: user.workSpaceId,
        deletedAt: null,
      };
    }
    const workSpaces = await this.prisma.workSpace.findMany({
      where: {
        ...workSpacesSearch,
        department: { in: ['COMMERCIAL'] },
      },
      include: {
        groups: true,
      },
    });
    const workSpaceIds = workSpaces.map((w) => w.id);
    const groups = await this.prisma.group.findMany({
      where: {
        workSpaceId: {
          in: workSpaceIds,
        },
      },
    });

    const managers = await this.prisma.user.findMany({
      where: {
        workSpaceId: { in: workSpaceIds },
      },
      include: {
        workSpace: true,
      },
    });

    return { workSpaces, groups, managers };
  }

  async getManagersData(user: UserDto, period: string) {
    const workspacesSearch =
      user.role.department === 'administration' ? { gt: 0 } : user.workSpaceId;

    // Находим пользователей с department = 'COMMERCIAL'
    const managers = await this.prisma.user.findMany({
      where: {
        role: {
          department: 'COMMERCIAL',
        },
        workSpaceId: workspacesSearch,
      },
      include: {
        role: true,
      },
    });

    const result = await Promise.all(
      managers.map(async (m) => {
        // Находим ManagersPlan за период
        const managerPlan = await this.prisma.managersPlan.findFirst({
          where: {
            userId: m.id,
            period,
            deletedAt: null,
          },
        });

        // Находим все DealUsers за период
        const dealUsers = await this.prisma.dealUser.findMany({
          where: {
            userId: m.id,
            deal: {
              period,
              deletedAt: null,
            },
          },
          include: {
            deal: {
              include: {
                payments: {
                  where: {
                    period,
                    deletedAt: null,
                  },
                }, // Подтягиваем платежи для каждой сделки
                dops: true,
                dealers: true,
              },
            },
          },
        });

        // Считаем сумму dealUser.price
        const dealsSales = dealUsers.reduce(
          (sum, du) => sum + (du.price || 0),
          0,
        );
        const totalDeals = dealUsers.length;

        // Находим все Dop за период
        const dops = await this.prisma.dop.findMany({
          where: {
            userId: m.id,
            deal: { period },
          },
          include: {
            deal: {
              include: {
                payments: {
                  where: {
                    period,
                    deletedAt: null,
                  },
                },
                dealers: true,
                dops: true,
              },
            },
          },
        });
        // Находим все Dop за период
        const Alldops = await this.prisma.dop.findMany({
          where: {
            userId: m.id,
            period,
          },
        });

        // Считаем сумму dop.price
        const dopsSales = Alldops.reduce(
          (sum, dop) => sum + (dop.price || 0),
          0,
        );
        const dopsAmount = Alldops.length;

        // Общая сумма продаж
        const totalSales = dealsSales + dopsSales;

        // Находим сделки без дизайнеров
        const dealsWithoutDesigners = await this.prisma.deal.findMany({
          where: {
            maketType: {
              in: [
                'Заготовка из базы',
                'Рекламный',
                'Из рассылки',
                'Визуализатор',
              ],
            },
            period: period.slice(0, 7),
            deletedAt: null,
            dealers: {
              some: {
                userId: m.id,
              },
            },
          },
        });

        const dealsSalesWithoutDesigners = dealsWithoutDesigners.reduce(
          (sum, deal) => sum + (deal.price || 0),
          0,
        );

        // Вычисляем метрики
        const plan = managerPlan?.plan || 0;
        const salesToPlan = plan ? +((totalSales / plan) * 100).toFixed() : 0;
        const remainder = plan - totalSales;
        const dopsToSales = totalSales
          ? +((dopsSales / totalSales) * 100).toFixed()
          : 0;
        const averageBill = totalDeals
          ? +(dealsSales / totalDeals).toFixed()
          : 0;

        // Объединяем сделки
        const allDeals = new Map<number, any>();
        dealUsers.forEach((du) => allDeals.set(du.dealId, du.deal));
        dops.forEach((dop) => allDeals.set(dop.dealId, dop.deal));

        const revenueDetails: RevenueDetail[] = [];

        for (const deal of allDeals.values()) {
          const dealTotalPrice = deal.price || 0;
          const dopsTotalPrice = deal.dops.reduce(
            (sum: number, dop: any) => sum + (dop.price || 0),
            0,
          );
          const totalDealCost = dealTotalPrice + dopsTotalPrice;
          const totalPayments = deal.payments.reduce(
            (sum: number, payment: any) => sum + (payment.price || 0),
            0,
          );

          // Проверка на наличие dealers
          const dealUserShares =
            deal.dealers && deal.dealers.length > 0
              ? deal.dealers.map((du: any) => ({
                  userId: du.userId,
                  price: du.price,
                  sharePercentage:
                    totalDealCost > 0 ? du.price / totalDealCost : 0,
                  revenue:
                    totalPayments *
                    (totalDealCost > 0 ? du.price / totalDealCost : 0),
                }))
              : [];

          const dopShares = deal.dops.map((dop: any) => ({
            userId: dop.userId,
            price: dop.price,
            sharePercentage: totalDealCost > 0 ? dop.price / totalDealCost : 0,
            revenue:
              totalPayments *
              (totalDealCost > 0 ? dop.price / totalDealCost : 0),
          }));

          const managerShares = [
            ...dealUserShares.filter((s: any) => s.userId === m.id),
            ...dopShares.filter((s: any) => s.userId === m.id),
          ];

          managerShares.forEach((share: any) => {
            revenueDetails.push({
              dealId: deal.id,
              dealTotalPrice,
              dopsTotalPrice,
              totalDealCost,
              totalPayments,
              managerPrice: share.price,
              managerSharePercentage: +share.sharePercentage.toFixed(4),
              revenue: +share.revenue.toFixed(2),
            });
          });
        }

        const totalRevenue = revenueDetails.reduce(
          (sum: number, detail: RevenueDetail) => sum + detail.revenue,
          0,
        );

        return {
          id: m.id,
          manager: m.fullName,
          plan,
          dealsSales,
          totalSales,
          dealsAmount: totalDeals,
          salesToPlan,
          remainder,
          dopsSales,
          dopsToSales,
          dopsAmount,
          dealsWithoutDesigners: dealsWithoutDesigners.length,
          dealsSalesWithoutDesigners,
          averageBill,
          receivedPayments: +totalRevenue.toFixed(),
          workSpaceId: m.workSpaceId,
          groupId: m.groupId,
          managerId: m.id,
          period,
        };
      }),
    );

    const pay = await this.prisma.payment.findMany({
      where: {
        period,
      },
    });
    console.log(pay.reduce((a, b) => a + b.price, 0)); //2985507
    console.log(result.reduce((a, b) => a + b.receivedPayments, 0)); //2960085

    return result;
  }

  async getStatistics(user: UserDto, period: string) {
    const allWorkspaces = await this.prisma.workSpace.findMany({
      where: {
        deletedAt: null,
        department: 'COMMERCIAL',
        title: {
          in: ['B2B', 'ВК'],
        },
      },
      include: {
        deals: {
          where: {
            period,
            deletedAt: null,
          },
          include: {
            payments: {
              where: {
                period,
                deletedAt: null,
              },
            },
            dealers: {
              include: {
                user: true,
              },
            },
          },
        },
        users: {
          include: {
            managersPlans: {
              where: {
                period,
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

    const fullData = {
      workSpaceName: 'Все',
      chartData: [
        { name: '01', ['Сделки']: 0, ['Допы']: 0 },
        { name: '02', ['Сделки']: 0, ['Допы']: 0 },
        { name: '03', ['Сделки']: 0, ['Допы']: 0 },
        { name: '04', ['Сделки']: 0, ['Допы']: 0 },
        { name: '05', ['Сделки']: 0, ['Допы']: 0 },
        { name: '06', ['Сделки']: 0, ['Допы']: 0 },
        { name: '07', ['Сделки']: 0, ['Допы']: 0 },
        { name: '08', ['Сделки']: 0, ['Допы']: 0 },
        { name: '09', ['Сделки']: 0, ['Допы']: 0 },
        { name: '10', ['Сделки']: 0, ['Допы']: 0 },
        { name: '11', ['Сделки']: 0, ['Допы']: 0 },
        { name: '12', ['Сделки']: 0, ['Допы']: 0 },
        { name: '13', ['Сделки']: 0, ['Допы']: 0 },
        { name: '14', ['Сделки']: 0, ['Допы']: 0 },
        { name: '15', ['Сделки']: 0, ['Допы']: 0 },
        { name: '16', ['Сделки']: 0, ['Допы']: 0 },
        { name: '17', ['Сделки']: 0, ['Допы']: 0 },
        { name: '18', ['Сделки']: 0, ['Допы']: 0 },
        { name: '19', ['Сделки']: 0, ['Допы']: 0 },
        { name: '20', ['Сделки']: 0, ['Допы']: 0 },
        { name: '21', ['Сделки']: 0, ['Допы']: 0 },
        { name: '22', ['Сделки']: 0, ['Допы']: 0 },
        { name: '23', ['Сделки']: 0, ['Допы']: 0 },
        { name: '24', ['Сделки']: 0, ['Допы']: 0 },
        { name: '25', ['Сделки']: 0, ['Допы']: 0 },
        { name: '26', ['Сделки']: 0, ['Допы']: 0 },
        { name: '27', ['Сделки']: 0, ['Допы']: 0 },
        { name: '28', ['Сделки']: 0, ['Допы']: 0 },
        { name: '29', ['Сделки']: 0, ['Допы']: 0 },
        { name: '30', ['Сделки']: 0, ['Допы']: 0 },
        { name: '31', ['Сделки']: 0, ['Допы']: 0 },
      ],
      plan: 0,
      dealsSales: 0,
      totalSales: 0,
      dealsAmount: 0,
      dopSales: 0,
      dopsAmount: 0,
      salesToPlan: 0,
      remainder: 0,
      dopsToSales: 0,
      averageBill: 0,
      receivedPayments: 0,
      users: [],
      maketsSales: [
        {
          name: 'Дизайнерский',
          sales: 0,
        },
        {
          name: 'Заготовка из базы',
          sales: 0,
        },
        {
          name: 'Рекламный',
          sales: 0,
        },
        {
          name: 'Визуализатор',
          sales: 0,
        },
        {
          name: 'Из рассылки',
          sales: 0,
        },
      ],
    };

    const workSpacesData = allWorkspaces.map((w) => {
      const title = w.title;
      const data = {
        workSpaceName: title,
        chartData: [
          { name: '01', ['Сделки']: 0, ['Допы']: 0 },
          { name: '02', ['Сделки']: 0, ['Допы']: 0 },
          { name: '03', ['Сделки']: 0, ['Допы']: 0 },
          { name: '04', ['Сделки']: 0, ['Допы']: 0 },
          { name: '05', ['Сделки']: 0, ['Допы']: 0 },
          { name: '06', ['Сделки']: 0, ['Допы']: 0 },
          { name: '07', ['Сделки']: 0, ['Допы']: 0 },
          { name: '08', ['Сделки']: 0, ['Допы']: 0 },
          { name: '09', ['Сделки']: 0, ['Допы']: 0 },
          { name: '10', ['Сделки']: 0, ['Допы']: 0 },
          { name: '11', ['Сделки']: 0, ['Допы']: 0 },
          { name: '12', ['Сделки']: 0, ['Допы']: 0 },
          { name: '13', ['Сделки']: 0, ['Допы']: 0 },
          { name: '14', ['Сделки']: 0, ['Допы']: 0 },
          { name: '15', ['Сделки']: 0, ['Допы']: 0 },
          { name: '16', ['Сделки']: 0, ['Допы']: 0 },
          { name: '17', ['Сделки']: 0, ['Допы']: 0 },
          { name: '18', ['Сделки']: 0, ['Допы']: 0 },
          { name: '19', ['Сделки']: 0, ['Допы']: 0 },
          { name: '20', ['Сделки']: 0, ['Допы']: 0 },
          { name: '21', ['Сделки']: 0, ['Допы']: 0 },
          { name: '22', ['Сделки']: 0, ['Допы']: 0 },
          { name: '23', ['Сделки']: 0, ['Допы']: 0 },
          { name: '24', ['Сделки']: 0, ['Допы']: 0 },
          { name: '25', ['Сделки']: 0, ['Допы']: 0 },
          { name: '26', ['Сделки']: 0, ['Допы']: 0 },
          { name: '27', ['Сделки']: 0, ['Допы']: 0 },
          { name: '28', ['Сделки']: 0, ['Допы']: 0 },
          { name: '29', ['Сделки']: 0, ['Допы']: 0 },
          { name: '30', ['Сделки']: 0, ['Допы']: 0 },
          { name: '31', ['Сделки']: 0, ['Допы']: 0 },
        ],
        plan: 0,
        dealsSales: 0,
        totalSales: 0,
        dealsAmount: w.deals.length,
        dopSales: 0,
        dopsAmount: 0,
        salesToPlan: 0,
        remainder: 0,
        dopsToSales: 0,
        averageBill: 0,
        receivedPayments: 0,
        users: w.users.map((u) => {
          return {
            id: u.id,
            fullName: u.fullName,
            workSpace: w.title,
            sales: 0,
          };
        }),
        maketsSales: [
          {
            name: 'Дизайнерский',
            sales: 0,
          },
          {
            name: 'Заготовка из базы',
            sales: 0,
          },
          {
            name: 'Рекламный',
            sales: 0,
          },
          {
            name: 'Визуализатор',
            sales: 0,
          },
          {
            name: 'Из рассылки',
            sales: 0,
          },
        ],
      };

      // Считаем сумму сделок
      w.deals.map((deal) => {
        const day = deal.saleDate.slice(8, 10);
        const index = data.chartData.findIndex((d) => d.name === day);
        data.chartData[index]['Сделки'] += deal.price;
        fullData.chartData[index]['Сделки'] += deal.price;
        data.dealsSales += deal.price;
        data.totalSales += deal.price;

        deal.payments.map((payment) => {
          data.receivedPayments += payment.price;
        });
        deal.dealers.map((dealer) => {
          const userIndex = data.users.findIndex((u) => u.id === dealer.userId);
          data.users[userIndex].sales += dealer.price;
        });
        // console.log(deal.maketType);
        const maketIndex = data.maketsSales.findIndex(
          (m) => m.name === deal.maketType,
        );
        data.maketsSales[maketIndex].sales += deal.price;
      });

      w.users.map((user) => {
        user.dops.map((dop) => {
          const day = dop.saleDate.slice(8, 10);
          const index = data.chartData.findIndex((d) => d.name === day);
          data.chartData[index]['Допы'] += dop.price;
          fullData.chartData[index]['Допы'] += dop.price;
          data.dopSales += dop.price;
          data.dopsAmount += 1;
          data.totalSales += dop.price;
          data.plan = user.managersPlans[0]?.plan || 0;

          const userIndex = data.users.findIndex((u) => u.id === dop.userId);
          data.users[userIndex].sales += dop.price;
        });
      });

      data.dopsToSales = data.totalSales
        ? +((data.dopSales / data.totalSales) * 100).toFixed()
        : 0;
      data.averageBill = data.dealsAmount
        ? +(data.dealsSales / data.dealsAmount).toFixed()
        : 0;

      data.salesToPlan = data.plan
        ? +((data.totalSales / data.plan) * 100).toFixed()
        : 0;

      data.remainder = data.plan - data.totalSales;

      fullData.dealsAmount += data.dealsAmount;
      fullData.dealsSales += data.dealsSales;
      fullData.totalSales += data.totalSales;
      fullData.receivedPayments += data.receivedPayments;
      fullData.dopsAmount += data.dopsAmount;
      fullData.dopSales += data.dopSales;
      fullData.plan += data.plan;
      fullData.plan += data.plan;
      fullData.maketsSales = fullData.maketsSales.map((m) => {
        const maketIndex = data.maketsSales.findIndex((d) => d.name === m.name);
        m.sales += data.maketsSales[maketIndex].sales;
        return m;
      });

      data.users = data.users.sort((a, b) => b.sales - a.sales).slice(0, 5);
      return data;
    });

    fullData.dopsToSales = fullData.totalSales
      ? +((fullData.dopSales / fullData.totalSales) * 100).toFixed()
      : 0;
    fullData.averageBill = fullData.dealsAmount
      ? +(fullData.dealsSales / fullData.dealsAmount).toFixed()
      : 0;
    fullData.salesToPlan = fullData.plan
      ? +((fullData.totalSales / fullData.plan) * 100).toFixed()
      : 0;

    fullData.remainder = fullData.plan - fullData.totalSales;

    const topManagers = workSpacesData.flatMap((w) => w.users);

    return [
      {
        ...fullData,
        users: topManagers.sort((a, b) => b.sales - a.sales).slice(0, 5),
      },
      ...workSpacesData,
    ];
  }
}
