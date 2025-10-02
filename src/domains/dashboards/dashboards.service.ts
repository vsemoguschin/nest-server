import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserDto } from '../users/dto/user.dto';
import { group } from 'node:console';

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
  temp: number;
  tempToPlan: number;
  dealsAmount: number;
  dopSales: number;
  dopsAmount: number;
  salesToPlan: number;
  remainder: number;
  dopsToSales: number;
  averageBill: number;
  receivedPayments: number;
  calls: number;
  adExpensesPrice: number;
  callCost: number;
  drr: number;
  dealsWithoutDesigners: number;
  dealsSalesWithoutDesigners: number;
  makets: number;
  maketsDayToDay: number;
  redirectToMSG: number;
  conversionDealsToCalls: number;
  conversionMaketsToCalls: number;
  conversionMaketsToSales: number;
  conversionMaketsDayToDayToCalls: number;
  dealsDayToDay: number;
  dealsDayToDayPrice: number;
  sendDeliveries: number;
  freeDeliveries: number;
  freeDeliveriesPrice: number;
  sendDeliveriesPrice: number;
  deliveredDeliveriesPrice: number;
  deliveredDeliveries: number;
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
    let where: Partial<{
      department: string;
      deletedAt: null;
      id: { gt: number } | number;
    }> = {
      deletedAt: null,
    };
    if (!['ADMIN', 'G', 'KD'].includes(user.role.shortName)) {
      where = { id: user.workSpaceId, deletedAt: null };
    }
    if (['DP'].includes(user.role.shortName)) {
      where = { department: 'PRODUCTION', deletedAt: null };
    }
    const workspaces = await this.prisma.workSpace.findMany({
      where,
      include: {
        groups: {
          where: {
            deletedAt: null,
          },
          include: {
            users: {
              where: { deletedAt: null },
              orderBy: { fullName: 'asc' },
              select: {
                fullName: true,
                role: true,
                tg: true,
                id: true,
                email: true,
                tg_id: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: {
            title: 'asc',
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

    if (
      !['ADMIN', 'G', 'KD', 'ROV', 'MOV', 'MARKETER', 'LOGIST'].includes(
        user.role.shortName,
      )
    ) {
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
      user.role.department === 'administration' ||
      user.role.shortName === 'KD' ||
      user.id === 21
        ? { gt: 0 }
        : user.workSpaceId;

    const groupsSearch = ['MOP', 'MOV'].includes(user.role.shortName)
      ? user.groupId
      : { gt: 0 };

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
                in: ['MOP', 'MOV', 'DO'],
              },
            },
            groupId: groupsSearch,
          },
          include: {
            group: true,
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
                    payments: {
                      where: {
                        // date: {
                        //   startsWith: period,
                        // },
                      },
                    },
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
                  // id: {
                  //   gt: 1440,  lte: 14099
                  // },
                },
              },
              include: {
                deal: {
                  select: {
                    title: true,
                    price: true,
                    payments: {
                      // where: {
                      //   date: {
                      //     startsWith: period,
                      //   },
                      // },
                    },
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
            salaryCorrections: {
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
              // id: {
              //   gt: 1440,  lte: 14099
              // },
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

    // console.log(
    //   'workSpacesPayments',
    //   workSpaces.flatMap((w) => w.payments).reduce((a, b) => a + b.price, 0),
    // );

    // все платежи за сделки за период прошлый
    const allPaymentsPrevDeals = workSpaces
      .flatMap((w) => w.payments)
      .filter((p) => !p.deal.saleDate.includes(period));

    // console.log('allPaymentsPrevDops', allPaymentsPrevDops);

    // периоды сделок(уникальные)
    const prevPeriodsDeals = Array.from(
      new Set(allPaymentsPrevDeals.map((p) => p.deal.saleDate.slice(0, 7))),
    ).filter((p) => p < period); //['2025-04', '2025-03']
    // периоды допов(уникальные)
    const prevPeriodsDops = Array.from(
      new Set(
        allPaymentsPrevDeals
          .flatMap((p) => p.deal.dops)
          .map((d) => d.saleDate.slice(0, 7)),
      ),
    ).filter((p) => p < period); //['2025-04', '2025-03']

    //  массив уникальных id пользователей чьи сделки в платежах
    const usersIds = Array.from(
      new Set(
        allPaymentsPrevDeals.flatMap((p) =>
          p.deal.dealers.map((d) => d.userId),
        ),
      ),
    );

    const prevPeriods = Array.from(
      new Set([...prevPeriodsDeals, ...prevPeriodsDops]),
    );

    // console.log(prevPeriods);

    // по всем периодам ищем продажи пользователей по id и находим % в зп
    const res = await Promise.all(
      prevPeriods.map(async (per) => {
        // console.log(per);
        // ищем все сделки и допы этого периода
        // для пользователя чтобы найти процент в зп
        const userSales = await this.prisma.user.findMany({
          where: {
            id: {
              in: usersIds,
            },
          },
          include: {
            role: true,
            dealSales: {
              where: {
                deal: {
                  reservation: false,
                  status: { not: 'Возврат' },
                  saleDate: {
                    startsWith: per,
                  },
                },
              },
              include: {
                deal: true,
              },
            },
            dops: {
              where: {
                saleDate: {
                  startsWith: per,
                },
                deal: {
                  reservation: false,
                  status: { not: 'Возврат' },
                  // id: {
                  //   gt: 1440,  lte: 14099
                  // },
                },
              },
            },
            workSpace: true,
            managerReports: {
              where: {
                date: {
                  startsWith: per,
                },
              },
            },
          },
        });
        // console.log(userSales);

        return userSales.map((m) => {
          const dealSales = m.dealSales.reduce((a, b) => a + b.price, 0);
          const dopSales = m.dops.reduce((a, b) => a + b.price, 0);
          const totalSales = dealSales + dopSales;
          let bonusPercentage = 0;
          const isIntern = m.managerReports.find((r) => r.shiftCost === 800);
          // console.log(isIntern, m.fullName);
          if (m.workSpace.title === 'B2B') {
            if (!isIntern) {
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
              } else if (totalSales < 1_100_000) {
                bonusPercentage = 0.05;
              } else if (totalSales < 1_200_000) {
                bonusPercentage = 0.05;
              } else if (totalSales < 1_350_000) {
                bonusPercentage = 0.05;
              } else if (totalSales < 1_500_000) {
                bonusPercentage = 0.05;
              } else if (totalSales < 1_700_000) {
                bonusPercentage = 0.05;
              } else if (totalSales < 2_000_000) {
                bonusPercentage = 0.05;
              } else if (totalSales >= 2_000_000) {
                bonusPercentage = 0.05;
              }
            } else {
              if (totalSales < 800_000) {
                bonusPercentage = 0.04;
              } else if (totalSales < 1_000_000) {
                bonusPercentage = 0.045;
              } else if (totalSales < 1_100_000) {
                bonusPercentage = 0.05;
              } else if (totalSales < 1_200_000) {
                bonusPercentage = 0.05;
              } else if (totalSales < 1_350_000) {
                bonusPercentage = 0.05;
              } else if (totalSales < 1_500_000) {
                bonusPercentage = 0.05;
              } else if (totalSales < 1_700_000) {
                bonusPercentage = 0.05;
              } else if (totalSales < 2_000_000) {
                bonusPercentage = 0.05;
              } else if (totalSales >= 2_000_000) {
                bonusPercentage = 0.05;
              }
            }
          }
          if (m.workSpace.title === 'ВК') {
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
            }
          }
          if (m.groupId === 19) {
            bonusPercentage = 0.07;
          }
          if (
            m.groupId === 19 &&
            m.role.shortName === 'MOV' &&
            per >= '2025-10'
          ) {
            bonusPercentage = 0;
          }

          // console.log('bonusPercentage', bonusPercentage);

          return {
            bonusPercentage,
            manager: m.fullName,
            userId: m.id,
            period: per,
            totalSales,
          };
        });
      }),
    );

    const prevPeriodDatas = res.flat();

    //id платежей
    const prevPaymentsDealsIds = Array.from(
      new Set(allPaymentsPrevDeals.map((p) => p.deal.id)),
    );
    //сделки по платежам за пред сделки
    const prevPaymentsDeals = await this.prisma.deal.findMany({
      where: {
        id: {
          in: prevPaymentsDealsIds,
        },
        reservation: false,
        status: { not: 'Возврат' },
      },
      include: {
        payments: true,
        dealers: true,
        dops: {
          include: {
            user: {
              include: {
                role: true,
              },
            },
          },
        },
        workSpace: true,
      },
    });
    // console.log(prevPaymentsDeals);

    const datas = prevPaymentsDeals.map((deal) => {
      const {
        title,
        saleDate,
        dealers,
        payments,
        price: dealPrice,
        dops,
      } = deal;

      //платежи до выбраного периода
      const dealPaymentsLastPeriod = payments
        .filter((p) => p.date.slice(0, 7) < period)
        .reduce((a, b) => a + b.price, 0);
      //платежи за выбранный период
      const dealPaymentsThisPeriod = payments
        .filter((p) => p.date.slice(0, 7) === period)
        .reduce((a, b) => a + b.price, 0);

      let dealPaid = 0;
      let dopPaid = 0;
      // елси сделка оплачена, остаток в допы
      if (dealPrice < dealPaymentsLastPeriod + dealPaymentsThisPeriod) {
        dopPaid = dealPaymentsLastPeriod + dealPaymentsThisPeriod - dealPrice;
        if (dealPrice < dealPaymentsLastPeriod) {
          dopPaid = dealPaymentsThisPeriod;
        }
        dealPaid =
          dealPrice - dealPaymentsLastPeriod < 0
            ? 0
            : dealPrice - dealPaymentsLastPeriod;
      }
      //елси сделка неоплачена, остаток в сделку
      if (dealPrice >= dealPaymentsLastPeriod + dealPaymentsThisPeriod) {
        dealPaid = dealPaymentsThisPeriod;
        dopPaid = 0;
      }
      //2_493_760

      const dealDopsPrice = dops.reduce((a, b) => a + b.price, 0);
      const dopsInfo = dops
        .map((dop) => {
          // console.log(dop);
          const dealerPart = dop.price / dealDopsPrice;
          let bonusPercentage = 0;
          if (deal.workSpace.title === 'B2B') {
            bonusPercentage = 0.1;
          } else {
            bonusPercentage =
              prevPeriodDatas.find(
                (p) =>
                  p.period === dop.saleDate.slice(0, 7) &&
                  p.userId === dop.userId,
              )?.bonusPercentage || 0;
          }
          if (dop.groupId === 19) {
            bonusPercentage = 0.07;
          }
          if (
            dop.groupId === 19 &&
            dop.user.role.shortName === 'MOV' &&
            dop.saleDate.slice(0, 7) >= '2025-10'
          ) {
            bonusPercentage = 0.05;
          }
          const paid = +(dopPaid * dealerPart).toFixed(2);
          return {
            title: dop.type,
            dopPrice: dop.price,
            saleDate: dop.saleDate,
            dealTitle: title.slice(0, 15),
            dealId: deal.id,
            paid,
            userId: dop.userId,
            bonusPercentage,
            toSalary: paid * bonusPercentage,
          };
        })
        .filter((d) => d.toSalary != 0);
      // .filter((d) => prevPeriods.includes(d.saleDate.slice(0, 7)));

      const dealInfo = dealers.map((dealer) => {
        const dealerPrice = dealer.price;
        const dealerPart = dealerPrice / dealPrice;
        // console.log(prevPeriodDatas.find(
        //   (p) =>
        //     p.period === deal.saleDate.slice(0, 7) &&
        //     p.userId === dealer.userId,
        // )?.bonusPercentage);
        // console.log({userId: dealer.userId, period: deal.saleDate.slice(0, 7)});

        const bonusPercentage =
          prevPeriodDatas.find(
            (p) =>
              p.period === deal.saleDate.slice(0, 7) &&
              p.userId === dealer.userId,
          )?.bonusPercentage || 0;
        const paid = +(dealPaid * dealerPart).toFixed(2);
        return {
          id: deal.id,
          title: title.slice(0, 15),
          saleDate,
          dealPrice,
          dealerPrice,
          dealerPart: +(dealerPart * 100).toFixed(),
          paid,
          usersId: dealer.userId,
          bonusPercentage,
          toSalary: paid * bonusPercentage,
        };
      });

      return {
        dealId: deal.id,
        // title,
        // saleDate,
        // dealPrice,
        dopsPrice: dops.reduce((a, b) => a + b.price, 0),
        dopsIds: dops.map((d) => d.id),
        // dealPaymentsLastPeriod,
        // dealPaymentsThisPeriod,
        dealPaid,
        dopPaid,
        dealInfo: dealPaid ? dealInfo : [],
        dopsInfo: dopPaid ? dopsInfo : [],
      };
    });

    // console.log(datas[0]);

    // console.log(workSpaces);
    const ropPlan = await this.prisma.managersPlan.findMany({
      where: {
        period,
        user: {
          role: {
            shortName: 'DO',
          },
          fullName: { in: ['Юлия Куштанова', 'Сергей Иванов'] },
        },
      },
      include: {
        user: true,
      },
    });

    const vkTop: {
      topTotalSales: { user: string; sales: number }[];
      topDopSales: { user: string; sales: number }[];
      topDimmerSales: { user: string; sales: number }[];
      topSalesWithoutDesigners: { user: string; sales: number }[];
      topConversionDayToDay: { user: string; sales: number }[];
    } = {
      topTotalSales: [],
      topDopSales: [],
      topDimmerSales: [],
      topSalesWithoutDesigners: [],
      topConversionDayToDay: [],
    };
    const b2bTop: { user: string; sales: number; category: string }[] = [];

    const wdata = workSpaces.flatMap((w) => {
      const adExpenses = w.adExpenses.reduce((a, b) => a + b.price, 0);
      const calls = w.users
        .flatMap((u) => u.managerReports)
        .reduce((a, b) => a + b.calls, 0);
      const callCost = calls ? adExpenses / calls : 0;
      const workSpacePayments = w.payments;
      let dealsPayments = 0;

      // const dealPrice = w.deals.reduce((a, b) => a + b.price, 0);
      // console.log(dealPrice, ` сделки пространства ${w.title}`);

      let isOverRopPlan = false;
      const ropPlanValue =
        ropPlan.find((p) => p.user.workSpaceId === w.id)?.plan || 0;
      const workSpaceDealSales = w.deals.reduce((acc, d) => acc + d.price, 0);
      const workSpaceDopSales = w.dops.reduce((acc, d) => acc + d.price, 0);
      const workSpaceTotalSales = workSpaceDealSales + workSpaceDopSales;

      if (workSpaceTotalSales > ropPlanValue && ropPlanValue > 0) {
        isOverRopPlan = true;
      }

      const ropData = () => {
        const paymentsThisPeriod = w.payments.filter((p) =>
          p.date.includes(period),
        );
        const paymentsLastPeriod = w.payments.filter((p) =>
          p.date.includes(period),
        );
        return {
          isOverRopPlan,
          salaryThisPeriod: isOverRopPlan
            ? 50000 + paymentsThisPeriod.reduce((a, b) => a + b.price, 0) * 0.01
            : 50000 +
              paymentsThisPeriod.reduce((a, b) => a + b.price, 0) * 0.005,
        };
      };

      const userData = w.users
        .map((m) => {
          // console.log(m.fullName, m.isIntern);
          let totalSalary = 0;
          const pays = m.salaryPays.reduce((a, b) => a + b.price, 0) || 0;
          const salaryCorrections = m.salaryCorrections;

          // totalSalary += salaryCorrectionPlus;
          // totalSalary -= salaryCorrectionMinus;
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
            const pa = dealPayments.filter((p) => p.date.slice(0, 7) <= period);
            // console.log(pa.map((p) => p.date.slice(0, 7)));
            const payAmount = dealPayments
              .filter((p) => p.date.slice(0, 7) <= period)
              .reduce((a, b) => a + (b.price || 0), 0);
            const paid =
              payAmount >= dealPrice
                ? dealPrice * dealerPart
                : payAmount * dealerPart;
            // dealsPayments += paid;
            return {
              id: d.deal.id,
              title: isWithoutDesigner
                ? // ? title.slice(0, 15) + '(БЕЗ ДИЗА)'
                  title.slice(0, 15)
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

            const dealPayments = d.deal.payments
              .filter((p) => p.date.slice(0, 7) <= period)
              .reduce((a, b) => a + b.price, 0);
            const dealDopsPrice = d.deal.dops.reduce((a, b) => a + b.price, 0);
            const dealDopsPaidPrice =
              dealPayments > dealPrice ? dealPayments - dealPrice : 0;
            const dealerPart = dopPrice / dealDopsPrice;
            const dealerPrice = dealDopsPaidPrice * dealerPart;
            // dealsPayments += dealerPrice;
            return {
              title,
              dopPrice,
              saleDate,
              dealTitle: dealTitle.slice(0, 15),
              dealId: d.dealId,
              paid: +dealerPrice.toFixed(2),
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
          const isIntern = m.managerReports.find((r) => r.shiftCost === 800);
          if (w.title === 'B2B') {
            if (!isIntern) {
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
            } else {
              if (totalSales > 600_000) {
                bonus += 2000;
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
            }
            dopPays = dopsInfo.reduce((a, b) => a + b.paid, 0) * 0.1;
            dealPays =
              dealsInfo.reduce((a, b) => a + b.paid, 0) * bonusPercentage;
          }
          if (w.title === 'ВК') {
            if (!isIntern) {
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
            } else {
              // if (m.id === 136) {
              //   console.log(m.fullName, m.managerReports);
              // }

              if (totalSales < 250_000) {
                bonusPercentage = 0.03;
              } else if (totalSales >= 250_000 && totalSales < 450_000) {
                bonusPercentage = 0.05;
              } else if (totalSales >= 450_000 && totalSales < 550_000) {
                bonusPercentage = 0.06;
              } else if (totalSales >= 550_000 && totalSales < 850_000) {
                bonusPercentage = 0.07;
              } else if (totalSales >= 850_000) {
                bonusPercentage = 0.07;
                totalSalary += 10_000; // Премия за достижение 850k
                bonus += 10_000; // Премия за достижение 850k
              }
            }
            dopPays =
              +dopsInfo.reduce((a, b) => a + b.paid, 0) * bonusPercentage;
            dealPays =
              dealsInfo.reduce((a, b) => a + b.paid, 0) * bonusPercentage;
            const workSpacePlanBonus = isOverRopPlan ? 3000 : 0;
            totalSalary += workSpacePlanBonus;
            bonus += workSpacePlanBonus;
          }
          if (m.groupId === 19) {
            bonusPercentage = 0.07;
          }
          if (
            m.groupId === 19 &&
            m.role.shortName === 'MOV' &&
            period >= '2025-10'
          ) {
            bonusPercentage = 0;
          }

          totalSalary += dealPays + dopPays;
          const rem = +(totalSalary - pays).toFixed(2);

          const dealsInfoPrevMounth = datas
            .flatMap((d) => d.dealInfo)
            .filter((d) => d.usersId === m.id);
          // console.log(dealsInfoPrevMounth);
          dealsPayments += dealsInfoPrevMounth.reduce((a, b) => a + b.paid, 0);
          dealsPayments += dealsInfo.reduce((a, b) => a + b.paid, 0);
          const dopsInfoPrevMounth = datas
            .flatMap((d) => d.dopsInfo)
            .filter((d) => d.userId === m.id);
          dealsPayments += dopsInfoPrevMounth.reduce((a, b) => a + b.paid, 0);
          dealsPayments += dopsInfo.reduce((a, b) => a + b.paid, 0);

          const prevPeriodsDealsPays = dealsInfoPrevMounth.reduce(
            (a, b) => a + b.toSalary,
            0,
          );
          const prevPeriodsDopsPays = dopsInfoPrevMounth.reduce(
            (a, b) => a + b.toSalary,
            0,
          );

          return {
            //основное
            fullName: m.fullName,
            role: m.role.fullName,
            id: m.id,
            workSpace: w.title,
            group: m.group.title,
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
            salaryPays: m.salaryPays,
            // rem,
            dopPays: +dopPays.toFixed(2),
            dealPays: +dealPays.toFixed(2),
            bonusPercentage,
            bonus,
            shiftBonus: shiftBonus.toFixed(2),
            shift,
            salaryCorrections,
            prevPeriodsDealsPays,
            prevPeriodsDopsPays,
            // подробнее
            dealsInfo,
            dealsInfoPrevMounth,
            dopsInfoPrevMounth,
            dopsInfo,
            topBonus: 0,
            fired: m.deletedAt ? true : false,
            isIntern: m.isIntern,

            conversionDayToDay,
            dimmerSales,
            conversion,
            groupId: m.groupId,
          };
        })
        .filter(
          (u) =>
            u.totalSales ||
            !u.fired ||
            u.prevPeriodsDealsPays ||
            u.prevPeriodsDopsPays,
        );
      // console.log('dealspays', dealsPayments);
      // console.log(
      //   'ws: ' + w.title,
      //   workSpacePayments.reduce((a, b) => a + b.price, 0),
      // );
      // console.log(
      //   'разница',
      //   dealsPayments - workSpacePayments.reduce((a, b) => a + b.price, 0),
      // );
      // console.log('--------------');

      // Определение топов
      const topTotalSales = [...userData]
        .filter((u) => u.workSpace === 'ВК' && u.groupId !== 19)
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            if (user.shift > 12) {
              user.topBonus += (-i + 3) * 1000;
              user.totalSalary += (-i + 3) * 1000;
            }
            vkTop.topTotalSales.push({
              user: u.fullName,
              sales: u.totalSales,
            });
          }
        });

      const topDopSales = [...userData]
        .filter((u) => u.workSpace === 'ВК' && u.groupId !== 19)
        .sort((a, b) => b.dopSales - a.dopSales)
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            if (user.shift > 12) {
              user.topBonus += (-i + 3) * 1000;
              user.totalSalary += (-i + 3) * 1000;
            }
            vkTop.topDopSales.push({
              user: u.fullName,
              sales: u.dopSales,
            });
          }
        });
      const topDimmerSales = [...userData]
        .filter((u) => u.workSpace === 'ВК' && u.groupId !== 19)
        .sort((a, b) => b.dimmerSales - a.dimmerSales)
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            if (user.shift > 12) {
              user.topBonus += (-i + 3) * 1000;
              user.totalSalary += (-i + 3) * 1000;
            }
            vkTop.topDimmerSales.push({
              user: u.fullName,
              sales: u.dimmerSales,
            });
          }
        });
      const topSalesWithoutDesigners = [...userData]
        .filter((u) => u.workSpace === 'ВК' && u.groupId !== 19)
        .sort(
          (a, b) => b.dealsSalesWithoutDesigners - a.dealsSalesWithoutDesigners,
        )
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            if (user.shift > 12) {
              user.topBonus += (-i + 3) * 1000;
              user.totalSalary += (-i + 3) * 1000;
            }
            vkTop.topSalesWithoutDesigners.push({
              user: u.fullName,
              sales: u.dealsSalesWithoutDesigners,
            });
          }
        });
      const topConversionDayToDay = [...userData]
        .filter((u) => u.workSpace === 'ВК' && u.groupId !== 19)
        .sort((a, b) => b.conversionDayToDay - a.conversionDayToDay)
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            if (user.shift > 12) {
              user.topBonus += (-i + 3) * 1000;
              user.totalSalary += (-i + 3) * 1000;
            }
            vkTop.topConversionDayToDay.push({
              user: u.fullName,
              sales: u.conversionDayToDay,
            });
          }
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
            if (user.shift > 12) {
              u.topBonus += 2000;
              u.totalSalary += 2000;
            }
            b2bTop.push({
              user: u.fullName,
              sales: u.dealSales,
              category: 'Топ суммы заказов',
            });
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
            if (user.shift > 12) {
              u.topBonus += 2000;
              u.totalSalary += 2000;
            }
            b2bTop.push({
              user: u.fullName,
              sales: u.dopSales,
              category: 'Топ сумма допов',
            });
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
            if (user.shift > 12) {
              u.topBonus += 2000;
              u.totalSalary += 2000;
            }
            b2bTop.push({
              user: u.fullName,
              sales: u.averageBill,
              category: 'Топ средний чек',
            });
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
            if (user.shift > 12) {
              u.topBonus += 2000;
              u.totalSalary += 2000;
            }
            b2bTop.push({
              user: u.fullName,
              sales: u.conversion,
              category: 'Топ конверсия',
            });
          }
        });

      return { userData, ropData: ropData() };
    });

    return {
      users: wdata.flatMap((wd) => wd.userData),
      vkTop,
      b2bTop: user.id === 21 ? [] : b2bTop,
      ropData: wdata.flatMap((d) => d.ropData),
    };
  }

  // satistics
  async getStatisticsByGroups(user: UserDto, period: string) {
    const workspacesSearch =
      user.role.department === 'administration' || user.role.shortName === 'KD'
        ? { gt: 0 }
        : user.workSpaceId;

    function getDaysInMonth(year: number, month: number): number {
      return new Date(year, month, 0).getDate();
    }

    // Получаем год и месяц из period
    const [year, month] = period.split('-').map(Number);

    // Генерируем все даты для месяца
    const daysInMonth1 = new Date(year, month, 0).getDate();
    const allDates = Array.from({ length: daysInMonth1 }, (_, i) => {
      const day = (i + 1).toString().padStart(2, '0');
      return `${year}-${month.toString().padStart(2, '0')}-${day}`;
    });

    // console.log(daysInMonth1, allDates);

    //допы этого месяца за сделки прошлого  месяца
    // const lastDops = await this.prisma.dop.findMany({
    //   where: {
    //     deal: {
    //       saleDate: {
    //         startsWith: '2025-04',
    //       },
    //       reservation: false,
    //       status: {
    //         not: 'Возврат',
    //       },
    //     },
    //     saleDate: {
    //       startsWith: period,
    //     },
    //   },
    // });
    // console.log(
    //   'dops',
    //   lastDops.reduce((acc, dop) => acc + dop.price, 0),
    // );

    const allWorkspaces = await this.prisma.workSpace.findMany({
      where: {
        deletedAt: null,
        department: 'COMMERCIAL',
        title: {
          in: ['B2B', 'ВК', 'Ведение'],
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
            client: true,
            deliveries: true,
            dops: {
              where: {
                saleDate: {
                  startsWith: period,
                },
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
        deliveries: {
          where: {
            date: {
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
              },
            },
          },
        },
      },
    });

    const sendDeliveries = await this.prisma.delivery.findMany({
      where: {
        date: {
          startsWith: period,
        },
        status: 'Отправлена',
        deal: {
          status: { not: 'Возврат' },
          reservation: false,
        },
      },
      include: {
        deal: {
          include: {
            dops: true,
          },
        },
      },
    });
    const deliveredDeliveries = await this.prisma.delivery.findMany({
      where: {
        deliveredDate: {
          startsWith: period,
        },
        status: 'Вручена',
        deal: {
          status: { not: 'Возврат' },
          reservation: false,
        },
      },
      include: {
        deal: {
          include: {
            dops: true,
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
      temp: 0,
      tempToPlan: 0,
      dealsAmount: 0,
      dopSales: 0,
      dopsAmount: 0,
      salesToPlan: 0,
      remainder: 0,
      dopsToSales: 0,
      averageBill: 0,
      receivedPayments: 0,
      calls: 0,
      adExpensesPrice: 0,
      callCost: 0,
      drr: 0,
      dealsWithoutDesigners: 0,
      dealsSalesWithoutDesigners: 0,
      makets: 0,
      maketsDayToDay: 0,
      redirectToMSG: 0,
      conversionDealsToCalls: 0,
      conversionMaketsToCalls: 0,
      conversionMaketsToSales: 0,
      conversionMaketsDayToDayToCalls: 0,
      dealsDayToDay: 0,
      dealsDayToDayPrice: 0,
      sendDeliveries: 0,
      freeDeliveries: 0,
      freeDeliveriesPrice: 0,
      sendDeliveriesPrice: 0,
      deliveredDeliveriesPrice: 0,
      deliveredDeliveries: 0,
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
        {
          name: '',
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
        temp: 0,
        tempToPlan: 0,
        dealsAmount: w.deals.length,
        dopSales: 0,
        dopsAmount: 0,
        salesToPlan: 0,
        remainder: 0,
        dopsToSales: 0,
        averageBill: 0,
        receivedPayments: 0,
        calls: 0,
        adExpensesPrice: 0,
        callCost: 0,
        drr: 0,
        dealsWithoutDesigners: 0,
        dealsSalesWithoutDesigners: 0,
        makets: 0,
        maketsDayToDay: 0,
        redirectToMSG: 0,
        conversionDealsToCalls: 0,
        conversionMaketsToCalls: 0,
        conversionMaketsToSales: 0,
        conversionMaketsDayToDayToCalls: 0,
        dealsDayToDay: 0,
        dealsDayToDayPrice: 0,
        sendDeliveries: 0,
        freeDeliveries: 0,
        freeDeliveriesPrice: 0,
        sendDeliveriesPrice: 0,
        deliveredDeliveriesPrice: 0,
        deliveredDeliveries: 0,
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
          {
            name: '',
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
        const dopsPrice = deal.dops.reduce((a, b) => a + b.price, 0);
        if (
          [
            'Заготовка из базы',
            'Рекламный',
            'Из рассылки',
            'Визуализатор',
          ].includes(deal.maketType)
        ) {
          data.dealsWithoutDesigners += 1;
          data.dealsSalesWithoutDesigners += deal.price + dopsPrice;
          fullData.dealsWithoutDesigners += 1;
          fullData.dealsSalesWithoutDesigners += deal.price + dopsPrice;
        }
        if (deal.saleDate === deal.client.firstContact) {
          data.dealsDayToDay += 1;
          data.dealsDayToDayPrice += deal.price + dopsPrice;
          fullData.dealsDayToDay += 1;
          fullData.dealsDayToDayPrice += deal.price + dopsPrice;
        }

        deal.dealers.map((dealer) => {
          const userIndex = data.users.findIndex((u) => u.id === dealer.userId);
          // console.log(dealer.user, data.users[userIndex]);
          data.users[userIndex].sales += dealer.price;
        });
        // console.log(deal.maketType);
        const maketIndex = data.maketsSales.findIndex(
          (m) => m.name === deal.maketType,
        );
        data.maketsSales[maketIndex].sales += deal.price + dopsPrice;
        data.maketsSales[maketIndex].amount += 1;

        // sources
        if (!data.sources.find((s) => s.name === deal.source)) {
          data.sources.push({
            name: deal.source,
            sales: deal.price + dopsPrice,
          });
        } else {
          const sourceIndex = data.sources.findIndex(
            (s) => s.name === deal.source,
          );
          data.sources[sourceIndex].sales += deal.price + dopsPrice;
        }
        if (!fullData.sources.find((s) => s.name === deal.source)) {
          fullData.sources.push({
            name: deal.source,
            sales: deal.price + dopsPrice,
          });
        } else {
          const sourceIndex = fullData.sources.findIndex(
            (s) => s.name === deal.source,
          );
          fullData.sources[sourceIndex].sales += deal.price + dopsPrice;
        }

        //adtags
        if (!data.adTags.find((s) => s.name === deal.adTag)) {
          data.adTags.push({ name: deal.adTag, sales: deal.price + dopsPrice });
        } else {
          const adTagIndex = data.adTags.findIndex(
            (s) => s.name === deal.adTag,
          );
          data.adTags[adTagIndex].sales += deal.price + dopsPrice;
        }
        if (!fullData.adTags.find((s) => s.name === deal.adTag)) {
          fullData.adTags.push({
            name: deal.adTag,
            sales: deal.price + dopsPrice,
          });
        } else {
          const adTagIndex = fullData.adTags.findIndex(
            (s) => s.name === deal.adTag,
          );
          fullData.adTags[adTagIndex].sales += deal.price + dopsPrice;
        }

        data.sources.sort((a, b) => b.sales - a.sales);
        data.adTags.sort((a, b) => b.sales - a.sales);
        data.maketsSales.sort((a, b) => b.sales - a.sales);
      });

      // доставки
      const deliveries = w.deliveries;
      data.sendDeliveriesPrice = sendDeliveries
        .filter((d) => d.workSpaceId === w.id)
        .reduce(
          (acc, d) =>
            acc + (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
          0,
        );
      data.deliveredDeliveriesPrice = deliveredDeliveries
        .filter((d) => d.workSpaceId === w.id)
        .reduce(
          (acc, d) =>
            acc + (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
          0,
        );

      data.sendDeliveries = sendDeliveries.length;
      data.deliveredDeliveries = deliveredDeliveries.length;
      data.freeDeliveries = deliveries.filter(
        (d) => d.type === 'Бесплатно',
      ).length;
      data.freeDeliveriesPrice = deliveries
        .filter((d) => d.type === 'Бесплатно')
        .reduce((a, b) => a + b.price, 0);

      fullData.sendDeliveries += data.sendDeliveries;
      fullData.deliveredDeliveries += data.deliveredDeliveries;
      fullData.freeDeliveries += data.freeDeliveries;
      fullData.freeDeliveriesPrice += data.freeDeliveriesPrice;
      fullData.sendDeliveriesPrice += data.sendDeliveriesPrice;
      fullData.deliveredDeliveriesPrice += data.deliveredDeliveriesPrice;

      const adExpensesPrice = w.adExpenses.reduce((acc, item) => {
        return acc + item.price;
      }, 0);
      data.adExpensesPrice = adExpensesPrice;
      fullData.adExpensesPrice += adExpensesPrice;

      // Считаем заявки
      w.reports.map((r) => {
        const day = r.date.slice(8, 10);
        const index = data.callsChartData.findIndex((d) => d.name === day);
        // console.log(data.callsChartData[index]['ВК']);
        data.callsChartData[index][w.title] += r.calls;
        data.calls += r.calls;
        data.makets += r.makets;
        data.maketsDayToDay += r.maketsDayToDay;
        data.redirectToMSG += r.redirectToMSG;
        fullData.callsChartData[index][w.title] += r.calls;
        fullData.calls += r.calls;
        fullData.makets += r.makets;
        fullData.maketsDayToDay += r.maketsDayToDay;
        fullData.redirectToMSG += r.redirectToMSG;
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

      data.callCost = data.calls
        ? +(data.adExpensesPrice / data.calls).toFixed(2)
        : 0;
      // console.log(data.adExpensesPrice, 'adExpensesPrice');
      // console.log(data.totalSales, 'totalSales');
      data.drr = data.totalSales
        ? +((data.adExpensesPrice / data.totalSales) * 100).toFixed(2)
        : 0;

      data.conversionDealsToCalls = data.calls
        ? +((data.dealsAmount / data.calls) * 100).toFixed(2)
        : 0;
      data.conversionMaketsToCalls = data.calls
        ? +((data.makets / data.calls) * 100).toFixed(2)
        : 0;

      data.conversionMaketsToSales = data.makets
        ? +((data.dealsAmount / data.makets) * 100).toFixed(2)
        : 0;
      data.conversionMaketsDayToDayToCalls = data.calls
        ? +((data.maketsDayToDay / data.calls) * 100).toFixed(2)
        : 0;

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

      data.temp = +((data.totalSales / +today) * daysInMonth).toFixed();

      data.tempToPlan = data.plan
        ? +((data.temp / data.plan) * 100).toFixed()
        : 0;

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

    fullData.temp = +((fullData.totalSales / +today) * daysInMonth).toFixed();
    fullData.tempToPlan = fullData.plan
      ? +((fullData.temp / fullData.plan) * 100).toFixed()
      : 0;
    fullData.callCost = fullData.calls
      ? +(fullData.adExpensesPrice / fullData.calls).toFixed(2)
      : 0;
    fullData.drr = fullData.totalSales
      ? +((fullData.adExpensesPrice / fullData.totalSales) * 100).toFixed(2)
      : 0;
    fullData.conversionDealsToCalls = fullData.calls
      ? +((fullData.dealsAmount / fullData.calls) * 100).toFixed(2)
      : 0;
    fullData.conversionMaketsToCalls = fullData.calls
      ? +((fullData.makets / fullData.calls) * 100).toFixed(2)
      : 0;

    fullData.conversionMaketsToSales = fullData.makets
      ? +((fullData.dealsAmount / fullData.makets) * 100).toFixed(2)
      : 0;
    fullData.conversionMaketsDayToDayToCalls = fullData.calls
      ? +((fullData.maketsDayToDay / fullData.calls) * 100).toFixed(2)
      : 0;

    return [
      {
        ...fullData,
        users: topManagers.sort((a, b) => b.sales - a.sales).slice(0, 10),
      },
      ...workSpacesData,
    ];
  }

  // satistics old
  async getStatistics(user: UserDto, period: string) {
    const workspacesSearch =
      user.role.department === 'administration' || user.role.shortName === 'KD'
        ? { gt: 0 }
        : user.workSpaceId;

    function getDaysInMonth(year: number, month: number): number {
      return new Date(year, month, 0).getDate();
    }

    //допы этого месяца за сделки прошлого  месяца
    // const lastDops = await this.prisma.dop.findMany({
    //   where: {
    //     deal: {
    //       saleDate: {
    //         startsWith: '2025-04',
    //       },
    //       reservation: false,
    //       status: {
    //         not: 'Возврат',
    //       },
    //     },
    //     saleDate: {
    //       startsWith: period,
    //     },
    //   },
    // });
    // console.log(
    //   'dops',
    //   lastDops.reduce((acc, dop) => acc + dop.price, 0),
    // );

    const allWorkspaces = await this.prisma.workSpace.findMany({
      where: {
        deletedAt: null,
        department: 'COMMERCIAL',
        title: {
          in: ['B2B', 'ВК', 'Ведение'],
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
            client: true,
            deliveries: true,
            dops: {
              where: {
                saleDate: {
                  startsWith: period,
                },
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
        deliveries: {
          where: {
            date: {
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
              },
            },
          },
        },
      },
    });

    const sendDeliveries = await this.prisma.delivery.findMany({
      where: {
        date: {
          startsWith: period,
        },
        status: 'Отправлена',
        deal: {
          status: { not: 'Возврат' },
          reservation: false,
        },
      },
      include: {
        deal: {
          include: {
            dops: true,
          },
        },
      },
    });
    const deliveredDeliveries = await this.prisma.delivery.findMany({
      where: {
        deliveredDate: {
          startsWith: period,
        },
        status: 'Вручена',
        deal: {
          status: { not: 'Возврат' },
          reservation: false,
        },
      },
      include: {
        deal: {
          include: {
            dops: true,
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
      temp: 0,
      tempToPlan: 0,
      dealsAmount: 0,
      dopSales: 0,
      dopsAmount: 0,
      salesToPlan: 0,
      remainder: 0,
      dopsToSales: 0,
      averageBill: 0,
      receivedPayments: 0,
      calls: 0,
      adExpensesPrice: 0,
      callCost: 0,
      drr: 0,
      dealsWithoutDesigners: 0,
      dealsSalesWithoutDesigners: 0,
      makets: 0,
      maketsDayToDay: 0,
      redirectToMSG: 0,
      conversionDealsToCalls: 0,
      conversionMaketsToCalls: 0,
      conversionMaketsToSales: 0,
      conversionMaketsDayToDayToCalls: 0,
      dealsDayToDay: 0,
      dealsDayToDayPrice: 0,
      sendDeliveries: 0,
      freeDeliveries: 0,
      freeDeliveriesPrice: 0,
      sendDeliveriesPrice: 0,
      deliveredDeliveriesPrice: 0,
      deliveredDeliveries: 0,
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
        {
          name: '',
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
        temp: 0,
        tempToPlan: 0,
        dealsAmount: w.deals.length,
        dopSales: 0,
        dopsAmount: 0,
        salesToPlan: 0,
        remainder: 0,
        dopsToSales: 0,
        averageBill: 0,
        receivedPayments: 0,
        calls: 0,
        adExpensesPrice: 0,
        callCost: 0,
        drr: 0,
        dealsWithoutDesigners: 0,
        dealsSalesWithoutDesigners: 0,
        makets: 0,
        maketsDayToDay: 0,
        redirectToMSG: 0,
        conversionDealsToCalls: 0,
        conversionMaketsToCalls: 0,
        conversionMaketsToSales: 0,
        conversionMaketsDayToDayToCalls: 0,
        dealsDayToDay: 0,
        dealsDayToDayPrice: 0,
        sendDeliveries: 0,
        freeDeliveries: 0,
        freeDeliveriesPrice: 0,
        sendDeliveriesPrice: 0,
        deliveredDeliveriesPrice: 0,
        deliveredDeliveries: 0,
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
          {
            name: '',
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
        const dopsPrice = deal.dops.reduce((a, b) => a + b.price, 0);
        if (
          [
            'Заготовка из базы',
            'Рекламный',
            'Из рассылки',
            'Визуализатор',
          ].includes(deal.maketType)
        ) {
          data.dealsWithoutDesigners += 1;
          data.dealsSalesWithoutDesigners += deal.price + dopsPrice;
          fullData.dealsWithoutDesigners += 1;
          fullData.dealsSalesWithoutDesigners += deal.price + dopsPrice;
        }
        if (deal.saleDate === deal.client.firstContact) {
          data.dealsDayToDay += 1;
          data.dealsDayToDayPrice += deal.price + dopsPrice;
          fullData.dealsDayToDay += 1;
          fullData.dealsDayToDayPrice += deal.price + dopsPrice;
        }

        deal.dealers.map((dealer) => {
          const userIndex = data.users.findIndex((u) => u.id === dealer.userId);
          // console.log(dealer.user, data.users[userIndex]);
          data.users[userIndex].sales += dealer.price;
        });
        // console.log(deal.maketType);
        const maketIndex = data.maketsSales.findIndex(
          (m) => m.name === deal.maketType,
        );
        data.maketsSales[maketIndex].sales += deal.price + dopsPrice;
        data.maketsSales[maketIndex].amount += 1;

        // sources
        if (!data.sources.find((s) => s.name === deal.source)) {
          data.sources.push({
            name: deal.source,
            sales: deal.price + dopsPrice,
          });
        } else {
          const sourceIndex = data.sources.findIndex(
            (s) => s.name === deal.source,
          );
          data.sources[sourceIndex].sales += deal.price + dopsPrice;
        }
        if (!fullData.sources.find((s) => s.name === deal.source)) {
          fullData.sources.push({
            name: deal.source,
            sales: deal.price + dopsPrice,
          });
        } else {
          const sourceIndex = fullData.sources.findIndex(
            (s) => s.name === deal.source,
          );
          fullData.sources[sourceIndex].sales += deal.price + dopsPrice;
        }

        //adtags
        if (!data.adTags.find((s) => s.name === deal.adTag)) {
          data.adTags.push({ name: deal.adTag, sales: deal.price + dopsPrice });
        } else {
          const adTagIndex = data.adTags.findIndex(
            (s) => s.name === deal.adTag,
          );
          data.adTags[adTagIndex].sales += deal.price + dopsPrice;
        }
        if (!fullData.adTags.find((s) => s.name === deal.adTag)) {
          fullData.adTags.push({
            name: deal.adTag,
            sales: deal.price + dopsPrice,
          });
        } else {
          const adTagIndex = fullData.adTags.findIndex(
            (s) => s.name === deal.adTag,
          );
          fullData.adTags[adTagIndex].sales += deal.price + dopsPrice;
        }

        data.sources.sort((a, b) => b.sales - a.sales);
        data.adTags.sort((a, b) => b.sales - a.sales);
        data.maketsSales.sort((a, b) => b.sales - a.sales);
      });

      // доставки
      const deliveries = w.deliveries;
      data.sendDeliveriesPrice = sendDeliveries
        .filter((d) => d.workSpaceId === w.id)
        .reduce(
          (acc, d) =>
            acc + (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
          0,
        );
      data.deliveredDeliveriesPrice = deliveredDeliveries
        .filter((d) => d.workSpaceId === w.id)
        .reduce(
          (acc, d) =>
            acc + (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
          0,
        );

      data.sendDeliveries = sendDeliveries.length;
      data.deliveredDeliveries = deliveredDeliveries.length;
      data.freeDeliveries = deliveries.filter(
        (d) => d.type === 'Бесплатно',
      ).length;
      data.freeDeliveriesPrice = deliveries
        .filter((d) => d.type === 'Бесплатно')
        .reduce((a, b) => a + b.price, 0);

      fullData.sendDeliveries += data.sendDeliveries;
      fullData.deliveredDeliveries += data.deliveredDeliveries;
      fullData.freeDeliveries += data.freeDeliveries;
      fullData.freeDeliveriesPrice += data.freeDeliveriesPrice;
      fullData.sendDeliveriesPrice += data.sendDeliveriesPrice;
      fullData.deliveredDeliveriesPrice += data.deliveredDeliveriesPrice;

      const adExpensesPrice = w.adExpenses.reduce((acc, item) => {
        return acc + item.price;
      }, 0);
      data.adExpensesPrice = adExpensesPrice;
      fullData.adExpensesPrice += adExpensesPrice;

      // Считаем заявки
      w.reports.map((r) => {
        const day = r.date.slice(8, 10);
        const index = data.callsChartData.findIndex((d) => d.name === day);
        // console.log(data.callsChartData[index]['ВК']);
        data.callsChartData[index][w.title] += r.calls;
        data.calls += r.calls;
        data.makets += r.makets;
        data.maketsDayToDay += r.maketsDayToDay;
        data.redirectToMSG += r.redirectToMSG;
        fullData.callsChartData[index][w.title] += r.calls;
        fullData.calls += r.calls;
        fullData.makets += r.makets;
        fullData.maketsDayToDay += r.maketsDayToDay;
        fullData.redirectToMSG += r.redirectToMSG;
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

      data.callCost = data.calls
        ? +(data.adExpensesPrice / data.calls).toFixed(2)
        : 0;
      // console.log(data.adExpensesPrice, 'adExpensesPrice');
      // console.log(data.totalSales, 'totalSales');
      data.drr = data.totalSales
        ? +((data.adExpensesPrice / data.totalSales) * 100).toFixed(2)
        : 0;

      data.conversionDealsToCalls = data.calls
        ? +((data.dealsAmount / data.calls) * 100).toFixed(2)
        : 0;
      data.conversionMaketsToCalls = data.calls
        ? +((data.makets / data.calls) * 100).toFixed(2)
        : 0;

      data.conversionMaketsToSales = data.makets
        ? +((data.dealsAmount / data.makets) * 100).toFixed(2)
        : 0;
      data.conversionMaketsDayToDayToCalls = data.calls
        ? +((data.maketsDayToDay / data.calls) * 100).toFixed(2)
        : 0;

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

      data.temp = +((data.totalSales / +today) * daysInMonth).toFixed();

      data.tempToPlan = data.plan
        ? +((data.temp / data.plan) * 100).toFixed()
        : 0;

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

    fullData.temp = +((fullData.totalSales / +today) * daysInMonth).toFixed();
    fullData.tempToPlan = fullData.plan
      ? +((fullData.temp / fullData.plan) * 100).toFixed()
      : 0;
    fullData.callCost = fullData.calls
      ? +(fullData.adExpensesPrice / fullData.calls).toFixed(2)
      : 0;
    fullData.drr = fullData.totalSales
      ? +((fullData.adExpensesPrice / fullData.totalSales) * 100).toFixed(2)
      : 0;
    fullData.conversionDealsToCalls = fullData.calls
      ? +((fullData.dealsAmount / fullData.calls) * 100).toFixed(2)
      : 0;
    fullData.conversionMaketsToCalls = fullData.calls
      ? +((fullData.makets / fullData.calls) * 100).toFixed(2)
      : 0;

    fullData.conversionMaketsToSales = fullData.makets
      ? +((fullData.dealsAmount / fullData.makets) * 100).toFixed(2)
      : 0;
    fullData.conversionMaketsDayToDayToCalls = fullData.calls
      ? +((fullData.maketsDayToDay / fullData.calls) * 100).toFixed(2)
      : 0;

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
            deletedAt: true,
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
      users: w.users.map((u) => ({
        id: u.id,
        fullName: u.fullName + (u.deletedAt !== null ? ' (Уволен)' : ''),
      })),
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
