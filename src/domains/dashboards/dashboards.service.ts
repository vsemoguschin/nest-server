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

    const chartData = [{ name: '2025-02-01', sales: 4000 }];

    //отсортировать все user.deals по saleDate(2025-02-01, 2025-02-02, 2025-02-03, ...)

    // Общий план
    let totalPlan = 0;

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

        totalPlan += managerPlan?.plan || 0;
      }),
    );

    return result;
  }
}
