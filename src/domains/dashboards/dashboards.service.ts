import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserDto } from '../users/dto/user.dto';

const formatDate = (dateString: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    // throw new Error('Дата должна быть в формате YYYY-MM-DD');
    return '';
  }
  const [year, month, day] = dateString.split('-');
  return `${day}.${month}.${year}`;
};

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

interface ChartDataItem {
  name: string;
  ['Сделки']: number;
  ['Допы']: number;
}

interface User {
  id: number;
  fullName: string;
  workSpace: string;
  sales: number;
}

interface MaketsSales {
  name: string;
  sales: number;
}

interface Sources {
  name: string;
  sales: number;
}

interface AdTag {
  name: string;
  sales: number;
}

interface AdExpenses {
  name: string;
  sales: number;
}

export interface WorkSpaceData {
  workSpaceName: string;
  chartData: ChartDataItem[];
  plan: number;
  dealsSales: number;
  totalSales: number;
  dealsAmount: number;
  dopSales: number;
  dopsAmount: number;
  salesToPlan: number;
  remainder: number;
  dopsToSales: number;
  averageBill: number;
  receivedPayments: number;
  users: User[];
  maketsSales: MaketsSales[];
  sources: Sources[];
  adTags: AdTag[];
  adExpenses: AdExpenses[];
}

@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkspaces(user: UserDto) {
    let where: Partial<{ deletedAt: null; id: { gt: number } | number }> = {
      deletedAt: null,
    };
    if (!['ADMIN', 'G', 'KD'].includes(user.role.shortName)) {
      where = { id: user.workSpaceId, deletedAt: null };
    }
    const workspaces = await this.prisma.workSpace.findMany({
      where,
      include: {
        groups: {
          include: {
            users: {
              where: { deletedAt: null },
              select: {
                fullName: true,
                role: true,
                tg: true,
                id: true,
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

    if (!['ADMIN', 'G', 'KD'].includes(user.role.shortName)) {
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
        deletedAt: null,
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
        deletedAt: null,
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
              reservation: false,
              deletedAt: null,
            },
          },
          include: {
            deal: {
              include: {
                payments: {
                  where: {
                    period,
                  },
                }, // Подтягиваем платежи для каждой сделки
                dops: {
                  where: { period },
                },
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

        // Находим все Dop за период для деления частей выручки
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
    // console.log(pay.reduce((a, b) => a + b.price, 0)); //2985507
    // console.log(result.reduce((a, b) => a + b.receivedPayments, 0)); //2960085

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
            role: true,
            dops: {
              where: {
                period,
              },
            },
          },
        },
        adSources: {
          include: {
            adExpenses: {
              where: {
                date: {
                  startsWith: period,
                },
              },
            },
          },
        },
      },
    });

    const fullData: WorkSpaceData = {
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
      sources: [],
      adTags: [],
      adExpenses: [],
    };

    const workSpacesData = allWorkspaces.map((w) => {
      const title = w.title;
      const data: WorkSpaceData = {
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
        sources: [],
        adTags: [],
        adExpenses: [],
      };

      // console.log(w.dealSources);
      w.adSources.map((ds) => {
        // console.log(ds);
        const adExps = ds.adExpenses.reduce((a, b) => a + b.price, 0);
        if (!data.adExpenses.find((e) => e.name === ds.title)) {
          data.adExpenses.push({
            name: ds.title,
            sales: adExps,
          });
        } else {
          const dsIndex = data.adExpenses.findIndex((s) => s.name === ds.title);
          data.adExpenses[dsIndex].sales += adExps;
        }
        if (!fullData.adExpenses.find((e) => e.name === ds.title)) {
          fullData.adExpenses.push({
            name: ds.title,
            sales: adExps,
          });
        } else {
          const dsIndex = fullData.adExpenses.findIndex(
            (s) => s.name === ds.title,
          );
          fullData.adExpenses[dsIndex].sales += adExps;
        }

        data.adExpenses.sort((a, b) => b.sales - a.sales);
      });

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

        // sources
        if (!data.sources.find((s) => s.name === deal.source)) {
          data.sources.push({ name: deal.source, sales: deal.price });
        } else {
          const sourceIndex = data.sources.findIndex(
            (s) => s.name === deal.source,
          );
          data.sources[sourceIndex].sales += deal.price;
        }
        if (!fullData.sources.find((s) => s.name === deal.source)) {
          fullData.sources.push({ name: deal.source, sales: deal.price });
        } else {
          const sourceIndex = fullData.sources.findIndex(
            (s) => s.name === deal.source,
          );
          fullData.sources[sourceIndex].sales += deal.price;
        }

        //adtags
        if (!data.adTags.find((s) => s.name === deal.adTag)) {
          data.adTags.push({ name: deal.adTag, sales: deal.price });
        } else {
          const adTagIndex = data.adTags.findIndex(
            (s) => s.name === deal.adTag,
          );
          data.adTags[adTagIndex].sales += deal.price;
        }
        if (!fullData.adTags.find((s) => s.name === deal.adTag)) {
          fullData.adTags.push({ name: deal.adTag, sales: deal.price });
        } else {
          const adTagIndex = fullData.adTags.findIndex(
            (s) => s.name === deal.adTag,
          );
          fullData.adTags[adTagIndex].sales += deal.price;
        }

        data.sources.sort((a, b) => b.sales - a.sales);
        data.adTags.sort((a, b) => b.sales - a.sales);
        data.maketsSales.sort((a, b) => b.sales - a.sales);
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
          const userIndex = data.users.findIndex((u) => u.id === dop.userId);
          data.users[userIndex].sales += dop.price;
        });

        if (user.role.shortName === 'DO') {
          // console.log(user);
          data.plan = user.managersPlans[0]?.plan || 0;
        }
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
      // console.log(fullData.plan);

      fullData.dealsAmount += data.dealsAmount;
      fullData.dealsSales += data.dealsSales;
      fullData.totalSales += data.totalSales;
      fullData.receivedPayments += data.receivedPayments;
      fullData.dopsAmount += data.dopsAmount;
      fullData.dopSales += data.dopSales;
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

    fullData.sources.sort((a, b) => b.sales - a.sales);
    fullData.adTags.sort((a, b) => b.sales - a.sales);
    fullData.maketsSales.sort((a, b) => b.sales - a.sales);
    fullData.adExpenses.sort((a, b) => b.sales - a.sales);

    const topManagers = workSpacesData.flatMap((w) => w.users);

    return [
      {
        ...fullData,
        users: topManagers.sort((a, b) => b.sales - a.sales).slice(0, 5),
      },
      ...workSpacesData,
    ];
  }

  async getDatas() {
    const workspaces = await this.prisma.workSpace.findMany({
      include: {
        groups: {
          include: {
            users: {
              include: {
                clients: {
                  include: {
                    deals: {
                      include: {
                        dops: true,
                        payments: true,
                        dealers: true,
                      },
                    },
                  },
                },
                managersPlans: true,
              },
            },
          },
        },
        dealSources: true,
        reports: true,
        adExpenses: true,
      },
    });

    // Получаем остальные данные
    const doptypes = await this.prisma.dopsType.findMany();
    const tag = await this.prisma.adTag.findMany();
    const clothingMethods = await this.prisma.clothingMethod.findMany();
    const spheres = await this.prisma.sphere.findMany();

    // Возвращаем JSON-ответ
    return {
      workspaces,
      doptypes,
      tag,
      clothingMethods,
      spheres,
    };
  }
  async getManagersReports(user: UserDto, period: string) {
    function generateMonthDates(period: string): { date: string }[] {
      // Разделяем строку на год и месяц
      const [year, month] = period.split('-').map(Number);

      // Создаем дату первого дня месяца
      const startDate = new Date(year, month - 1, 1); // month - 1, так как месяцы в JS с 0
      const lastDay = new Date(year, month, 0).getDate(); // Последний день месяца

      const result: { date: string }[] = [];

      // Генерируем даты от 1 до последнего дня
      for (let day = 1; day <= lastDay; day++) {
        const date = new Date(year, month - 1, day);
        const formattedDate = date.toISOString().split('T')[0]; // Формат "YYYY-MM-DD"
        result.push({ date: formattedDate });
      }

      return result;
    }
    const dates = generateMonthDates(period);

    console.log(dates);
  }

  async getPays(user: UserDto, period: string) {
    const workspacesSearch =
      user.role.department === 'administration' ? { gt: 0 } : user.workSpaceId;

    const workspaces = await this.prisma.workSpace.findMany({
      where: {
        id: workspacesSearch,
        deletedAt: null,
      },
      include: {
        salaryPays: {
          where: {
            period,
          },
          include: {
            user: {
              include: {
                role: true,
              },
            },
          },
        },
        users: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    const result = workspaces.map((w) => ({
      id: w.id,
      title: w.title,
      pays: w.salaryPays
        .map((p) => ({
          id: p.id,
          fullName: p.user.fullName,
          role: p.user.role.fullName,
          userId: p.userId,
          price: p.price,
          date: formatDate(p.date),
          period: p.period,
          status: p.status,
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
      users: w.users,
      totals: [
        {
          title: 'Выплачено',
          value: w.salaryPays
            .filter((p) => p.date !== '')
            .reduce((sum, p) => sum + p.price, 0),
        },
        {
          title: 'Остаток',
          value: w.salaryPays
            .filter((p) => p.date == '')
            .reduce((sum, p) => sum + p.price, 0),
        },
      ],
    }));

    return result;
  }
}
