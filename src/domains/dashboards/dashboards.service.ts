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
    //period = '2025-02';

    const resultExample = {
      workspaces: [
        {
          id: 1,
          title: 'Рабочее пространство 1',
          plan: 10000,
          dealsSales: 5000,
          totalSales: 6000,
          dealsAmount: 10,
          dopSales: 1000,
          dopsAmount: 5,
          salesToPlan: 60,
          remainder: 4000,
          dopsToSales: 20,
          dealsWithoutDesigners: 5,
          dealsSalesWithoutDesigners: 2000,
          averageBill: 500,
          receivedPayments: 5000,
          top5Users: [
            {
              name: 'Иванов Иван Иванович',
              sales: 100,
            },
            {
              name: 'Иванов Иван Иванович',
              sales: 90,
            },
            {
              name: 'Иванов Иван Иванович',
              sales: 80,
            },
            {
              name: 'Иванов Иван Иванович',
              sales: 70,
            },
            {
              name: 'Иванов Иван Иванович',
              sales: 60,
            },
          ],
        },
        {
          id: 2,
          title: 'Рабочее пространство 2',
          plan: 15000,
          dealsSales: 7000,
          totalSales: 8500,
          dealsAmount: 15,
          dopSales: 1500,
          dopsAmount: 7,
          salesToPlan: 57,
          remainder: 6500,
          dopsToSales: 18,
          dealsWithoutDesigners: 8,
          dealsSalesWithoutDesigners: 3000,
          averageBill: 566,
          receivedPayments: 7000,
          top5Users: [
            {
              name: 'Петров Петр Петрович',
              sales: 110,
            },
            {
              name: 'Петров Петр Петрович',
              sales: 100,
            },
            {
              name: 'Петров Петр Петрович',
              sales: 90,
            },
            {
              name: 'Петров Петр Петрович',
              sales: 80,
            },
            {
              name: 'Петров Петр Петрович',
              sales: 70,
            },
          ],
        },
      ],
      totals: {
        plan: 25000,
        dealsSales: 12000,
        totalSales: 14500,
        dealsAmount: 25,
        dopSales: 2500,
        dopsAmount: 12,
        salesToPlan: 58,
        remainder: 10500,
        dopsToSales: 19,
        dealsWithoutDesigners: 13,
        dealsSalesWithoutDesigners: 5000,
        averageBill: 533,
        receivedPayments: 12000,
      },
    };

    const allWorkspaces = await this.prisma.workSpace.findMany({
      where: {
        deletedAt: null,
        department: 'COMMERCIAL',
        title: {
          in: ['B2B', 'ВК', 'Ведение']
        }
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

    const result = allWorkspaces.map((w) => {
      const plan = w.users.reduce(
        (sum, user) => sum + user.managersPlans[0]?.plan || 0,
        0,
      );
      const dealsSales = w.deals.reduce((sum, deal) => sum + deal.price, 0);
      const dopSales = w.users.reduce(
        (sum, user) => sum + user.dops.reduce((sum, dop) => sum + dop.price, 0),
        0,
      );
      const totalSales = dealsSales + dopSales;
      const dealsAmount = w.deals.length;
      const dopsAmount = w.users.reduce(
        (sum, user) => sum + user.dops.length,
        0,
      );
      const salesToPlan = plan ? +((totalSales / plan) * 100).toFixed() : 0;
      const remainder = plan - totalSales;
      const dopsToSales = totalSales;
      const averageBill = dealsAmount
        ? +(dealsSales / dealsAmount).toFixed()
        : 0;
      const receivedPayments = w.deals.reduce(
        (sum, deal) =>
          sum + deal.payments.reduce((sum, payment) => sum + payment.price, 0),
        0,
      );

      const chartData = [
        { name: '01', total: 0 },
        { name: '02', total: 0 },
        { name: '03', total: 0 },
        { name: '04', total: 0 },
        { name: '05', total: 0 },
        { name: '06', total: 0 },
        { name: '07', total: 0 },
        { name: '08', total: 0 },
        { name: '09', total: 0 },
        { name: '10', total: 0 },
        { name: '11', total: 0 },
        { name: '12', total: 0 },
        { name: '13', total: 0 },
        { name: '14', total: 0 },
        { name: '15', total: 0 },
        { name: '16', total: 0 },
        { name: '17', total: 0 },
        { name: '18', total: 0 },
        { name: '19', total: 0 },
        { name: '20', total: 0 },
        { name: '21', total: 0 },
        { name: '22', total: 0 },
        { name: '23', total: 0 },
        { name: '24', total: 0 },
        { name: '25', total: 0 },
        { name: '26', total: 0 },
        { name: '27', total: 0 },
        { name: '28', total: 0 },
        { name: '29', total: 0 },
        { name: '30', total: 0 },
        { name: '31', total: 0 },
      ];

      w.deals.map((deal) => {
        const day = deal.saleDate.slice(8, 10);
        const index = chartData.findIndex((d) => d.name === day);
        chartData[index].total += deal.price;
      });

      return {
        id: w.id,
        title: w.title,
        plan,
        dealsSales,
        totalSales,
        dealsAmount,
        dopSales,
        dopsAmount,
        salesToPlan,
        remainder,
        dopsToSales,
        averageBill,
        receivedPayments,
        chartData,
      };
    });

    // Находим пользователей с department = 'COMMERCIAL'
    const managers = await this.prisma.user.findMany({
      where: {
        role: {
          department: 'COMMERCIAL',
        },
      },
      include: {
        role: true,
        deals: {
          where: {
            period,
            deletedAt: null,
          },
        },
      },
    });

    const chartData = [
      { name: '01', total: 0 },
      { name: '02', total: 0 },
      { name: '03', total: 0 },
      { name: '04', total: 0 },
      { name: '05', total: 0 },
      { name: '06', total: 0 },
      { name: '07', total: 0 },
      { name: '08', total: 0 },
      { name: '09', total: 0 },
      { name: '10', total: 0 },
      { name: '11', total: 0 },
      { name: '12', total: 0 },
      { name: '13', total: 0 },
      { name: '14', total: 0 },
      { name: '15', total: 0 },
      { name: '16', total: 0 },
      { name: '17', total: 0 },
      { name: '18', total: 0 },
      { name: '19', total: 0 },
      { name: '20', total: 0 },
      { name: '21', total: 0 },
      { name: '22', total: 0 },
      { name: '23', total: 0 },
      { name: '24', total: 0 },
      { name: '25', total: 0 },
      { name: '26', total: 0 },
      { name: '27', total: 0 },
      { name: '28', total: 0 },
      { name: '29', total: 0 },
      { name: '30', total: 0 },
      { name: '31', total: 0 },
    ];

    let dealsSales = 0;

    // const result = await Promise.all(
    //   managers.map(async (m) => {
    //     // Находим ManagersPlan за период
    //     const managerPlan = await this.prisma.managersPlan.findFirst({
    //       where: {
    //         userId: m.id,
    //         period,
    //         deletedAt: null,
    //       },
    //     });
    //     m.deals.map((deal) => {
    //       const day = deal.saleDate.slice(8, 10);
    //       const index = chartData.findIndex((d) => d.name === day);
    //       chartData[index].total += deal.price;
    //       dealsSales += deal.price;
    //     });
    //   }),
    // );

    // убрать элементы с нулевыми значениями total из chartData
    const filteredChartData = chartData.filter((d) => d.total);

    return result;
  }
}
