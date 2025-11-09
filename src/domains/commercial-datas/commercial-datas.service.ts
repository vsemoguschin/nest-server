import { Injectable, NotFoundException } from '@nestjs/common';
import { UserDto } from '../users/dto/user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
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

interface DealsInfo {
  dealPrice: number;
  dealerPart: number;
  dealerPrice: number;
  id: number;
  paid: number;
  saleDate: string;
  title: string;
  usersId: number;
  bonusPercentage: number;
  toSalary: number;
}

interface DopsInfo {
  title: string;
  dopPrice: number;
  saleDate: string;
  dealTitle: string;
  dealId: number;
  paid: number;
  userId: number;
  bonusPercentage: number;
  toSalary: number;
}

const DEAL_STATUS_FILTER = {
  reservation: false,
  deletedAt: null,
  status: { not: 'Возврат' as const },
};

const buildDealPeriodFilter = (period: string) => ({
  saleDate: {
    startsWith: period,
  },
  ...DEAL_STATUS_FILTER,
});

const buildDopPeriodFilter = (period: string) => ({
  saleDate: {
    startsWith: period,
  },
  ...DEAL_STATUS_FILTER,
});

@Injectable()
export class CommercialDatasService {
  constructor(private readonly prisma: PrismaService) {}
  private getDaysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
  }
  private calculateTemp(totalSales: number, period: string): number {
    const [yearStr, monthStr] = period.split('-');
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const daysInMonth = this.getDaysInMonth(year, month);

    const currentIso = new Date().toISOString();
    const isCurrentMonth = monthStr === currentIso.slice(5, 7);
    const dayValue = isCurrentMonth
      ? Number.parseInt(currentIso.slice(8, 10), 10)
      : daysInMonth;

    if (!dayValue) return 0;

    return +((totalSales / dayValue) * daysInMonth).toFixed();
  }

  private getBonusPercentage(
    totalSales: number,
    workSpaceId: number,
    groupId: number,
    isIntern: boolean,
    role: string,
    period: string,
  ) {
    let bonusPercentage = 0;
    let dopsPercentage = 0;
    let bonus = 0;
    if (workSpaceId === 2) {
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
          bonus += 10480;
        } else if (totalSales < 1_100_000) {
          bonusPercentage = 0.05;
          bonus += 15000;
        } else if (totalSales < 1_200_000) {
          bonusPercentage = 0.05;
          bonus += 17500;
        } else if (totalSales < 1_350_000) {
          bonusPercentage = 0.05;
          bonus += 20000;
        } else if (totalSales < 1_500_000) {
          bonusPercentage = 0.05;
          bonus += 23700;
        } else if (totalSales < 1_700_000) {
          bonusPercentage = 0.05;
          bonus += 27500;
        } else if (totalSales < 2_000_000) {
          bonusPercentage = 0.05;
          bonus += 32500;
        } else if (totalSales >= 2_000_000) {
          bonusPercentage = 0.05;
          bonus += 40000;
        }
      } else {
        if (totalSales > 600_000) {
          bonus += 2000;
        } else if (totalSales < 800_000) {
          bonusPercentage = 0.04;
        } else if (totalSales < 1_000_000) {
          bonusPercentage = 0.045;
          bonus += 10480;
        } else if (totalSales < 1_100_000) {
          bonusPercentage = 0.05;
          bonus += 15000;
        } else if (totalSales < 1_200_000) {
          bonusPercentage = 0.05;
          bonus += 17500;
        } else if (totalSales < 1_350_000) {
          bonusPercentage = 0.05;
          bonus += 20000;
        } else if (totalSales < 1_500_000) {
          bonusPercentage = 0.05;
          bonus += 23700;
        } else if (totalSales < 1_700_000) {
          bonusPercentage = 0.05;
          bonus += 27500;
        } else if (totalSales < 2_000_000) {
          bonusPercentage = 0.05;
          bonus += 32500;
        } else if (totalSales >= 2_000_000) {
          bonusPercentage = 0.05;
          bonus += 40000;
        }
      }
      dopsPercentage = 0.1;
    }

    if (workSpaceId === 3) {
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
          bonus += 10_000; // Премия за достижение 1 млн
        }
      } else {
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
          bonus += 10_000; // Премия за достижение 850k
        }
      }
      dopsPercentage = bonusPercentage;
    }
    if (groupId === 19) {
      bonusPercentage = 0.07;
      dopsPercentage = 0.07;
    }
    if (groupId === 19 && role === 'MOV' && period >= '2025-10') {
      dopsPercentage = 0.05;
      bonusPercentage = 0.05;
    }

    return {
      bonusPercentage,
      dopsPercentage,
      bonus,
    };
  }

  private getDOBonusPercentage(
    totalSales: number,
    period: string,
    plan: number,
  ) {
    let bonusPercentage = 0;
    if (totalSales > plan) {
      bonusPercentage = 0.01;
    } else if (totalSales < plan) {
      bonusPercentage = 0.005;
    }

    return {
      bonusPercentage,
    };
  }
  // для юли расчеты
  private async getDOSalesDatas(workSpaceId: number, period: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        date: {
          startsWith: period,
        },
        workSpaceId: workSpaceId,
        deal: {
          reservation: false,
          deletedAt: null,
          status: { not: 'Возврат' },
        },
      },
      include: {
        deal: {
          include: {
            dops: true,
            payments: true,
            dealers: true,
          },
        },
      },
    });

    /** ищем уникальные периоды платежей */
    const paymentsPeriods = Array.from(
      new Set(payments.map((p) => p.deal.saleDate.slice(0, 7))),
    );
    // .filter((p) => p <= period); //['2025-04', '2025-03', ...]
    // console.log(paymentsPeriods);
    // console.log(payments.filter((p) => p.deal.saleDate.startsWith('2025-11')));
    /** формируем данные по каждому периоду*/
    const res = await Promise.all(
      paymentsPeriods.map(async (per) => {
        const m = await this.prisma.workSpace.findUnique({
          where: {
            id: workSpaceId,
          },
          include: {
            users: {
              where: {
                role: {
                  shortName: 'DO',
                },
              },
              include: {
                managersPlans: {
                  where: {
                    period: per,
                  },
                },
              },
            },
            deals: {
              where: {
                saleDate: {
                  startsWith: per,
                },
                reservation: false,
                deletedAt: null,
                status: { not: 'Возврат' },
              },
              include: {
                client: true,
                payments: true,
              },
            },
            dops: {
              where: {
                saleDate: {
                  startsWith: per,
                },
                deal: {
                  reservation: false,
                  deletedAt: null,
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
          },
        });

        if (!m) {
          return;
        }
        const dealSales = m.deals.reduce((a, b) => a + b.price, 0);
        const dopSales = m.dops.reduce((a, b) => a + b.price, 0);
        const totalSales = dealSales + dopSales;
        const plan = m.users
          .flatMap((u) => u.managersPlans)
          .reduce((a, b) => a + b.plan, 0);
        const bonusPercentage = this.getDOBonusPercentage(
          totalSales,
          per,
          plan,
        ).bonusPercentage;
        const paymentsFact = payments
          .filter((p) => p.deal.saleDate.slice(0, 7) === per)
          .reduce((a, b) => a + b.price, 0);
        const toSalary = Math.round(paymentsFact * bonusPercentage * 100) / 100;
        return {
          per,
          bonusPercentage,
          plan,
          totalSales,
          dopSales,
          dealSales,
          paymentsFact,
          toSalary,
        };
      }),
    );

    return res
      .filter((item): item is NonNullable<typeof item> => item !== undefined)
      .sort((a, b) => b.per.localeCompare(a.per));
  }

  /** Расчет продаж ROP за период по группе */
  private calculateROPSalesForPeriod(
    deals: Array<{ price: number }>,
    dops: Array<{ price: number }>,
  ) {
    const dealSales = deals.reduce((a, b) => a + b.price, 0);
    const dopSales = dops.reduce((a, b) => a + b.price, 0);
    const totalSales = dealSales + dopSales;
    return { dealSales, dopSales, totalSales };
  }

  /** Расчет toSalary для ROP */
  private calculateROPToSalary(paymentsFact: number, bonusPercentage: number) {
    return Math.round(paymentsFact * bonusPercentage * 100) / 100;
  }

  /** Получение данных по продажам ROP по группе */
  private async getROPSalesDatas(groupId: number, period: string) {
    //находим все платежи внесенные в этот период
    const payments = await this.prisma.payment.findMany({
      where: {
        date: {
          startsWith: period,
        },
        groupId: groupId,
        deal: {
          reservation: false,
          deletedAt: null,
          status: { not: 'Возврат' },
        },
      },
      include: {
        deal: {
          include: {
            dops: true,
            payments: true,
            dealers: true,
          },
        },
      },
    });

    /** ищем уникальные периоды сделок */
    const paymentsPeriods = Array.from(
      new Set(payments.map((p) => p.deal.saleDate.slice(0, 7))),
    ).filter((p) => p >= '2025-09' && p <= period);
    /** формируем данные по каждому периоду*/
    const res = await Promise.all(
      paymentsPeriods.map(async (per) => {
        const g = await this.prisma.group.findUnique({
          where: {
            id: groupId,
          },
          include: {
            users: {
              where: {
                role: {
                  shortName: 'ROP',
                },
              },
              include: {
                managersPlans: {
                  where: {
                    period: per,
                  },
                },
              },
            },
            deals: {
              where: {
                saleDate: {
                  startsWith: per,
                },
                reservation: false,
                deletedAt: null,
                status: { not: 'Возврат' },
              },
              include: {
                client: true,
                payments: true,
              },
            },
            dops: {
              where: {
                saleDate: {
                  startsWith: per,
                },
                deal: {
                  reservation: false,
                  deletedAt: null,
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
          },
        });

        if (!g) {
          return;
        }
        const { dealSales, dopSales, totalSales } =
          this.calculateROPSalesForPeriod(g.deals, g.dops);
        const bonusPercentage = 0.005; // Фиксированный процент для ROP
        const paymentsFact = payments
          .filter((p) => p.deal.saleDate.slice(0, 7) === per)
          .reduce((a, b) => a + b.price, 0);
        const toSalary = this.calculateROPToSalary(
          paymentsFact,
          bonusPercentage,
        );
        return {
          per,
          bonusPercentage,
          totalSales,
          dopSales,
          dealSales,
          paymentsFact,
          toSalary,
        };
      }),
    );

    return (
      res
        .filter((item): item is NonNullable<typeof item> => item !== undefined)
        // .filter((item) => item?.toSalary !== 0)
        .sort((a, b) => b.per.localeCompare(a.per))
    );
  }

  private async getManagerSalesDatas(userId: number, period: string) {
    /**
     * поиск всех платежей менеджера за выбранный период
     * там где он участник сделки или продал доп
     */
    const payments = await this.prisma.payment.findMany({
      where: {
        date: {
          startsWith: period,
        },
        deal: {
          reservation: false,
          deletedAt: null,
          status: { not: 'Возврат' },
          OR: [
            {
              dealers: {
                some: {
                  userId: userId,
                },
              },
            },
            {
              dops: {
                some: {
                  userId: userId,
                },
              },
            },
          ],
        },
      },
      include: {
        deal: {
          include: {
            dops: true,
            payments: true,
            dealers: true,
          },
        },
      },
    });

    /** ищем уникальные периоды платежей */
    const paymentsPeriods = Array.from(
      new Set(payments.map((p) => p.deal.saleDate.slice(0, 7))),
    ).filter((p) => p <= period); //['2025-04', '2025-03', ...]
    /** формируем данные по каждому периоду*/
    const res = await Promise.all(
      paymentsPeriods.map(async (per) => {
        const m = await this.prisma.user.findUnique({
          where: {
            id: userId,
          },
          include: {
            role: true,
            dealSales: {
              where: {
                deal: {
                  saleDate: {
                    startsWith: per,
                  },
                  reservation: false,
                  deletedAt: null,
                  status: { not: 'Возврат' },
                },
              },
              include: {
                deal: {
                  include: {
                    client: true,
                    payments: true,
                  },
                },
              },
            },
            dops: {
              where: {
                saleDate: {
                  startsWith: per,
                },
                deal: {
                  reservation: false,
                  deletedAt: null,
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
                period,
              },
            },
          },
        });
        if (!m) {
          return;
        }
        const dealSales = m.dealSales.reduce((a, b) => a + b.price, 0);
        const dopSales = m.dops.reduce((a, b) => a + b.price, 0);
        const totalSales = dealSales + dopSales;
        const isIntern = m.managerReports.find((r) => r.isIntern === true)
          ? true
          : false;
        return {
          ...this.getBonusPercentage(
            totalSales,
            m.workSpaceId,
            m.groupId,
            isIntern,
            m.role.shortName,
            per,
          ),
          per,
        };
      }),
    );

    const dealsInfo: DealsInfo[] = [];
    const dealsInfoPrevMounth: DealsInfo[] = [];

    const dopsInfo: DopsInfo[] = [];
    const dopsInfoPrevMounth: DopsInfo[] = [];
    const checkedDeals: number[] = [];
    payments.map((p) => {
      if (checkedDeals.includes(p.deal.id)) {
        // console.log(p.deal.id, ' blocked');
        return;
      }
      //   console.log(p.deal.id);
      checkedDeals.push(p.deal.id);
      const payPeriod = p.date.slice(0, 7);
      const deal = p.deal;
      const dealPrice = p.deal.price;
      const dealers = p.deal.dealers;
      const dops = p.deal.dops;
      //платежи до выбраного периода
      const dealPaymentsLastPeriod = deal.payments
        .filter((p) => p.date.slice(0, 7) < payPeriod)
        .reduce((a, b) => a + b.price, 0);
      //платежи за выбранный период
      const dealPaymentsThisPeriod = deal.payments
        .filter((p) => p.date.slice(0, 7) === payPeriod)
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
      //если менеджер участник сделки
      const dealer = dealers.find((d) => d.userId === userId);
      if (dealer) {
        const dealerPrice = dealer.price;
        const dealerPart = dealerPrice / dealPrice;
        const paid = +(dealPaid * dealerPart).toFixed(2);
        const salePeriod = deal.saleDate.slice(0, 7);
        const bonusPercentage =
          res.find((p) => p?.per === salePeriod)?.bonusPercentage || 0;
        const item = {
          id: deal.id,
          title: deal.title,
          saleDate: deal.saleDate,
          dealPrice,
          dealerPrice,
          dealerPart: +(dealerPart * 100).toFixed(),
          paid,
          usersId: dealer.userId,
          bonusPercentage,
          toSalary: paid * bonusPercentage,
        };
        if (salePeriod === period) {
          dealsInfo.push(item);
        } else {
          dealsInfoPrevMounth.push(item);
        }
      } else {
        // console.log('deal nope');
      }
      // если есть допы менеджера
      const managerDops = dops.filter((d) => d.userId === userId);
      if (managerDops.length) {
        const dealDopsPrice = dops.reduce((a, b) => a + b.price, 0);
        managerDops.map((d) => {
          const dealerPart = d.price / dealDopsPrice;
          const paid = +(dopPaid * dealerPart).toFixed(2);
          const salePeriod = d.saleDate.slice(0, 7);
          const bonusPercentage =
            res.find((p) => p?.per === salePeriod)?.dopsPercentage || 0;
          const item = {
            title: d.type,
            dopPrice: d.price,
            saleDate: d.saleDate,
            dealTitle: deal.title,
            dealId: deal.id,
            paid,
            userId: d.userId,
            bonusPercentage,
            toSalary: paid * bonusPercentage,
          };
          if (d.saleDate.slice(0, 7) === period) {
            dopsInfo.push(item);
          } else {
            dopsInfoPrevMounth.push(item);
          }
        });
      } else {
        // console.log('dop nope');
      }
    });

    return {
      dealsInfo,
      dealsInfoPrevMounth,
      dopsInfo,
      dopsInfoPrevMounth,
    };
  }
  private async getManagerSalaryDatas(userId: number, period: string) {
    const m = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        managersPlans: {
          where: {
            period,
          },
        },
        managerReports: {
          where: {
            period,
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
    });
    if (!m) {
      throw new NotFoundException('Менеджер не найден.');
    }
    const pays = m.salaryPays.reduce((a, b) => a + b.price, 0) || 0;
    const salaryCorrections = m.salaryCorrections;
    const shift = m.managerReports.length;
    const shiftBonus = m.managerReports.reduce((a, b) => a + b.shiftCost, 0);
    return {
      pays,
      salaryPays: m.salaryPays,
      salaryCorrections,
      shiftBonus,
      shift,
    };
  }
  /** данные по мопу */
  private async getMopDatas(user: UserDto, period: string, managerId: number) {
    const m = await this.prisma.user.findUnique({
      where: {
        id: managerId,
      },
      include: {
        role: true,
        workSpace: true,
        group: true,
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
              deletedAt: null,
              status: { not: 'Возврат' },
            },
          },
          include: {
            deal: {
              include: {
                client: true,
                payments: true,
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
              deletedAt: null,
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
            period,
          },
        },
        payments: {
          where: {
            date: {
              startsWith: period,
            },
            deal: {
              reservation: false,
              deletedAt: null,
              status: { not: 'Возврат' },
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
    });

    if (!m) {
      throw new NotFoundException('Менеджер не найден.');
    }
    const dealsAmount = m.dealSales.length;
    const dopsAmount = m.dops.length;
    const dealSales = m.dealSales.reduce((a, b) => a + b.price, 0);
    const dopSales = m.dops.reduce((a, b) => a + b.price, 0);
    const totalSales = dealSales + dopSales;
    /**Факт для ведения */
    const fact =
      m.groupId === 19 && m.role.shortName === 'MOV'
        ? m.payments.reduce((a, b) => a + b.price, 0)
        : 0;
    const factAmount = m.payments.length;
    const factPercentage =
      m.groupId === 19 && m.role.shortName === 'MOV' ? 0.01 : 0;
    const factBonus = +(fact * factPercentage).toFixed(2);
    const temp = this.calculateTemp(totalSales, period);
    /** стоимость заявки в проекте*/
    const { callCost, isOverRopPlan, tops } = await this.getManagerGroupDatas(
      m.groupId,
      period,
    );

    /** Стредний чек */
    const averageBill = dealsAmount ? +(totalSales / dealsAmount).toFixed() : 0;
    /** количество заявок менеджера */
    const calls = m.managerReports.reduce((a, b) => a + b.calls, 0);
    /** макеты */
    const makets = m.managerReports.reduce((a, b) => a + b.makets, 0);
    /** Макеты день в день */
    const maketsDayToDay = m.managerReports.reduce(
      (a, b) => a + b.maketsDayToDay,
      0,
    );
    /**Переходы в мессенджер */
    const redirectToMSG = m.managerReports.reduce(
      (a, b) => a + b.redirectToMSG,
      0,
    );
    /**дрр*/
    const drr = totalSales
      ? +(((calls * callCost) / totalSales) * 100).toFixed(2)
      : 0;
    /** % из заявки в продажу */
    const conversionDealsToCalls = calls
      ? +((dealsAmount / calls) * 100).toFixed(2)
      : 0;

    /** % из заявки в макет */
    const conversionMaketsToCalls = calls
      ? +((makets / calls) * 100).toFixed(2)
      : 0;

    /** % из макета в продажу */
    const conversionMaketsToSales = makets
      ? +((dealsAmount / makets) * 100).toFixed(2)
      : 0;
    /** % из заявки в макет день в день */
    const conversionMaketsDayToDayToCalls = calls
      ? +((maketsDayToDay / calls) * 100).toFixed(2)
      : 0;
    /** Продажи день в день */
    const dealsDayToDay = m.dealSales
      .flatMap((ds) => ds.deal)
      .filter((d) => d.saleDate === d.client.firstContact);
    /** Продажи день в день */
    const dealsDayToDayPrice = dealsDayToDay.reduce((a, b) => a + b.price, 0);
    /** Без дизайнера */
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
    /** Сумма продаж без дизайнера */
    const dealsSalesWithoutDesigners = dealsWithoutDesigners.reduce(
      (sum, deal) => sum + (deal.price || 0),
      0,
    );

    const { dealsInfo, dealsInfoPrevMounth, dopsInfo, dopsInfoPrevMounth } =
      await this.getManagerSalesDatas(m.id, period);
    const dealPays = +dealsInfo.reduce((a, b) => a + b.toSalary, 0).toFixed(2);
    const dopPays = +dopsInfo.reduce((a, b) => a + b.toSalary, 0).toFixed(2);
    const prevPeriodsDealsPays = +dealsInfoPrevMounth
      .reduce((a, b) => a + b.toSalary, 0)
      .toFixed(2);
    const prevPeriodsDopsPays = +dopsInfoPrevMounth
      .reduce((a, b) => a + b.toSalary, 0)
      .toFixed(2);
    const { pays, salaryPays, salaryCorrections, shift, shiftBonus } =
      await this.getManagerSalaryDatas(m.id, period);
    const isIntern = m.managerReports.find((r) => r.isIntern === true)
      ? true
      : false;
    const { bonusPercentage, bonus, dopsPercentage } = this.getBonusPercentage(
      totalSales,
      m.workSpaceId,
      m.groupId,
      isIntern,
      m.role.shortName,
      period,
    );
    let totalSalary = 0;

    const salaryCorrectionMinus = salaryCorrections
      .filter((c) => c.type === 'Вычет')
      .reduce((a, b) => a + b.price, 0);
    const salaryCorrectionPlus = salaryCorrections
      .filter((s) => s.type === 'Прибавка')
      .reduce((a, b) => a + b.price, 0);
    const groupPlanBonus =
      isOverRopPlan &&
      m.deletedAt === null &&
      (m.groupId === 3 || m.groupId === 2)
        ? 3000
        : 0;
    const topBonus =
      tops.find((m) => m.id === managerId && m.groupId === 3)?.topBonus ?? 0;
    totalSalary +=
      salaryCorrectionPlus -
      salaryCorrectionMinus +
      prevPeriodsDealsPays +
      prevPeriodsDopsPays +
      bonus +
      dealPays +
      dopPays +
      shiftBonus +
      groupPlanBonus +
      topBonus +
      factBonus;

    const dodatas =
      managerId === 21 ? await this.getDOSalesDatas(m.workSpaceId, period) : [];
    // console.log(dodatas);
    const doSalary = dodatas.reduce((a, b) => a + b.toSalary, 0);
    totalSalary += doSalary;

    const ropdatas =
      m.groupId === 19 && m.role.shortName === 'ROP'
        ? await this.getROPSalesDatas(m.groupId, period)
        : [];
    const ropSalary = ropdatas.reduce((a, b) => a + b.toSalary, 0);
    totalSalary += ropSalary;
    return {
      fullName: m.fullName,
      role: m.role.fullName,
      id: m.id,
      workSpace: m.workSpace.title,
      group: m.group.title,

      plan: m.managersPlans[0]?.plan ?? 0,
      totalSales,
      dealsAmount,
      dealSales,
      dopsAmount,
      dopSales,
      fact,
      factAmount,
      factPercentage,
      factBonus,
      temp,

      // Показатели
      averageBill: averageBill,
      drr: drr,
      calls: calls,
      conversionDealsToCalls: conversionDealsToCalls,
      conversionMaketsToCalls: conversionMaketsToCalls,
      makets: makets,
      conversionMaketsToSales: conversionMaketsToSales,
      maketsDayToDay: maketsDayToDay,
      conversionMaketsDayToDayToCalls: conversionMaketsDayToDayToCalls,
      dealsDayToDay: dealsDayToDay.length,
      dealsDayToDayPrice: dealsDayToDayPrice,
      dealsWithoutDesigners: dealsWithoutDesigners.length,
      dealsSalesWithoutDesigners: dealsSalesWithoutDesigners,
      redirectToMSG: redirectToMSG,

      pays,
      salaryPays,
      salaryCorrections,
      shift,
      shiftBonus,

      bonusPercentage,
      bonus,
      dopsPercentage,
      groupPlanBonus,
      doSalary,
      ropSalary,
      dodatas,
      ropdatas,
      dopPays,
      dealPays,
      topBonus,
      totalSalary,
      rem: 0,

      dealsInfo: dealsInfo.sort((a, b) => a.id - b.id),
      // .filter((d) => d.toSalary > 0),
      dealsInfoPrevMounth: dealsInfoPrevMounth.sort((a, b) => a.id - b.id),
      // .filter((d) => d.toSalary > 0),
      dopsInfo: dopsInfo.sort((a, b) => a.dealId - b.dealId),
      // .filter((d) => d.toSalary > 0),
      dopsInfoPrevMounth: dopsInfoPrevMounth.sort(
        (a, b) => a.dealId - b.dealId,
      ),
      // .filter((d) => d.toSalary > 0),
      prevPeriodsDealsPays,
      prevPeriodsDopsPays,

      reports: m.managerReports,

      groupId: m.groupId,
      isIntern: m.isIntern,
      fired: m.deletedAt ? true : false,
    };
  }
  /** данные по ропу */
  private async getRopDatas(user: UserDto, period: string, managerId: number) {
    const m = await this.prisma.user.findUnique({
      where: {
        id: managerId,
      },
      include: {
        role: true,
        workSpace: true,
        group: {
          include: {
            payments: {
              where: {
                date: {
                  startsWith: period,
                },
                deal: {
                  reservation: false,
                  deletedAt: null,
                  status: { not: 'Возврат' },
                },
              },
            },
          },
        },
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
              deletedAt: null,
              status: { not: 'Возврат' },
            },
          },
          include: {
            deal: {
              include: {
                client: true,
                payments: true,
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
              deletedAt: null,
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
            period,
          },
        },
        payments: {
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
    });

    if (!m) {
      throw new NotFoundException('Менеджер не найден.');
    }
    const dealsAmount = m.dealSales.length;
    const dopsAmount = m.dops.length;
    const dealSales = m.dealSales.reduce((a, b) => a + b.price, 0);
    const dopSales = m.dops.reduce((a, b) => a + b.price, 0);
    const totalSales = dealSales + dopSales;

    /**Факт */
    const fact = 0;
    const factAmount = 0;
    const factPercentage = 0;
    const factBonus = +(fact * factPercentage).toFixed(2);
    const temp = this.calculateTemp(totalSales, period);
    /** стоимость заявки в проекте*/
    const { callCost, isOverRopPlan, tops } = await this.getManagerGroupDatas(
      m.groupId,
      period,
    );

    /** Стредний чек */
    const averageBill = dealsAmount ? +(totalSales / dealsAmount).toFixed() : 0;
    /** количество заявок менеджера */
    const calls = m.managerReports.reduce((a, b) => a + b.calls, 0);
    /** макеты */
    const makets = m.managerReports.reduce((a, b) => a + b.makets, 0);
    /** Макеты день в день */
    const maketsDayToDay = m.managerReports.reduce(
      (a, b) => a + b.maketsDayToDay,
      0,
    );
    /**Переходы в мессенджер */
    const redirectToMSG = m.managerReports.reduce(
      (a, b) => a + b.redirectToMSG,
      0,
    );
    /**дрр*/
    const drr = totalSales
      ? +(((calls * callCost) / totalSales) * 100).toFixed(2)
      : 0;
    /** % из заявки в продажу */
    const conversionDealsToCalls = calls
      ? +((dealsAmount / calls) * 100).toFixed(2)
      : 0;

    /** % из заявки в макет */
    const conversionMaketsToCalls = calls
      ? +((makets / calls) * 100).toFixed(2)
      : 0;

    /** % из макета в продажу */
    const conversionMaketsToSales = makets
      ? +((dealsAmount / makets) * 100).toFixed(2)
      : 0;
    /** % из заявки в макет день в день */
    const conversionMaketsDayToDayToCalls = calls
      ? +((maketsDayToDay / calls) * 100).toFixed(2)
      : 0;
    /** Продажи день в день */
    const dealsDayToDay = m.dealSales
      .flatMap((ds) => ds.deal)
      .filter((d) => d.saleDate === d.client.firstContact);
    /** Продажи день в день */
    const dealsDayToDayPrice = dealsDayToDay.reduce((a, b) => a + b.price, 0);
    /** Без дизайнера */
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
    /** Сумма продаж без дизайнера */
    const dealsSalesWithoutDesigners = dealsWithoutDesigners.reduce(
      (sum, deal) => sum + (deal.price || 0),
      0,
    );

    const { dealsInfo, dealsInfoPrevMounth, dopsInfo, dopsInfoPrevMounth } =
      await this.getManagerSalesDatas(m.id, period);
    const dealPays = +dealsInfo.reduce((a, b) => a + b.toSalary, 0).toFixed(2);
    const dopPays = +dopsInfo.reduce((a, b) => a + b.toSalary, 0).toFixed(2);
    const prevPeriodsDealsPays = +dealsInfoPrevMounth
      .reduce((a, b) => a + b.toSalary, 0)
      .toFixed(2);
    const prevPeriodsDopsPays = +dopsInfoPrevMounth
      .reduce((a, b) => a + b.toSalary, 0)
      .toFixed(2);
    const { pays, salaryPays, salaryCorrections, shift, shiftBonus } =
      await this.getManagerSalaryDatas(m.id, period);
    const isIntern = m.managerReports.find((r) => r.isIntern === true)
      ? true
      : false;
    const { bonusPercentage, bonus, dopsPercentage } = this.getBonusPercentage(
      totalSales,
      m.workSpaceId,
      m.groupId,
      isIntern,
      m.role.shortName,
      period,
    );
    let totalSalary = 0;

    const salaryCorrectionMinus = salaryCorrections
      .filter((c) => c.type === 'Вычет')
      .reduce((a, b) => a + b.price, 0);
    const salaryCorrectionPlus = salaryCorrections
      .filter((s) => s.type === 'Прибавка')
      .reduce((a, b) => a + b.price, 0);
    const groupPlanBonus =
      isOverRopPlan &&
      m.deletedAt === null &&
      (m.groupId === 3 || m.groupId === 2)
        ? 3000
        : 0;
    const topBonus =
      tops.find((m) => m.id === managerId && m.groupId === 3)?.topBonus ?? 0;

    const ropdatas =
      m.groupId === 19 && m.role.shortName === 'ROP'
        ? await this.getROPSalesDatas(m.groupId, period)
        : [];
    const ropSalary = ropdatas.reduce((a, b) => a + b.toSalary, 0);

    totalSalary +=
      salaryCorrectionPlus -
      salaryCorrectionMinus +
      prevPeriodsDealsPays +
      prevPeriodsDopsPays +
      bonus +
      dealPays +
      dopPays +
      shiftBonus +
      groupPlanBonus +
      topBonus +
      factBonus +
      ropSalary;

    return {
      fullName: m.fullName,
      role: m.role.fullName,
      id: m.id,
      workSpace: m.workSpace.title,
      group: m.group.title,
      ropdatas,

      plan: m.managersPlans[0]?.plan ?? 0,
      totalSales,
      dealsAmount,
      dealSales,
      dopsAmount,
      dopSales,
      fact,
      factAmount,
      factPercentage,
      factBonus,
      temp,

      // Показатели
      averageBill: averageBill,
      drr: drr,
      calls: calls,
      conversionDealsToCalls: conversionDealsToCalls,
      conversionMaketsToCalls: conversionMaketsToCalls,
      makets: makets,
      conversionMaketsToSales: conversionMaketsToSales,
      maketsDayToDay: maketsDayToDay,
      conversionMaketsDayToDayToCalls: conversionMaketsDayToDayToCalls,
      dealsDayToDay: dealsDayToDay.length,
      dealsDayToDayPrice: dealsDayToDayPrice,
      dealsWithoutDesigners: dealsWithoutDesigners.length,
      dealsSalesWithoutDesigners: dealsSalesWithoutDesigners,
      redirectToMSG: redirectToMSG,

      pays,
      salaryPays,
      salaryCorrections,
      shift,
      shiftBonus,

      bonusPercentage,
      bonus,
      dopsPercentage,

      dopPays,
      dealPays,
      topBonus,
      totalSalary,
      ropSalary,
      rem: 0,

      dealsInfo: dealsInfo.sort((a, b) => a.id - b.id),
      // .filter((d) => d.toSalary > 0),
      dealsInfoPrevMounth: dealsInfoPrevMounth.sort((a, b) => a.id - b.id),
      // .filter((d) => d.toSalary > 0),
      dopsInfo: dopsInfo.sort((a, b) => a.dealId - b.dealId),
      // .filter((d) => d.toSalary > 0),
      dopsInfoPrevMounth: dopsInfoPrevMounth.sort(
        (a, b) => a.dealId - b.dealId,
      ),
      // .filter((d) => d.toSalary > 0),
      prevPeriodsDealsPays,
      prevPeriodsDopsPays,

      reports: m.managerReports,

      groupId: m.groupId,
      isIntern: m.isIntern,
      fired: m.deletedAt ? true : false,
    };
  }
  /** данные по ропу */
  private async getDODatas(user: UserDto, period: string, managerId: number) {
    const m = await this.prisma.user.findUnique({
      where: {
        id: managerId,
      },
      include: {
        role: true,
        workSpace: true,
        group: {
          include: {
            payments: {
              where: {
                date: {
                  startsWith: period,
                },
                deal: {
                  reservation: false,
                  deletedAt: null,
                  status: { not: 'Возврат' },
                },
              },
            },
          },
        },
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
              deletedAt: null,
              status: { not: 'Возврат' },
            },
          },
          include: {
            deal: {
              include: {
                client: true,
                payments: true,
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
              deletedAt: null,
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
            period,
          },
        },
        payments: {
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
    });

    if (!m) {
      throw new NotFoundException('Менеджер не найден.');
    }
    const dealsAmount = m.dealSales.length;
    const dopsAmount = m.dops.length;
    const dealSales = m.dealSales.reduce((a, b) => a + b.price, 0);
    const dopSales = m.dops.reduce((a, b) => a + b.price, 0);
    const totalSales = dealSales + dopSales;

    /** стоимость заявки в проекте*/
    const { callCost, isOverRopPlan, tops } = await this.getManagerGroupDatas(
      m.groupId,
      period,
    );

    // console.log(isOverRopPlan);

    /**Факт */
    const fact = 0;
    const factAmount = 0;
    const factPercentage = 0;
    const factBonus = +(fact * factPercentage).toFixed(2);
    const temp = this.calculateTemp(totalSales, period);

    /** Стредний чек */
    const averageBill = dealsAmount ? +(totalSales / dealsAmount).toFixed() : 0;
    /** количество заявок менеджера */
    const calls = m.managerReports.reduce((a, b) => a + b.calls, 0);
    /** макеты */
    const makets = m.managerReports.reduce((a, b) => a + b.makets, 0);
    /** Макеты день в день */
    const maketsDayToDay = m.managerReports.reduce(
      (a, b) => a + b.maketsDayToDay,
      0,
    );
    /**Переходы в мессенджер */
    const redirectToMSG = m.managerReports.reduce(
      (a, b) => a + b.redirectToMSG,
      0,
    );
    /**дрр*/
    const drr = totalSales
      ? +(((calls * callCost) / totalSales) * 100).toFixed(2)
      : 0;
    /** % из заявки в продажу */
    const conversionDealsToCalls = calls
      ? +((dealsAmount / calls) * 100).toFixed(2)
      : 0;

    /** % из заявки в макет */
    const conversionMaketsToCalls = calls
      ? +((makets / calls) * 100).toFixed(2)
      : 0;

    /** % из макета в продажу */
    const conversionMaketsToSales = makets
      ? +((dealsAmount / makets) * 100).toFixed(2)
      : 0;
    /** % из заявки в макет день в день */
    const conversionMaketsDayToDayToCalls = calls
      ? +((maketsDayToDay / calls) * 100).toFixed(2)
      : 0;
    /** Продажи день в день */
    const dealsDayToDay = m.dealSales
      .flatMap((ds) => ds.deal)
      .filter((d) => d.saleDate === d.client.firstContact);
    /** Продажи день в день */
    const dealsDayToDayPrice = dealsDayToDay.reduce((a, b) => a + b.price, 0);
    /** Без дизайнера */
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
    /** Сумма продаж без дизайнера */
    const dealsSalesWithoutDesigners = dealsWithoutDesigners.reduce(
      (sum, deal) => sum + (deal.price || 0),
      0,
    );

    const { dealsInfo, dealsInfoPrevMounth, dopsInfo, dopsInfoPrevMounth } =
      await this.getManagerSalesDatas(m.id, period);
    const dealPays = +dealsInfo.reduce((a, b) => a + b.toSalary, 0).toFixed(2);
    const dopPays = +dopsInfo.reduce((a, b) => a + b.toSalary, 0).toFixed(2);
    const prevPeriodsDealsPays = +dealsInfoPrevMounth
      .reduce((a, b) => a + b.toSalary, 0)
      .toFixed(2);
    const prevPeriodsDopsPays = +dopsInfoPrevMounth
      .reduce((a, b) => a + b.toSalary, 0)
      .toFixed(2);
    const { pays, salaryPays, salaryCorrections, shift, shiftBonus } =
      await this.getManagerSalaryDatas(m.id, period);
    const isIntern = m.managerReports.find((r) => r.isIntern === true)
      ? true
      : false;
    const { bonusPercentage, bonus, dopsPercentage } = this.getBonusPercentage(
      totalSales,
      m.workSpaceId,
      m.groupId,
      isIntern,
      m.role.shortName,
      period,
    );
    let totalSalary = 0;

    const salaryCorrectionMinus = salaryCorrections
      .filter((c) => c.type === 'Вычет')
      .reduce((a, b) => a + b.price, 0);
    const salaryCorrectionPlus = salaryCorrections
      .filter((s) => s.type === 'Прибавка')
      .reduce((a, b) => a + b.price, 0);
    const groupPlanBonus =
      isOverRopPlan &&
      m.deletedAt === null &&
      (m.groupId === 3 || m.groupId === 2)
        ? 3000
        : 0;
    const topBonus =
      tops.find((m) => m.id === managerId && m.groupId === 3)?.topBonus ?? 0;
    totalSalary +=
      salaryCorrectionPlus -
      salaryCorrectionMinus +
      prevPeriodsDealsPays +
      prevPeriodsDopsPays +
      bonus +
      dealPays +
      dopPays +
      shiftBonus +
      groupPlanBonus +
      topBonus +
      factBonus;

    const dodatas =
      managerId === 21 ? await this.getDOSalesDatas(m.workSpaceId, period) : [];
    // console.log(dodatas);
    const doSalary = dodatas.reduce((a, b) => a + b.toSalary, 0);
    totalSalary += doSalary;

    return {
      fullName: m.fullName,
      role: m.role.fullName,
      id: m.id,
      workSpace: m.workSpace.title,
      group: m.group.title,
      dodatas,

      plan: m.managersPlans[0]?.plan ?? 0,
      totalSales,
      dealsAmount,
      dealSales,
      dopsAmount,
      dopSales,
      fact,
      factAmount,
      factPercentage,
      factBonus,
      temp,

      // Показатели
      averageBill: averageBill,
      drr: drr,
      calls: calls,
      conversionDealsToCalls: conversionDealsToCalls,
      conversionMaketsToCalls: conversionMaketsToCalls,
      makets: makets,
      conversionMaketsToSales: conversionMaketsToSales,
      maketsDayToDay: maketsDayToDay,
      conversionMaketsDayToDayToCalls: conversionMaketsDayToDayToCalls,
      dealsDayToDay: dealsDayToDay.length,
      dealsDayToDayPrice: dealsDayToDayPrice,
      dealsWithoutDesigners: dealsWithoutDesigners.length,
      dealsSalesWithoutDesigners: dealsSalesWithoutDesigners,
      redirectToMSG: redirectToMSG,

      pays,
      salaryPays,
      salaryCorrections,
      shift,
      shiftBonus,

      bonusPercentage,
      bonus,
      dopsPercentage,

      dopPays,
      dealPays,
      topBonus,
      totalSalary,
      doSalary,
      rem: 0,

      dealsInfo: dealsInfo.sort((a, b) => a.id - b.id),
      // .filter((d) => d.toSalary > 0),
      dealsInfoPrevMounth: dealsInfoPrevMounth.sort((a, b) => a.id - b.id),
      // .filter((d) => d.toSalary > 0),
      dopsInfo: dopsInfo.sort((a, b) => a.dealId - b.dealId),
      // .filter((d) => d.toSalary > 0),
      dopsInfoPrevMounth: dopsInfoPrevMounth.sort(
        (a, b) => a.dealId - b.dealId,
      ),
      // .filter((d) => d.toSalary > 0),
      prevPeriodsDealsPays,
      prevPeriodsDopsPays,

      reports: m.managerReports,

      groupId: m.groupId,
      isIntern: m.isIntern,
      fired: m.deletedAt ? true : false,
    };
  }
  /** get /commercial-datas/tops/:groupId?period */
  async getManagerGroupDatas(groupId: number, period: string) {
    console.log(groupId, period);
    if (groupId === 18 || groupId === 3) {
      const groups = await this.prisma.group.findMany({
        where: {
          id: { in: [3, 18] },
          users: {
            some: {},
          },
        },
        include: {
          adExpenses: {
            where: {
              date: {
                startsWith: period,
              },
            },
          },
          users: {
            include: {
              managerReports: {
                where: {
                  date: {
                    startsWith: period,
                  },
                },
              },
              dealSales: {
                where: {
                  deal: {
                    saleDate: {
                      startsWith: period,
                    },
                    reservation: false,
                    deletedAt: null,
                    status: { not: 'Возврат' },
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
                  deal: {
                    reservation: false,
                    deletedAt: null,
                    status: { not: 'Возврат' },
                  },
                },
              },
            },
          },
          deals: {
            where: {
              saleDate: {
                startsWith: period,
              },
              reservation: false,
              deletedAt: null,
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
                deletedAt: null,
                status: { not: 'Возврат' },
              },
            },
          },
        },
      });
      const adExpenses = groups
        .flatMap((g) => g.adExpenses)
        .reduce((a, b) => a + b.price, 0);
      /** количество заявок проекта*/
      const totalCalls = groups
        .flatMap((g) => g.users)
        .flatMap((u) => u.managerReports)
        .reduce((a, b) => a + b.calls, 0);
      /** стоимость заявки в проекте*/
      const callCost = totalCalls ? adExpenses / totalCalls : 0;

      const ropPlan = await this.prisma.managersPlan.findFirst({
        where: {
          period,
          user: {
            role: {
              shortName: 'DO',
            },
            fullName: { in: ['Юлия Куштанова'] },
          },
        },
        include: {
          user: true,
        },
      });

      let isOverRopPlan = false;
      const ropPlanValue = ropPlan?.plan || 0;
      const groupDealSales = groups
        .flatMap((g) => g.deals)
        .reduce((acc, d) => acc + d.price, 0);
      const groupDopSales = groups
        .flatMap((g) => g.dops)
        .reduce((acc, d) => acc + d.price, 0);
      const groupTotalSales = groupDealSales + groupDopSales;

      if (groupTotalSales > ropPlanValue && ropPlanValue > 0) {
        isOverRopPlan = true;
      }
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
      const userData = groups
        .flatMap((g) => g.users)
        .map((m) => {
          const dealSales = m.dealSales.reduce((a, b) => a + b.price, 0);
          const dopSales = m.dops.reduce((a, b) => a + b.price, 0);
          const totalSales = dealSales + dopSales;
          const shift = m.managerReports.length;
          const dealsAmount = m.dealSales.length;
          const averageBill = dealsAmount
            ? +(totalSales / dealsAmount).toFixed()
            : 0;
          const dimmerSales = m.dops
            .filter((d) => d.type === 'Диммер')
            .reduce((a, b) => a + b.price, 0);
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
          const dealsDayToDay = m.dealSales.filter(
            (ds) => ds.deal.saleDate === ds.deal.client.firstContact,
          );
          const calls = m.managerReports.reduce((a, b) => a + b.calls, 0);
          const conversionDayToDay = calls
            ? +((dealsDayToDay.length / calls) * 100).toFixed(2)
            : 0;
          // Конверсия
          const conversion = calls
            ? +((dealsAmount / calls) * 100).toFixed(2)
            : 0;
          return {
            id: m.id,
            fullName: m.fullName,
            groupId: m.groupId,
            workSpaceId: m.workSpaceId,
            totalSales,
            shift,
            topBonus: 0,
            dopSales,
            dimmerSales,
            dealsSalesWithoutDesigners,
            conversionDayToDay,
            dealSales,
            averageBill,
            conversion,
          };
        });
      // Определение топов
      const topTotalSales = [...userData]
        .filter((u) => u.workSpaceId === 3 && u.groupId !== 19)
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            if (user.shift > 12) {
              user.topBonus += (-i + 3) * 1000;
            }
            vkTop.topTotalSales.push({
              user: u.fullName,
              sales: u.totalSales,
            });
          }
        });

      const topDopSales = [...userData]
        .filter((u) => u.workSpaceId === 3 && u.groupId !== 19)
        .sort((a, b) => b.dopSales - a.dopSales)
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            if (user.shift > 12) {
              user.topBonus += (-i + 3) * 1000;
            }
            vkTop.topDopSales.push({
              user: u.fullName,
              sales: u.dopSales,
            });
          }
        });
      const topDimmerSales = [...userData]
        .filter((u) => u.workSpaceId === 3 && u.groupId !== 19)
        .sort((a, b) => b.dimmerSales - a.dimmerSales)
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            if (user.shift > 12) {
              user.topBonus += (-i + 3) * 1000;
            }
            vkTop.topDimmerSales.push({
              user: u.fullName,
              sales: u.dimmerSales,
            });
          }
        });
      const topSalesWithoutDesigners = [...userData]
        .filter((u) => u.workSpaceId === 3 && u.groupId !== 19)
        .sort(
          (a, b) => b.dealsSalesWithoutDesigners - a.dealsSalesWithoutDesigners,
        )
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            if (user.shift > 12) {
              user.topBonus += (-i + 3) * 1000;
            }
            vkTop.topSalesWithoutDesigners.push({
              user: u.fullName,
              sales: u.dealsSalesWithoutDesigners,
            });
          }
        });
      const topConversionDayToDay = [...userData]
        .filter((u) => u.workSpaceId === 3 && u.groupId !== 19)
        .sort((a, b) => b.conversionDayToDay - a.conversionDayToDay)
        .slice(0, 3)
        .map((u, i) => {
          const user = userData.find((us) => us.id === u.id)!;
          if (user.totalSales !== 0) {
            if (user.shift > 12) {
              user.topBonus += (-i + 3) * 1000;
            }
            vkTop.topConversionDayToDay.push({
              user: u.fullName,
              sales: u.conversionDayToDay,
            });
          }
        });
      return {
        adExpenses,
        totalCalls,
        callCost,
        isOverRopPlan,
        tops: userData.filter((u) => u.topBonus > 0),
        vkTop,
        b2bTop: [],
      };
    }
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        users: {
          some: {},
        },
      },
      include: {
        adExpenses: {
          where: {
            date: {
              startsWith: period,
            },
          },
        },
        users: {
          include: {
            managerReports: {
              where: {
                date: {
                  startsWith: period,
                },
              },
            },
            dealSales: {
              where: {
                deal: {
                  saleDate: {
                    startsWith: period,
                  },
                  reservation: false,
                  deletedAt: null,
                  status: { not: 'Возврат' },
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
                deal: {
                  reservation: false,
                  deletedAt: null,
                  status: { not: 'Возврат' },
                },
              },
            },
          },
        },
        deals: {
          where: {
            saleDate: {
              startsWith: period,
            },
            reservation: false,
            deletedAt: null,
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
              deletedAt: null,
              status: { not: 'Возврат' },
            },
          },
        },
      },
    });
    if (!group) {
      throw new NotFoundException('Группа не найдена');
    }
    const adExpenses = group.adExpenses.reduce((a, b) => a + b.price, 0);
    /** количество заявок проекта*/
    const totalCalls = group.users
      .flatMap((u) => u.managerReports)
      .reduce((a, b) => a + b.calls, 0);
    /** стоимость заявки в проекте*/
    const callCost = totalCalls ? adExpenses / totalCalls : 0;

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

    let isOverRopPlan = false;
    const ropPlanValue =
      ropPlan.find((p) => p.user.workSpaceId === group.workSpaceId)?.plan || 0;
    const groupDealSales = group.deals.reduce((acc, d) => acc + d.price, 0);
    const groupDopSales = group.dops.reduce((acc, d) => acc + d.price, 0);
    const groupTotalSales = groupDealSales + groupDopSales;

    if (groupTotalSales > ropPlanValue && ropPlanValue > 0) {
      isOverRopPlan = true;
    }

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
    const userData = group.users.map((m) => {
      const dealSales = m.dealSales.reduce((a, b) => a + b.price, 0);
      const dopSales = m.dops.reduce((a, b) => a + b.price, 0);
      const totalSales = dealSales + dopSales;
      const shift = m.managerReports.length;
      const dealsAmount = m.dealSales.length;
      const averageBill = dealsAmount
        ? +(totalSales / dealsAmount).toFixed()
        : 0;
      const dimmerSales = m.dops
        .filter((d) => d.type === 'Диммер')
        .reduce((a, b) => a + b.price, 0);
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
      const dealsDayToDay = m.dealSales.filter(
        (ds) => ds.deal.saleDate === ds.deal.client.firstContact,
      );
      const calls = m.managerReports.reduce((a, b) => a + b.calls, 0);
      const conversionDayToDay = calls
        ? +((dealsDayToDay.length / calls) * 100).toFixed(2)
        : 0;
      // Конверсия
      const conversion = calls ? +((dealsAmount / calls) * 100).toFixed(2) : 0;
      return {
        id: m.id,
        fullName: m.fullName,
        groupId: m.groupId,
        workSpaceId: m.workSpaceId,
        totalSales,
        shift,
        topBonus: 0,
        dopSales,
        dimmerSales,
        dealsSalesWithoutDesigners,
        conversionDayToDay,
        dealSales,
        averageBill,
        conversion,
      };
    });
    // Определение топов
    const topTotalSales = [...userData]
      .filter((u) => u.workSpaceId === 3 && u.groupId !== 19)
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 3)
      .map((u, i) => {
        const user = userData.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          if (user.shift > 12) {
            user.topBonus += (-i + 3) * 1000;
          }
          vkTop.topTotalSales.push({
            user: u.fullName,
            sales: u.totalSales,
          });
        }
      });

    const topDopSales = [...userData]
      .filter((u) => u.workSpaceId === 3 && u.groupId !== 19)
      .sort((a, b) => b.dopSales - a.dopSales)
      .slice(0, 3)
      .map((u, i) => {
        const user = userData.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          if (user.shift > 12) {
            user.topBonus += (-i + 3) * 1000;
          }
          vkTop.topDopSales.push({
            user: u.fullName,
            sales: u.dopSales,
          });
        }
      });
    const topDimmerSales = [...userData]
      .filter((u) => u.workSpaceId === 3 && u.groupId !== 19)
      .sort((a, b) => b.dimmerSales - a.dimmerSales)
      .slice(0, 3)
      .map((u, i) => {
        const user = userData.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          if (user.shift > 12) {
            user.topBonus += (-i + 3) * 1000;
          }
          vkTop.topDimmerSales.push({
            user: u.fullName,
            sales: u.dimmerSales,
          });
        }
      });
    const topSalesWithoutDesigners = [...userData]
      .filter((u) => u.workSpaceId === 3 && u.groupId !== 19)
      .sort(
        (a, b) => b.dealsSalesWithoutDesigners - a.dealsSalesWithoutDesigners,
      )
      .slice(0, 3)
      .map((u, i) => {
        const user = userData.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          if (user.shift > 12) {
            user.topBonus += (-i + 3) * 1000;
          }
          vkTop.topSalesWithoutDesigners.push({
            user: u.fullName,
            sales: u.dealsSalesWithoutDesigners,
          });
        }
      });
    const topConversionDayToDay = [...userData]
      .filter((u) => u.workSpaceId === 3 && u.groupId !== 19)
      .sort((a, b) => b.conversionDayToDay - a.conversionDayToDay)
      .slice(0, 3)
      .map((u, i) => {
        const user = userData.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          if (user.shift > 12) {
            user.topBonus += (-i + 3) * 1000;
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
      .filter((u) => u.workSpaceId === 2)
      .sort((a, b) => b.dealSales - a.dealSales)
      .slice(0, 1)
      .map((u, i) => {
        const user = userData.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          if (user.shift > 12) {
            u.topBonus += 2000;
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
      .filter((u) => u.workSpaceId === 2)

      .sort((a, b) => b.dopSales - a.dopSales)
      .slice(0, 1)
      .map((u, i) => {
        const user = userData.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          if (user.shift > 12) {
            u.topBonus += 2000;
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
      .filter((u) => u.workSpaceId === 2)

      .sort((a, b) => b.averageBill - a.averageBill)
      .slice(0, 1)
      .map((u, i) => {
        const user = userData.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          if (user.shift > 12) {
            u.topBonus += 2000;
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
      .filter((u) => u.workSpaceId === 2)

      .sort((a, b) => b.conversion - a.conversion)
      .slice(0, 1)
      .map((u, i) => {
        const user = userData.find((us) => us.id === u.id)!;
        if (user.totalSales !== 0) {
          if (user.shift > 12) {
            u.topBonus += 2000;
          }
          b2bTop.push({
            user: u.fullName,
            sales: u.conversion,
            category: 'Топ конверсия',
          });
        }
      });
    // console.log(userData.filter((u) => u.topBonus > 0));
    return {
      adExpenses,
      totalCalls,
      callCost,
      isOverRopPlan,
      tops: userData.filter((u) => u.topBonus > 0),
      vkTop,
      b2bTop,
    };
  }
  /** get /commercial-datas/groups */
  async getGroups(user: UserDto) {
    const workspacesSearch =
      user.role.department === 'administration' || user.role.shortName === 'KD'
        ? { gt: 0 }
        : user.workSpaceId;

    const groupsSearch = ['MOP', 'MOV'].includes(user.role.shortName)
      ? user.groupId
      : { gt: 0 };
    const groups = await this.prisma.group.findMany({
      where: {
        id: groupsSearch,
        workSpaceId: workspacesSearch,
        workSpace: {
          department: 'COMMERCIAL',
        },
        users: {
          some: {},
        },
      },
    });
    if (!groups || groups.length === 0) {
      throw new NotFoundException('Группы не найдены.');
    }
    return groups;
  }
  /** get /commercial-datas */
  async getManagersDatas(user: UserDto, period: string, groupId?: number) {
    console.log('getManagersDatas', period, groupId);
    const workspacesSearch =
      user.role.department === 'administration' || user.role.shortName === 'KD'
        ? { gt: 0 }
        : user.workSpaceId;

    const groupsSearch = ['MOP', 'MOV'].includes(user.role.shortName)
      ? user.groupId
      : { gt: 0 };
    const where: any = {
      role: {
        shortName: {
          in:
            user.role.shortName === 'MOP'
              ? ['MOP']
              : user.role.shortName === 'ROP'
                ? ['MOP', 'ROP']
                : ['DO', 'MOP', 'ROP', 'MOV'],
        },
      },
      workSpaceId: workspacesSearch,
      groupId: groupsSearch,
    };

    if (groupId !== undefined) {
      where.groupId = groupId;
    }

    const managers = await this.prisma.user.findMany({
      where,
      include: {
        role: true,
        workSpace: true,
        group: true,
        dealSales: {
          where: {
            deal: {
              saleDate: {
                startsWith: period,
              },
              reservation: false,
              deletedAt: null,
              status: { not: 'Возврат' },
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
              deletedAt: null,
              status: { not: 'Возврат' },
            },
          },
        },
        managersPlans: {
          where: {
            period,
          },
        },
        managerReports: {
          where: {
            period,
          },
        },
        payments: {
          where: {
            date: {
              startsWith: period,
            },
            deal: {
              reservation: false,
              deletedAt: null,
              status: { not: 'Возврат' },
            },
          },
        },
      },
    });
    const adExpenseWhere: any = {
      date: {
        startsWith: period,
      },
    };

    if (groupId !== undefined) {
      adExpenseWhere.groupId = groupId;
    }

    const groupAdExpenses = await this.prisma.adExpense.findMany({
      where: adExpenseWhere,
    });
    const adExpenses = groupAdExpenses.reduce((a, b) => a + b.price, 0);
    const totalCalls = managers
      .flatMap((u) => u.managerReports)
      .reduce((a, b) => a + b.calls, 0);
    const callCost = totalCalls ? adExpenses / totalCalls : 0;

    const res = managers
      .map((m) => {
        const dealSales = m.dealSales.reduce((a, b) => a + b.price, 0);
        const dealsAmount = m.dealSales.length;
        const dopSales = m.dops.reduce((a, b) => a + b.price, 0);
        const totalSales = dealSales + dopSales;
        const averageBill = dealsAmount
          ? +(totalSales / dealsAmount).toFixed()
          : 0;
        const calls = m.managerReports.reduce((a, b) => a + b.calls, 0);
        const drr = totalSales
          ? +(((calls * callCost) / totalSales) * 100).toFixed(2)
          : 0;
        const conversionDealsToCalls = calls
          ? +((dealsAmount / calls) * 100).toFixed(2)
          : 0;
        return {
          fullName: m.fullName,
          role: m.role.fullName,
          id: m.id,
          workSpace: m.workSpace.title,
          group: m.group.title,
          totalSales,
          dealSales,
          dopSales,
          averageBill,
          drr,
          conversionDealsToCalls,
          groupId: m.groupId,
          fired: m.deletedAt ? true : false,
          fact:
            m.role.shortName === 'MOV'
              ? m.payments.reduce((a, b) => a + b.price, 0)
              : 0,
        };
      })
      .sort((a, b) => b.totalSales - a.totalSales);
    //   .filter((u) => u.totalSales || !u.fired);
    // console.log(res.reduce((a, b) => a + b.dealSales, 0));
    return res;
  }
  /** get /commercial-datas/:managerId */
  async getManagerDatas(user: UserDto, period: string, managerId: number) {
    const m = await this.prisma.user.findUnique({
      where: {
        id: managerId,
      },
      include: {
        role: {
          select: {
            shortName: true,
          },
        },
      },
    });
    if (!m) {
      throw new NotFoundException('Manager not found');
    }
    return await this.getMopDatas(user, period, managerId);
    // if (['MOV', 'MOP'].includes(m.role.shortName)) {
    // } else if (['DO'].includes(m.role.shortName)) {
    //   return await this.getDODatas(user, period, managerId);
    // } else if (['ROP'].includes(m.role.shortName)) {
    //   return await this.getRopDatas(user, period, managerId);
    // } else {
    //   throw new NotFoundException('Данных нет.');
    // }
  }

  /** /commercial-datas/statistics/:groupId */
  async getStat(user: UserDto, period: string, groupId: number) {
    function getDaysInMonth(year: number, month: number): number {
      return new Date(year, month, 0).getDate();
    }

    const group = await this.prisma.group.findUnique({
      where: {
        deletedAt: null,
        workSpace: {
          department: 'COMMERCIAL',
        },
        deals: {
          some: {},
        },
        id: groupId,
      },
      include: {
        workSpace: true,
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
              deletedAt: null,
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
                  deletedAt: null,
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
        // deliveries: {
        //   where: {
        //     date: {
        //       startsWith: period,
        //     },
        //     deal: {
        //       status: { not: 'Возврат' },
        //       reservation: false,
        //     },
        //   },
        //   include: {
        //     deal: {
        //       include: {
        //         dops: true,
        //       },
        //     },
        //   },
        // },
      },
    });

    if (!group) {
      throw new NotFoundException('Группа не найдена.');
    }

    //доставки заказов группы
    const groupDeliveries = await this.prisma.delivery.findMany({
      where: {
        date: {
          startsWith: period,
        },
        deal: {
          status: { not: 'Возврат' },
          reservation: false,
          deletedAt: null,
          groupId,
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

    //отправленные доставки
    const sendDeliveries = await this.prisma.delivery.findMany({
      where: {
        date: {
          startsWith: period,
        },
        status: 'Отправлена',
        deal: {
          status: { not: 'Возврат' },
          reservation: false,
          deletedAt: null,
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
    //доставленные
    const deliveredDeliveries = await this.prisma.delivery.findMany({
      where: {
        deliveredDate: {
          startsWith: period,
        },
        status: 'Вручена',
        deal: {
          status: { not: 'Возврат' },
          reservation: false,
          deletedAt: null,
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

    const title = group.title;
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
      dealsAmount: group.deals.length,
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
      users: group.users.map((u) => {
        return {
          id: u.id,
          fullName: u.fullName,
          workSpace: group.workSpace.title,
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

    // источники рекламы
    group.adSources.map((ds) => {
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
      data.adExpenses.sort((a, b) => b.sales - a.sales);
    });

    // Считаем сумму сделок
    group.deals.map((deal) => {
      const day = deal.saleDate.slice(8, 10);
      const index = data.chartData.findIndex((d) => d.name === day);
      data.chartData[index]['Сделки'] += deal.price;
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
      }
      if (deal.saleDate === deal.client.firstContact) {
        data.dealsDayToDay += 1;
        data.dealsDayToDayPrice += deal.price + dopsPrice;
      }

      deal.dealers.map((dealer) => {
        const userIndex = data.users.findIndex((u) => u.id === dealer.userId);
        // console.log(userIndex);
        if (userIndex !== -1) {
          data.users[userIndex].sales += dealer.price;
        }
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

      //adtags
      if (!data.adTags.find((s) => s.name === deal.adTag)) {
        data.adTags.push({ name: deal.adTag, sales: deal.price + dopsPrice });
      } else {
        const adTagIndex = data.adTags.findIndex((s) => s.name === deal.adTag);
        data.adTags[adTagIndex].sales += deal.price + dopsPrice;
      }

      data.sources.sort((a, b) => b.sales - a.sales);
      data.adTags.sort((a, b) => b.sales - a.sales);
      data.maketsSales.sort((a, b) => b.sales - a.sales);
    });

    // доставки
    data.sendDeliveriesPrice = sendDeliveries
      .filter((d) => d.workSpaceId === group.workSpaceId)
      .reduce(
        (acc, d) =>
          acc + (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
        0,
      );
    data.deliveredDeliveriesPrice = deliveredDeliveries
      .filter((d) => d.workSpaceId === group.workSpaceId)
      .reduce(
        (acc, d) =>
          acc + (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
        0,
      );

    data.sendDeliveries = sendDeliveries.length;
    data.deliveredDeliveries = deliveredDeliveries.length;
    data.freeDeliveries = groupDeliveries.filter(
      (d) => d.type === 'Бесплатно',
    ).length;
    data.freeDeliveriesPrice = groupDeliveries
      .filter((d) => d.type === 'Бесплатно')
      .reduce((a, b) => a + b.price, 0);

    const adExpensesPrice = group.adExpenses.reduce((acc, item) => {
      return acc + item.price;
    }, 0);
    data.adExpensesPrice = adExpensesPrice;

    // Считаем заявки
    group.reports.map((r) => {
      const day = r.date.slice(8, 10);
      const index = data.callsChartData.findIndex((d) => d.name === day);
      // console.log(data.callsChartData[index]['ВК']);
      data.callsChartData[index][group.title] += r.calls;
      data.calls += r.calls;
      data.makets += r.makets;
      data.maketsDayToDay += r.maketsDayToDay;
      data.redirectToMSG += r.redirectToMSG;
    });

    group.dops.map((dop) => {
      const day = dop.saleDate.slice(8, 10);
      const index = data.chartData.findIndex((d) => d.name === day);
      data.chartData[index]['Допы'] += dop.price;
      data.dopSales += dop.price;
      data.dopsAmount += 1;
      data.totalSales += dop.price;
      const userIndex = data.users.findIndex((u) => u.id === dop.userId);
      data.users[userIndex].sales += dop.price;
    });

    group.users.map((user) => {
      if (user.role.shortName === 'DO') {
        // console.log(user);
        data.plan = user.managersPlans[0]?.plan || 0;
      }
    });

    // w.payments.map((payment) => {
    //   data.receivedPayments += payment.price;
    //   fullData.receivedPayments += payment.price;
    // });

    data.receivedPayments += group.deals
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
  }

  /** /commercial-datas/statistics - статистика по всем группам */
  async getStatAllGroups(user: UserDto, period: string, groupId?: number) {
    // Получаем все группы
    const workspacesSearch = ['G', 'KD', 'ADMIN'].includes(user.role.shortName)
      ? { gt: 0 }
      : user.workSpaceId;
    const groups = await this.prisma.group.findMany({
      where: {
        deletedAt: null,
        workSpace: {
          department: 'COMMERCIAL',
        },
        id: groupId ? groupId : { gt: 0 },
        workSpaceId: workspacesSearch,
        deals: {
          some: {},
        },
      },
      include: {
        workSpace: true,
      },
    });

    if (groups.length === 0) {
      throw new NotFoundException('Группы не найдены.');
    }

    // Получаем данные для каждой группы
    const groupsDataPromises = groups.map(async (group) => {
      return this.processGroupForAllGroups(group.id, period);
    });

    const groupsData = await Promise.all(groupsDataPromises);

    // Агрегируем данные
    return this.aggregateAllGroupsData(groupsData, period);
  }

  private async processGroupForAllGroups(
    groupId: number,
    period: string,
  ): Promise<WorkSpaceData> {
    function getDaysInMonth(year: number, month: number): number {
      return new Date(year, month, 0).getDate();
    }

    const group = await this.prisma.group.findUnique({
      where: {
        id: groupId,
      },
      include: {
        workSpace: true,
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
        dops: {
          where: {
            saleDate: {
              startsWith: period,
            },
            deal: {
              reservation: false,
              status: { not: 'Возврат' },
              deletedAt: null,
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
              deletedAt: null,
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
                  deletedAt: null,
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

    if (!group) {
      throw new NotFoundException('Группа не найдена.');
    }

    // Доставки заказов группы
    const groupDeliveries = await this.prisma.delivery.findMany({
      where: {
        date: {
          startsWith: period,
        },
        deal: {
          status: { not: 'Возврат' },
          reservation: false,
          deletedAt: null,
          groupId,
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

    // Отправленные доставки
    const sendDeliveries = await this.prisma.delivery.findMany({
      where: {
        date: {
          startsWith: period,
        },
        status: 'Отправлена',
        deal: {
          status: { not: 'Возврат' },
          reservation: false,
          deletedAt: null,
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

    // Доставленные
    const deliveredDeliveries = await this.prisma.delivery.findMany({
      where: {
        deliveredDate: {
          startsWith: period,
        },
        status: 'Вручена',
        deal: {
          status: { not: 'Возврат' },
          reservation: false,
          deletedAt: null,
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

    const title = group.title;
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
      dealsAmount: group.deals.length,
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
      users: group.users.map((u) => {
        return {
          id: u.id,
          fullName: u.fullName,
          workSpace: group.workSpace.title,
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

    // Источники рекламы
    group.adSources.map((ds) => {
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
      data.adExpenses.sort((a, b) => b.sales - a.sales);
    });

    // Считаем сумму сделок
    group.deals.map((deal) => {
      const day = deal.saleDate.slice(8, 10);
      const index = data.chartData.findIndex((d) => d.name === day);
      data.chartData[index]['Сделки'] += deal.price;
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
      }
      if (deal.saleDate === deal.client.firstContact) {
        data.dealsDayToDay += 1;
        data.dealsDayToDayPrice += deal.price + dopsPrice;
      }

      deal.dealers.map((dealer) => {
        const userIndex = data.users.findIndex((u) => u.id === dealer.userId);
        if (userIndex !== -1) {
          data.users[userIndex].sales += dealer.price;
        }
      });

      const maketIndex = data.maketsSales.findIndex(
        (m) => m.name === deal.maketType,
      );
      data.maketsSales[maketIndex].sales += deal.price + dopsPrice;
      data.maketsSales[maketIndex].amount += 1;

      // Sources
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

      // AdTags
      if (!data.adTags.find((s) => s.name === deal.adTag)) {
        data.adTags.push({ name: deal.adTag, sales: deal.price + dopsPrice });
      } else {
        const adTagIndex = data.adTags.findIndex((s) => s.name === deal.adTag);
        data.adTags[adTagIndex].sales += deal.price + dopsPrice;
      }

      data.sources.sort((a, b) => b.sales - a.sales);
      data.adTags.sort((a, b) => b.sales - a.sales);
      data.maketsSales.sort((a, b) => b.sales - a.sales);
    });

    // Доставки
    data.sendDeliveriesPrice = sendDeliveries
      .filter((d) => d.workSpaceId === group.workSpaceId)
      .reduce(
        (acc, d) =>
          acc + (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
        0,
      );
    data.deliveredDeliveriesPrice = deliveredDeliveries
      .filter((d) => d.workSpaceId === group.workSpaceId)
      .reduce(
        (acc, d) =>
          acc + (d.deal.price + d.deal.dops.reduce((a, b) => a + b.price, 0)),
        0,
      );

    data.sendDeliveries = sendDeliveries.length;
    data.deliveredDeliveries = deliveredDeliveries.length;
    data.freeDeliveries = groupDeliveries.filter(
      (d) => d.type === 'Бесплатно',
    ).length;
    data.freeDeliveriesPrice = groupDeliveries
      .filter((d) => d.type === 'Бесплатно')
      .reduce((a, b) => a + b.price, 0);

    const adExpensesPrice = group.adExpenses.reduce((acc, item) => {
      return acc + item.price;
    }, 0);
    data.adExpensesPrice = adExpensesPrice;

    // Считаем заявки
    group.reports.map((r) => {
      const day = r.date.slice(8, 10);
      const index = data.callsChartData.findIndex((d) => d.name === day);
      data.callsChartData[index][group.title] += r.calls;
      data.calls += r.calls;
      data.makets += r.makets;
      data.maketsDayToDay += r.maketsDayToDay;
      data.redirectToMSG += r.redirectToMSG;
    });

    group.dops.map((dop) => {
      const day = dop.saleDate.slice(8, 10);
      const index = data.chartData.findIndex((d) => d.name === day);
      data.chartData[index]['Допы'] += dop.price;
      data.dopSales += dop.price;
      data.dopsAmount += 1;
      data.totalSales += dop.price;
      const userIndex = data.users.findIndex((u) => u.id === dop.userId);
      if (userIndex !== -1) {
        data.users[userIndex].sales += dop.price;
      }
    });

    group.users.map((user) => {
      if (user.role.shortName === 'DO') {
        data.plan = user.managersPlans[0]?.plan || 0;
      }
    });

    data.receivedPayments += group.payments.reduce((a, b) => a + b.price, 0);

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

    data.callCost = data.calls
      ? +(data.adExpensesPrice / data.calls).toFixed(2)
      : 0;
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

    const daysInMonth = getDaysInMonth(
      +period.split('-')[0],
      +period.split('-')[1],
    );
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
  }

  private aggregateAllGroupsData(
    groupsData: WorkSpaceData[],
    period: string,
  ): WorkSpaceData {
    function getDaysInMonth(year: number, month: number): number {
      return new Date(year, month, 0).getDate();
    }

    const aggregated: WorkSpaceData = {
      workSpaceName: 'Все группы',
      chartData: Array.from({ length: 31 }, (_, i) => ({
        name: String(i + 1).padStart(2, '0'),
        ['Сделки']: 0,
        ['Допы']: 0,
      })),
      callsChartData: Array.from({ length: 31 }, (_, i) => ({
        name: String(i + 1).padStart(2, '0'),
        ['ВК']: 0,
        ['B2B']: 0,
      })),
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

    // Агрегируем данные всех групп
    groupsData.forEach((groupData) => {
      // Агрегируем chartData
      groupData.chartData.forEach((item, index) => {
        if (aggregated.chartData[index]) {
          aggregated.chartData[index]['Сделки'] += item['Сделки'];
          aggregated.chartData[index]['Допы'] += item['Допы'];
        }
      });

      // Агрегируем callsChartData - суммируем все значения по ключам
      groupData.callsChartData.forEach((item, index) => {
        if (aggregated.callsChartData[index]) {
          Object.keys(item).forEach((key) => {
            if (key !== 'name' && typeof item[key] === 'number') {
              if (aggregated.callsChartData[index][key] === undefined) {
                aggregated.callsChartData[index][key] = 0;
              }
              aggregated.callsChartData[index][key] += item[key];
            }
          });
        }
      });

      // Суммируем числовые значения
      aggregated.plan += groupData.plan;
      aggregated.dealsSales += groupData.dealsSales;
      aggregated.totalSales += groupData.totalSales;
      aggregated.dealsAmount += groupData.dealsAmount;
      aggregated.dopSales += groupData.dopSales;
      aggregated.dopsAmount += groupData.dopsAmount;
      aggregated.receivedPayments += groupData.receivedPayments;
      aggregated.calls += groupData.calls;
      aggregated.adExpensesPrice += groupData.adExpensesPrice;
      aggregated.dealsWithoutDesigners += groupData.dealsWithoutDesigners;
      aggregated.dealsSalesWithoutDesigners +=
        groupData.dealsSalesWithoutDesigners;
      aggregated.makets += groupData.makets;
      aggregated.maketsDayToDay += groupData.maketsDayToDay;
      aggregated.redirectToMSG += groupData.redirectToMSG;
      aggregated.dealsDayToDay += groupData.dealsDayToDay;
      aggregated.dealsDayToDayPrice += groupData.dealsDayToDayPrice;
      aggregated.sendDeliveries += groupData.sendDeliveries;
      aggregated.freeDeliveries += groupData.freeDeliveries;
      aggregated.freeDeliveriesPrice += groupData.freeDeliveriesPrice;
      aggregated.sendDeliveriesPrice += groupData.sendDeliveriesPrice;
      aggregated.deliveredDeliveriesPrice += groupData.deliveredDeliveriesPrice;
      aggregated.deliveredDeliveries += groupData.deliveredDeliveries;

      // Агрегируем maketsSales
      groupData.maketsSales.forEach((maket) => {
        const maketIndex = aggregated.maketsSales.findIndex(
          (m) => m.name === maket.name,
        );
        if (maketIndex !== -1) {
          aggregated.maketsSales[maketIndex].sales += maket.sales;
          aggregated.maketsSales[maketIndex].amount += maket.amount;
        }
      });

      // Агрегируем sources
      groupData.sources.forEach((source) => {
        const sourceIndex = aggregated.sources.findIndex(
          (s) => s.name === source.name,
        );
        if (sourceIndex !== -1) {
          aggregated.sources[sourceIndex].sales += source.sales;
        } else {
          aggregated.sources.push({ ...source });
        }
      });

      // Агрегируем adTags
      groupData.adTags.forEach((adTag) => {
        const adTagIndex = aggregated.adTags.findIndex(
          (s) => s.name === adTag.name,
        );
        if (adTagIndex !== -1) {
          aggregated.adTags[adTagIndex].sales += adTag.sales;
        } else {
          aggregated.adTags.push({ ...adTag });
        }
      });

      // Агрегируем adExpenses
      groupData.adExpenses.forEach((adExpense) => {
        const adExpenseIndex = aggregated.adExpenses.findIndex(
          (e) => e.name === adExpense.name,
        );
        if (adExpenseIndex !== -1) {
          aggregated.adExpenses[adExpenseIndex].sales += adExpense.sales;
        } else {
          aggregated.adExpenses.push({ ...adExpense });
        }
      });

      // Агрегируем пользователей
      groupData.users.forEach((user) => {
        const userIndex = aggregated.users.findIndex((u) => u.id === user.id);
        if (userIndex !== -1) {
          aggregated.users[userIndex].sales += user.sales;
        } else {
          aggregated.users.push({ ...user });
        }
      });
    });

    // Вычисляем производные значения
    aggregated.dopsToSales = aggregated.totalSales
      ? +((aggregated.dopSales / aggregated.totalSales) * 100).toFixed()
      : 0;
    aggregated.averageBill = aggregated.dealsAmount
      ? +(aggregated.dealsSales / aggregated.dealsAmount).toFixed()
      : 0;
    aggregated.salesToPlan = aggregated.plan
      ? +((aggregated.totalSales / aggregated.plan) * 100).toFixed()
      : 0;
    aggregated.remainder = aggregated.plan - aggregated.totalSales;
    aggregated.callCost = aggregated.calls
      ? +(aggregated.adExpensesPrice / aggregated.calls).toFixed(2)
      : 0;
    aggregated.drr = aggregated.totalSales
      ? +((aggregated.adExpensesPrice / aggregated.totalSales) * 100).toFixed(2)
      : 0;
    aggregated.conversionDealsToCalls = aggregated.calls
      ? +((aggregated.dealsAmount / aggregated.calls) * 100).toFixed(2)
      : 0;
    aggregated.conversionMaketsToCalls = aggregated.calls
      ? +((aggregated.makets / aggregated.calls) * 100).toFixed(2)
      : 0;
    aggregated.conversionMaketsToSales = aggregated.makets
      ? +((aggregated.dealsAmount / aggregated.makets) * 100).toFixed(2)
      : 0;
    aggregated.conversionMaketsDayToDayToCalls = aggregated.calls
      ? +((aggregated.maketsDayToDay / aggregated.calls) * 100).toFixed(2)
      : 0;

    const daysInMonth = getDaysInMonth(
      +period.split('-')[0],
      +period.split('-')[1],
    );
    const isThismounth =
      period.split('-')[1] === new Date().toISOString().slice(5, 7);
    const today = isThismounth
      ? new Date().toISOString().slice(8, 10)
      : daysInMonth;

    aggregated.temp = +(
      (aggregated.totalSales / +today) *
      daysInMonth
    ).toFixed();
    aggregated.tempToPlan = aggregated.plan
      ? +((aggregated.temp / aggregated.plan) * 100).toFixed()
      : 0;

    // Сортируем и ограничиваем массивы
    aggregated.sources.sort((a, b) => b.sales - a.sales);
    aggregated.adTags.sort((a, b) => b.sales - a.sales);
    aggregated.maketsSales.sort((a, b) => b.sales - a.sales);
    aggregated.adExpenses.sort((a, b) => b.sales - a.sales);
    aggregated.users = aggregated.users
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);

    return aggregated;
  }
}
