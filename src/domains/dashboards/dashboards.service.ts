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

interface CalsChartDataItem {
  name: string;
  ['ВК']: number;
  ['B2B']: number;
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
  amount: number;
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
  callsChartData: CalsChartDataItem[];
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

    if (!['ADMIN', 'G', 'KD', 'ROV', 'MOV'].includes(user.role.shortName)) {
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
        role: { shortName: { in: ['MOP', 'DO'] } },
        deletedAt: null,
      },
      include: {
        workSpace: true,
      },
    });

    return { workSpaces, groups, managers };
  }

  // comercial
  async getComercialData(user: UserDto, period: string) {
    const workspacesSearch =
      user.role.department === 'administration' || user.role.shortName === 'KD'
        ? { gt: 0 }
        : user.workSpaceId;

    const workSpaces = await this.prisma.workSpace.findMany({
      where: {
        id: workspacesSearch,
        department: 'COMMERCIAL',
      },
      include: {
        users: {
          where: {
            role: {
              shortName: {
                in: ['MOP', 'MOV'],
              },
            },
          },
          include: {
            role: true,
            managersPlans: {
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
                saleDate: {
                  startsWith: period,
                },
                deal: {
                  reservation: false,
                  status: { not: 'Возврат' },
                },
              },
              include: {
                deal: {
                  select: {
                    title: true,
                    price: true,
                    payments: true,
                    dops: true,
                  },
                },
              },
            },
            managerReports: {
              where: {
                date: {
                  startsWith: period,
                },
              },
            },
            salaryPays: {
              where: {
                period,
              },
            },
          },
        },
        payments: {
          where: {
            date: {
              startsWith: period,
            },
            deal: {
              reservation: false,
              status: { not: 'Возврат' },
            },
          },
          include: {
            deal: {
              include: {
                dops: true,
                dealers: true,
                payments: true,
              },
            },
          },
        },
        adExpenses: {
          where: {
            date: {
              startsWith: period,
            },
          },
        },
        deals: {
          where: {
            saleDate: {
              startsWith: period,
            },
            reservation: false,
            status: { not: 'Возврат' },
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
      },
    });

    // console.log(workSpaces);
    const ropPlan = await this.prisma.managersPlan.findFirst({
      where: {
        period,
        user: {
          role: {
            shortName: 'DO',
          },
          fullName: 'Юлия Куштанова',
        },
      },
    });

    return workSpaces.flatMap((w) => {
      const adExpenses = w.adExpenses.reduce((a, b) => a + b.price, 0);
      const calls = w.users
        .flatMap((u) => u.managerReports)
        .reduce((a, b) => a + b.calls, 0);
      const callCost = calls ? adExpenses / calls : 0;
      const workSpacePayments = w.payments;
      const dealPrice = w.deals.reduce((a, b) => a + b.price, 0);
      // console.log(dealPrice, ` сделки пространства ${w.title}`);

      let isOverRopPlan = false;
      const ropPlanValue = ropPlan?.plan || 0;
      const workSpaceDealSales = w.deals.reduce((acc, d) => acc + d.price, 0);
      const workSpaceDopSales = w.dops.reduce((acc, d) => acc + d.price, 0);
      const workSpaceTotalSales = workSpaceDealSales + workSpaceDopSales;

      if (workSpaceTotalSales > ropPlanValue && ropPlanValue > 0) {
        isOverRopPlan = true;
      }

      const userData = w.users
        .map((m) => {
          let totalSalary = 0;
          const pays = m.salaryPays.reduce((a, b) => a + b.price, 0) || 0;
          const dealSales = m.dealSales.reduce((a, b) => a + b.price, 0);
          const dealsAmount = m.dealSales.length;
          const dopSales = m.dops.reduce((a, b) => a + b.price, 0);
          const dopsAmount = m.dops.length;
          const totalSales = dealSales + dopSales;
          const averageBill = dealsAmount
            ? +(totalSales / dealsAmount).toFixed()
            : 0;

          function getDaysInMonth(year: number, month: number): number {
            return new Date(year, month, 0).getDate();
          }
          const daysInMonth = getDaysInMonth(
            +period.split('-')[0],
            +period.split('-')[1],
          );
          //today
          const isThismounth =
            period.split('-')[1] === new Date().toISOString().slice(5, 7);
          const today = isThismounth
            ? new Date().toISOString().slice(8, 10)
            : daysInMonth;

          const temp = +((totalSales / +today) * daysInMonth).toFixed();

          const calls = m.managerReports.reduce((a, b) => a + b.calls, 0);
          const conversionDealsToCalls = calls
            ? +((dealsAmount / calls) * 100).toFixed(2)
            : 0;
          const makets = m.managerReports.reduce((a, b) => a + b.makets, 0);
          // конверсия из заявки в макет
          const conversionMaketsToCalls = calls
            ? +((makets / calls) * 100).toFixed(2)
            : 0;
          const maketsDayToDay = m.managerReports.reduce(
            (a, b) => a + b.maketsDayToDay,
            0,
          );
          // конверсия из макета в подажу
          const conversionMaketsToSales = makets
            ? +((dealsAmount / makets) * 100).toFixed(2)
            : 0;
          // конверсия из заявки в макет день в день
          const conversionMaketsDayToDayToCalls = calls
            ? +((maketsDayToDay / calls) * 100).toFixed(2)
            : 0;
          const dealsDayToDay = m.dealSales.filter(
            (ds) => ds.deal.saleDate === ds.deal.client.firstContact,
          );
          const dealsDayToDayPrice = dealsDayToDay.reduce(
            (a, b) => a + b.price,
            0,
          );

          const drr = totalSales
            ? +(((calls * callCost) / totalSales) * 100).toFixed(2)
            : 0;

          // Находим сделки без дизайнеров
          const dealsWithoutDesigners = m.dealSales
            .flatMap((ds) => ds.deal)
            .filter((d) =>
              [
                'Заготовка из базы',
                'Рекламный',
                'Из рассылки',
                'Визуализатор',
              ].includes(d.maketType),
            );

          const dealsSalesWithoutDesigners = dealsWithoutDesigners.reduce(
            (sum, deal) => sum + (deal.price || 0),
            0,
          );

          const conversionDayToDay = calls
            ? +((dealsDayToDay.length / calls) * 100).toFixed(2)
            : 0;

          const dimmerSales = m.dops
            .filter((d) => d.type === 'Диммер')
            .reduce((a, b) => a + b.price, 0);

          // Конверсия
          const conversion = calls
            ? +((dealsAmount / calls) * 100).toFixed(2)
            : 0;

          //Подробная информация по сделкам
          const dealsInfo = m.dealSales.map((d) => {
            const {
              title,
              saleDate,
              price: dealPrice,
              payments: dealPayments,
            } = d.deal;
            const dealerPrice = d.price;
            const dealerPart = dealerPrice / dealPrice;
            const isWithoutDesigner = [
              'Заготовка из базы',
              'Рекламный',
              'Из рассылки',
              'Визуализатор',
            ].includes(d.deal.maketType);
            const payAmount = dealPayments.reduce(
              (a, b) => a + (b.price || 0),
              0,
            );
            const paid =
              payAmount > dealPrice
                ? dealPrice * dealerPart
                : payAmount * dealerPart;
            return {
              id: d.deal.id,
              title: isWithoutDesigner
                ? title.slice(0, 15) + '(БЕЗ ДИЗА)'
                : title.slice(0, 15),
              saleDate,
              dealPrice,
              dealerPrice,
              dealerPart: +(dealerPart * 100).toFixed(2),
              paid: +paid.toFixed(2),
            };
          });
          // console.log('manager', m.fullName);
          // console.log(
          //   'dealInfo',
          //   dealsInfo.reduce((a, b) => a + b.dealerPrice, 0),
          // );
          // console.log('dealSales', dealSales);

          // Подробная информация по допам
          const dopsInfo = m.dops.map((d) => {
            const title = d.type;
            const dopPrice = d.price;
            const saleDate = d.saleDate;
            const dealTitle = d.deal.title;
            const dealPrice = d.deal.price;
            const dealPayments = d.deal.payments.reduce(
              (a, b) => a + b.price,
              0,
            );
            const dealDopsPrice = d.deal.dops.reduce((a, b) => a + b.price, 0);
            const dealDopsPaidPrice =
              dealPayments > dealPrice ? dealPayments - dealPrice : 0;
            const dealerPart = dopPrice / dealDopsPrice;
            const dealerPrice = dealDopsPaidPrice * dealerPart;
            return {
              title,
              dopPrice,
              saleDate,
              dealTitle: dealTitle.slice(0, 15),
              dealId: d.dealId,
              paid: +dealerPrice.toFixed(2),
            };
          });

          const dealInfoPrevMounth = workSpacePayments
            .filter(
              (p) =>
                !p.deal.saleDate.includes(period) &&
                p.deal.dealers.find((d) => d.userId === m.id),
            )
            .map((p) => {
              const {
                title,
                saleDate,
                price: dealPrice,
                payments: dealPayments,
              } = p.deal;
              const dealerPrice =
                p.deal.dealers.find((d) => d.userId === m.id)?.price || 0;
              const dealerPart = dealerPrice / dealPrice;
              const payAmount = dealPayments.reduce(
                (a, b) => a + (b.price || 0),
                0,
              );
              const paid =
                payAmount > dealPrice
                  ? p.price * dealerPart
                  : payAmount * dealerPart;
              return {
                id: p.deal.id,
                title,
                saleDate,
                dealPrice,
                dealerPrice,
                dealerPart: +(dealerPart * 100).toFixed(2),
                paid: +paid.toFixed(2),
              };
            });

          const shift = m.managerReports.length;
          const shiftBonus = m.managerReports.reduce(
            (a, b) => a + b.shiftCost,
            0,
          );
          const redirectToMSG = m.managerReports.reduce(
            (a, b) => a + b.redirectToMSG,
            0,
          );
          let dopPays = 0;
          let dealPays = 0;
          totalSalary += shiftBonus;

          // Процент с продаж в зп
          let bonusPercentage = 0;
          let bonus = 0;
          //           до 399999 - 3%
          // от 560000 до 679999 - 3,5%
          // от 680000 до 799999 - 4%
          // от 800000 до 999999 - 4,5% + премия 10480
          // от 1000000 до 1099999 - 5% + премия 15000

          // от 1100000 до 1199999 - 5% + премия 17500
          if (w.title === 'B2B') {
            if (totalSales < 400_000) {
              bonusPercentage = 0.03;
            } else if (totalSales < 560_000) {
              bonusPercentage = 0.03;
            } else if (totalSales < 680_000) {
              bonusPercentage = 0.035;
            } else if (totalSales < 800_000) {
              bonusPercentage = 0.04;
            } else if (totalSales < 1_000_000) {
              bonusPercentage = 0.045;
              totalSalary += 10480;
              bonus += 10480;
            } else if (totalSales < 1_100_000) {
              bonusPercentage = 0.05;
              totalSalary += 15000;
              bonus += 15000;
            } else if (totalSales < 1_200_000) {
              bonusPercentage = 0.05;
              totalSalary += 17500;
              bonus += 17500;
            } else if (totalSales < 1_350_000) {
              bonusPercentage = 0.05;
              totalSalary += 20000;
              bonus += 20000;
            } else if (totalSales < 1_500_000) {
              bonusPercentage = 0.05;
              totalSalary += 23700;
              bonus += 23700;
            } else if (totalSales < 1_700_000) {
              bonusPercentage = 0.05;
              totalSalary += 27500;
              bonus += 27500;
            } else if (totalSales < 2_000_000) {
              bonusPercentage = 0.05;
              totalSalary += 32500;
              bonus += 32500;
            } else if (totalSales >= 2_000_000) {
              bonusPercentage = 0.05;
              totalSalary += 40000;
              bonus += 40000;
            }
            dopPays = dopsInfo.reduce((a, b) => a + b.paid, 0) * 0.1;
            dealPays =
              dealsInfo.reduce((a, b) => a + b.paid, 0) * bonusPercentage;
          }
          if (w.title === 'ВК') {
            if (totalSales < 400_000) {
              bonusPercentage = 0.03;
            } else if (totalSales >= 400_000 && totalSales < 600_000) {
              bonusPercentage = 0.05;
            } else if (totalSales >= 600_000 && totalSales < 700_000) {
              bonusPercentage = 0.06;
            } else if (totalSales >= 700_000 && totalSales < 1_000_000) {
              bonusPercentage = 0.07;
            } else if (totalSales >= 1_000_000) {
              bonusPercentage = 0.07;
              totalSalary += 10_000; // Премия за достижение 1 млн
              bonus += 10_000; // Премия за достижение 1 млн
            }
            dopPays =
              +dopsInfo.reduce((a, b) => a + b.paid, 0) * bonusPercentage;
            dealPays =
              dealsInfo.reduce((a, b) => a + b.paid, 0) * bonusPercentage;
            const workSpacePlanBonus = isOverRopPlan ? 3000 : 0;
            totalSalary += workSpacePlanBonus;
            bonus += workSpacePlanBonus;
          }
          totalSalary += dealPays + dopPays;

          return {
            //основное
            fullName: m.fullName,
            id: m.id,
            workSpace: w.title,
            plan: m.managersPlans[0]?.plan ?? 0,
            totalSales,
            dealSales,
            dopSales,
            temp,
            dealsAmount,
            dopsAmount,
            // показатели
            averageBill,
            drr,
            calls,
            makets,
            maketsDayToDay,
            conversionMaketsToCalls,
            conversionMaketsDayToDayToCalls,
            dealsDayToDay: dealsDayToDay.length,
            dealsDayToDayPrice,
            conversionDealsToCalls,
            dealsWithoutDesigners: dealsWithoutDesigners.length,
            dealsSalesWithoutDesigners,
            conversionMaketsToSales,
            redirectToMSG,
            //зп
            totalSalary: +totalSalary.toFixed(2),
            pays,
            rem: +(totalSalary - pays).toFixed(2),
            dopPays: +dopPays.toFixed(2),
            dealPays: +dealPays.toFixed(2),
            bonusPercentage,
            bonus,
            shiftBonus: shiftBonus.toFixed(2),
            shift,
            // подробнее
            dealsInfo,
            dealInfoPrevMounth,
            dopsInfo,
            topBonus: 0,
            fired: m.deletedAt ? true : false,
            isIntern: m.isIntern,

            conversionDayToDay,
            dimmerSales,
            conversion,
          };
        })
        .filter((u) => u.totalSales || !u.fired);

      // Определение топов
      const topTotalSales = [...userData]
        .filter((u) => u.workSpace === 'ВК')
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            user.topBonus += (-i + 3) * 1000;
            user.totalSalary += (-i + 3) * 1000;
          }
          return { user: u.fullName, sales: u.totalSales };
        });

      const topDopSales = [...userData]
        .filter((u) => u.workSpace === 'ВК')
        .sort((a, b) => b.dopSales - a.dopSales)
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            user.topBonus += (-i + 3) * 1000;
            user.totalSalary += (-i + 3) * 1000;
          }
          return { user: u.fullName, sales: u.dopSales };
        });
      const topDimmerSales = [...userData]
        .filter((u) => u.workSpace === 'ВК')
        .sort((a, b) => b.dimmerSales - a.dimmerSales)
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            user.topBonus += (-i + 3) * 1000;
            user.totalSalary += (-i + 3) * 1000;
          }
          return { user: u.fullName, sales: u.dimmerSales };
        });
      const topSalesWithoutDesigners = [...userData]
        .filter((u) => u.workSpace === 'ВК')
        .sort(
          (a, b) => b.dealsSalesWithoutDesigners - a.dealsSalesWithoutDesigners,
        )
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            user.topBonus += (-i + 3) * 1000;
            user.totalSalary += (-i + 3) * 1000;
          }
          return { user: u.fullName, sales: u.dealsSalesWithoutDesigners };
        });
      const topConversionDayToDay = [...userData]
        .filter((u) => u.workSpace === 'ВК')
        .sort((a, b) => b.conversionDayToDay - a.conversionDayToDay)
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            user.topBonus += (-i + 3) * 1000;
            user.totalSalary += (-i + 3) * 1000;
          }
          return { user: u.fullName, sales: u.conversionDayToDay };
        });

      // АВИТО
      // - Самая высокая Сумма Заказов в отделе
      const topDealSalesAvito = [...userData]
        .filter((u) => u.workSpace === 'B2B')
        .sort((a, b) => b.dealSales - a.dealSales)
        .slice(0, 1)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            u.topBonus += 2000;
            u.totalSalary += 2000;
          }
        });
      // - Самая высокая сумма Допов в отделе
      const topDopSalesAvito = [...userData]
        .filter((u) => u.workSpace === 'B2B')
        .sort((a, b) => b.dopSales - a.dopSales)
        .slice(0, 1)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            u.topBonus += 2000;
            u.totalSalary += 2000;
          }
        });
      // - Самый Высокий средний чек в отделе
      const topAverageBillAvito = [...userData]
        .filter((u) => u.workSpace === 'B2B')
        .sort((a, b) => b.averageBill - a.averageBill)
        .slice(0, 1)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            u.topBonus += 2000;
            u.totalSalary += 2000;
          }
        });
      // - Самая высокая конверсия в отделе
      const topConversionAvito = [...userData]
        .filter((u) => u.workSpace === 'B2B')
        .sort((a, b) => b.conversion - a.conversion)
        .slice(0, 1)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            u.topBonus += 2000;
            u.totalSalary += 2000;
          }
        });

      return userData;
    });
  }

  // managers
  async getManagersData(user: UserDto, period: string) {
    const workspacesSearch =
      user.role.department === 'administration' || user.role.shortName === 'KD'
        ? { gt: 0 }
        : user.workSpaceId;

    // Находим пользователей с department = 'COMMERCIAL'
    const managers = await this.prisma.user.findMany({
      where: {
        role: {
          department: 'COMMERCIAL',
          shortName: ['ADMIN', 'G', 'KD'].includes(user.role.shortName)
            ? {}
            : { in: ['MOP'] },
        },
        workSpaceId: workspacesSearch,
        // deletedAt: null,
      },
      include: {
        role: true,
        managerReports: {
          where: {
            period,
          },
        },
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
              saleDate: {
                startsWith: period,
              },
              reservation: false,
              status: { not: 'Возврат' },
              deletedAt: null,
            },
          },
          include: {
            deal: {
              include: {
                payments: {
                  where: {
                    date: {
                      startsWith: period,
                    },
                  },
                }, // Подтягиваем платежи для каждой сделки
                dops: {
                  where: {
                    saleDate: {
                      startsWith: period,
                    },
                  },
                },
                dealers: true,
                client: true,
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
            deal: {
              saleDate: { startsWith: period },
            },
          },
          include: {
            deal: {
              include: {
                payments: {
                  where: {
                    date: {
                      startsWith: period,
                    },
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
            saleDate: {
              startsWith: period,
            },
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
            saleDate: {
              startsWith: period,
            },
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

        //заявки
        const managerDeals = dealUsers.filter((du) => du.idx === 0).length;
        const calls = m.managerReports.reduce((a, b) => a + b.calls, 0);
        const maketsDayToDay = m.managerReports.reduce(
          (a, b) => a + b.maketsDayToDay,
          0,
        );
        const makets = m.managerReports.reduce((a, b) => a + b.makets, 0);
        const conversionMaket = calls
          ? +((makets / calls) * 100).toFixed(2)
          : 0;
        const conversionMaketDayToDay = calls
          ? +((maketsDayToDay / calls) * 100).toFixed(2)
          : 0;
        const conversionToSale = makets
          ? +((managerDeals / makets) * 100).toFixed(2)
          : 0;

        const dealsDayToDayCount = dealUsers.filter(
          (d) => d.deal.saleDate === d.deal.client.firstContact,
        ).length;

        return {
          id: m.id,
          manager: m.fullName,
          plan,
          dealsSales,
          totalSales,
          dealsAmount: managerDeals,
          salesToPlan,
          remainder,
          dopsSales,
          dopsToSales,
          dopsAmount,
          dealsWithoutDesigners: dealsWithoutDesigners.length,
          dealsDayToDayCount,
          dealsSalesWithoutDesigners,
          averageBill,
          receivedPayments: +totalRevenue.toFixed(),
          workSpaceId: m.workSpaceId,
          groupId: m.groupId,
          managerId: m.id,
          period,
          calls,
          makets,
          maketsDayToDay,
          conversionMaket,
          conversionMaketDayToDay,
          conversionToSale,
          fired: m.deletedAt ? true : false,
        };
      }),
    ).then((data) => {
      return data.filter((d) => d.totalSales > 0 || d.fired === false);
    });

    return result;
  }

  // satistics
  async getStatistics(user: UserDto, period: string) {
    const workspacesSearch =
      user.role.department === 'administration' || user.role.shortName === 'KD'
        ? { gt: 0 }
        : user.workSpaceId;

    const allWorkspaces = await this.prisma.workSpace.findMany({
      where: {
        deletedAt: null,
        department: 'COMMERCIAL',
        title: {
          in: ['B2B', 'ВК'],
        },
        id: workspacesSearch,
      },
      include: {
        deals: {
          where: {
            saleDate: {
              startsWith: period,
            },
            reservation: false,
            deletedAt: null,
          },
          include: {
            payments: true,
            dealers: {
              include: {
                user: true,
              },
            },
          },
        },
        // payments: {
        //   where: {
        //     date: {
        //       startsWith: period,
        //     },
        //   },
        // },
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
                saleDate: {
                  startsWith: period,
                },
                deal: {
                  reservation: false,
                  status: { not: 'Возврат' },
                },
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
        reports: {
          where: {
            date: {
              startsWith: period,
            },
          },
        },
        adExpenses: {
          where: {
            date: {
              startsWith: period,
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
      callsChartData: [
        { name: '01', ['ВК']: 0, ['B2B']: 0 },
        { name: '02', ['ВК']: 0, ['B2B']: 0 },
        { name: '03', ['ВК']: 0, ['B2B']: 0 },
        { name: '04', ['ВК']: 0, ['B2B']: 0 },
        { name: '05', ['ВК']: 0, ['B2B']: 0 },
        { name: '06', ['ВК']: 0, ['B2B']: 0 },
        { name: '07', ['ВК']: 0, ['B2B']: 0 },
        { name: '08', ['ВК']: 0, ['B2B']: 0 },
        { name: '09', ['ВК']: 0, ['B2B']: 0 },
        { name: '10', ['ВК']: 0, ['B2B']: 0 },
        { name: '11', ['ВК']: 0, ['B2B']: 0 },
        { name: '12', ['ВК']: 0, ['B2B']: 0 },
        { name: '13', ['ВК']: 0, ['B2B']: 0 },
        { name: '14', ['ВК']: 0, ['B2B']: 0 },
        { name: '15', ['ВК']: 0, ['B2B']: 0 },
        { name: '16', ['ВК']: 0, ['B2B']: 0 },
        { name: '17', ['ВК']: 0, ['B2B']: 0 },
        { name: '18', ['ВК']: 0, ['B2B']: 0 },
        { name: '19', ['ВК']: 0, ['B2B']: 0 },
        { name: '20', ['ВК']: 0, ['B2B']: 0 },
        { name: '21', ['ВК']: 0, ['B2B']: 0 },
        { name: '22', ['ВК']: 0, ['B2B']: 0 },
        { name: '23', ['ВК']: 0, ['B2B']: 0 },
        { name: '24', ['ВК']: 0, ['B2B']: 0 },
        { name: '25', ['ВК']: 0, ['B2B']: 0 },
        { name: '26', ['ВК']: 0, ['B2B']: 0 },
        { name: '27', ['ВК']: 0, ['B2B']: 0 },
        { name: '28', ['ВК']: 0, ['B2B']: 0 },
        { name: '29', ['ВК']: 0, ['B2B']: 0 },
        { name: '30', ['ВК']: 0, ['B2B']: 0 },
        { name: '31', ['ВК']: 0, ['B2B']: 0 },
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
          amount: 0,
        },
        {
          name: 'Заготовка из базы',
          sales: 0,
          amount: 0,
        },
        {
          name: 'Рекламный',
          sales: 0,
          amount: 0,
        },
        {
          name: 'Визуализатор',
          sales: 0,
          amount: 0,
        },
        {
          name: 'Из рассылки',
          sales: 0,
          amount: 0,
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
        callsChartData: [
          { name: '01', ['ВК']: 0, ['B2B']: 0 },
          { name: '02', ['ВК']: 0, ['B2B']: 0 },
          { name: '03', ['ВК']: 0, ['B2B']: 0 },
          { name: '04', ['ВК']: 0, ['B2B']: 0 },
          { name: '05', ['ВК']: 0, ['B2B']: 0 },
          { name: '06', ['ВК']: 0, ['B2B']: 0 },
          { name: '07', ['ВК']: 0, ['B2B']: 0 },
          { name: '08', ['ВК']: 0, ['B2B']: 0 },
          { name: '09', ['ВК']: 0, ['B2B']: 0 },
          { name: '10', ['ВК']: 0, ['B2B']: 0 },
          { name: '11', ['ВК']: 0, ['B2B']: 0 },
          { name: '12', ['ВК']: 0, ['B2B']: 0 },
          { name: '13', ['ВК']: 0, ['B2B']: 0 },
          { name: '14', ['ВК']: 0, ['B2B']: 0 },
          { name: '15', ['ВК']: 0, ['B2B']: 0 },
          { name: '16', ['ВК']: 0, ['B2B']: 0 },
          { name: '17', ['ВК']: 0, ['B2B']: 0 },
          { name: '18', ['ВК']: 0, ['B2B']: 0 },
          { name: '19', ['ВК']: 0, ['B2B']: 0 },
          { name: '20', ['ВК']: 0, ['B2B']: 0 },
          { name: '21', ['ВК']: 0, ['B2B']: 0 },
          { name: '22', ['ВК']: 0, ['B2B']: 0 },
          { name: '23', ['ВК']: 0, ['B2B']: 0 },
          { name: '24', ['ВК']: 0, ['B2B']: 0 },
          { name: '25', ['ВК']: 0, ['B2B']: 0 },
          { name: '26', ['ВК']: 0, ['B2B']: 0 },
          { name: '27', ['ВК']: 0, ['B2B']: 0 },
          { name: '28', ['ВК']: 0, ['B2B']: 0 },
          { name: '29', ['ВК']: 0, ['B2B']: 0 },
          { name: '30', ['ВК']: 0, ['B2B']: 0 },
          { name: '31', ['ВК']: 0, ['B2B']: 0 },
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
            amount: 0,
          },
          {
            name: 'Заготовка из базы',
            sales: 0,
            amount: 0,
          },
          {
            name: 'Рекламный',
            sales: 0,
            amount: 0,
          },
          {
            name: 'Визуализатор',
            sales: 0,
            amount: 0,
          },
          {
            name: 'Из рассылки',
            sales: 0,
            amount: 0,
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

        deal.dealers.map((dealer) => {
          const userIndex = data.users.findIndex((u) => u.id === dealer.userId);
          data.users[userIndex].sales += dealer.price;
        });
        // console.log(deal.maketType);
        const maketIndex = data.maketsSales.findIndex(
          (m) => m.name === deal.maketType,
        );
        data.maketsSales[maketIndex].sales += deal.price;
        data.maketsSales[maketIndex].amount += 1;

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

      // Считаем заявки
      w.reports.map((r) => {
        const day = r.date.slice(8, 10);
        const index = data.callsChartData.findIndex((d) => d.name === day);
        // console.log(data.callsChartData[index]['ВК']);
        data.callsChartData[index][w.title] += r.calls;
        fullData.callsChartData[index][w.title] += r.calls;
      });

      w.dops.map((dop) => {
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

      w.users.map((user) => {
        if (user.role.shortName === 'DO') {
          // console.log(user);
          data.plan = user.managersPlans[0]?.plan || 0;
        }
      });

      // w.payments.map((payment) => {
      //   data.receivedPayments += payment.price;
      //   fullData.receivedPayments += payment.price;
      // });

      data.receivedPayments += w.deals
        .flatMap((d) => d.payments)
        .reduce((a, b) => a + b.price, 0);

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
        m.amount += data.maketsSales[maketIndex].amount;
        return m;
      });

      data.users = data.users.sort((a, b) => b.sales - a.sales).slice(0, 10);
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
        users: topManagers.sort((a, b) => b.sales - a.sales).slice(0, 10),
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
      user.role.department === 'administration' || user.role.shortName === 'KD'
        ? { gt: 0 }
        : user.workSpaceId;

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
