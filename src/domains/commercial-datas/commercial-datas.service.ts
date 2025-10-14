import { Injectable, NotFoundException } from '@nestjs/common';
import { UserDto } from '../users/dto/user.dto';
import { PrismaService } from 'src/prisma/prisma.service';

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
  /** get /commercial-datas/tops/:groupId?period */
  async getManagerGroupDatas(groupId: number, period: string) {
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
      user.role.department === 'administration' ||
      user.role.shortName === 'KD' ||
      user.id === 21
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
      },
    });
    if (!groups || groups.length === 0) {
      throw new NotFoundException('Группы не найдены.');
    }
    return groups;
  }
  /** get /commercial-datas */
  async getManagersDatas(user: UserDto, period: string, groupId: number) {
    const managers = await this.prisma.user.findMany({
      where: {
        groupId,
        role: {
          shortName: {
            in: ['DO', 'MOP', 'ROP', 'MOV'],
          },
        },
      },
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
          },
        },
      },
    });
    const groupAdExpenses = await this.prisma.adExpense.findMany({
      where: {
        date: {
          startsWith: period,
        },
        groupId,
      },
    });
    const adExpenses = groupAdExpenses.reduce((a, b) => a + b.price, 0);
    const totalCalls = managers
      .flatMap((u) => u.managerReports)
      .reduce((a, b) => a + b.calls, 0);
    const callCost = totalCalls ? adExpenses / totalCalls : 0;

    return managers
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
  }
  /** get /commercial-datas/:managerId */
  async getManagerDatas(user: UserDto, period: string, managerId: number) {
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

      dopPays,
      dealPays,
      topBonus,
      totalSalary,
      rem: 0,

      dealsInfo: dealsInfo
        .sort((a, b) => a.id - b.id),
        // .filter((d) => d.toSalary > 0),
      dealsInfoPrevMounth: dealsInfoPrevMounth
        .sort((a, b) => a.id - b.id),
        // .filter((d) => d.toSalary > 0),
      dopsInfo: dopsInfo
        .sort((a, b) => a.dealId - b.dealId),
        // .filter((d) => d.toSalary > 0),
      dopsInfoPrevMounth: dopsInfoPrevMounth
        .sort((a, b) => a.dealId - b.dealId),
        // .filter((d) => d.toSalary > 0),
      prevPeriodsDealsPays,
      prevPeriodsDopsPays,

      groupId: m.groupId,
      isIntern: m.isIntern,
      fired: m.deletedAt ? true : false,
    };
  }
}
