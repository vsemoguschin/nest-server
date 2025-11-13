// src/services/manager-report.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateManagerReportDto } from './dto/create-manager-report.dto';
import { UserDto } from '../users/dto/user.dto';
import { CreateRopReportDto } from './dto/create-rop-report.dto';

const formatDate = (dateString: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error('Дата должна быть в формате YYYY-MM-DD');
  }
  const [year, month, day] = dateString.split('-');
  return `${day}.${month}.${year}`;
};

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async create(createManagerReportDto: CreateManagerReportDto, user: UserDto) {
    const { calls, makets, maketsDayToDay, userId, date, redirectToMSG } =
      createManagerReportDto;

    // Проверяем, существует ли запись с таким userId и date
    const existingUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        role: true,
      },
    });

    if (!existingUser) {
      throw new ConflictException(`пользователя не существует`);
    }
    // Проверяем, существует ли запись с таким userId и date
    const existingReport = await this.prisma.managerReport.findFirst({
      where: {
        userId,
        date,
      },
    });

    if (existingReport) {
      throw new ConflictException(
        `Отчет для пользователя с ID ${userId} и датой ${date} уже существует`,
      );
    }

    let shiftCost = existingUser.isIntern ? 800 : 666.67;
    if (existingUser.groupId === 19 && existingUser.role.shortName == 'MOP') {
      shiftCost = 800;
    }
    if (existingUser.groupId === 19 && existingUser.role.shortName == 'MOV') {
      shiftCost = 1333;
    }

    const report = await this.prisma.managerReport.create({
      data: {
        calls,
        makets,
        maketsDayToDay,
        userId,
        date,
        period: date.slice(0, 7),
        redirectToMSG,
        shiftCost,
        isIntern: existingUser.isIntern,
      },
    });

    return report;
  }

  async createRopReport(createRopReportDto: CreateRopReportDto) {
    const {
      calls,
      makets,
      workSpaceId,
      date,
      maketsDayToDay,
      redirectToMSG,
      groupId,
    } = createRopReportDto;
    // return console.log(createRopReportDto);

    // Проверяем, существует ли группа
    const existingGroup = await this.prisma.group.findUnique({
      where: {
        id: groupId,
      },
    });

    if (!existingGroup) {
      throw new ConflictException(`Группа не существует`);
    }

    // Проверяем, существует ли запись с таким userId и date
    const existingReport = await this.prisma.ropReport.findFirst({
      where: {
        groupId,
        date,
      },
    });

    if (existingReport) {
      throw new ConflictException(
        `Отчет для пользователя с ID ${workSpaceId} и датой ${date} уже существует`,
      );
    }

    const report = await this.prisma.ropReport.create({
      data: {
        calls,
        makets,
        workSpaceId: existingGroup.workSpaceId,
        date,
        maketsDayToDay,
        redirectToMSG,
        period: date.slice(0, 7),
        groupId,
      },
    });

    return report;
  }

  async deleteRopReport(id: number) {
    const report = await this.prisma.ropReport.findUnique({
      where: { id },
    });
    // console.log(report, id);

    if (!report) {
      throw new NotFoundException(`Отчет с ID ${id} не найден`);
    }

    await this.prisma.ropReport.delete({
      where: { id },
    });

    return { message: `Отчет с ID ${id} успешно удален` };
  }

  async deleteManagerReport(id: number) {
    const report = await this.prisma.managerReport.findUnique({
      where: { id },
    });
    // console.log(report, id);

    if (!report) {
      throw new NotFoundException(`Отчет с ID ${id} не найден`);
    }

    await this.prisma.managerReport.delete({
      where: { id },
    });

    // return { message: `Отчет с ID ${id} успешно удален` };
    return { message: `Отчет успешно удален` };
  }

  async getManagerData(id: number, date: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`Пользователь с ID ${id} не найден`);
    }

    const deals = await this.prisma.deal.findMany({
      where: {
        saleDate: date,
        reservation: false,
        status: {
          not: 'Возврат',
        },
        dealers: {
          some: {
            userId: id,
          },
        },
      },
      include: {
        dealers: {
          where: {
            userId: id,
          },
        },
        client: true,
      },
    });

    const dops = await this.prisma.dop.findMany({
      where: {
        saleDate: date,
        userId: id,
      },
    });

    const dealsAmount = deals.length;

    const dealsDayToDayCount = deals.filter(
      (d) => d.saleDate === d.client.firstContact,
    ).length;

    const dealSales = deals.reduce((a, b) => a + b.price, 0);
    const dopSales = dops.reduce((a, b) => a + b.price, 0);
    const totalSales = dealSales + dopSales;

    return {
      manager: user.fullName,
      dopSales, //сумма доп.продаж
      dealSales, //сумма сделок
      totalSales,
      dealsAmount, //количество сделок
      averageBill: dealsAmount //средний чек
        ? totalSales / dealsAmount
        : 0,
      dealsDayToDayCount, //кол-во сделок проданных день в день
      date, //дата запроса
    };
  }

  async getManagersReports(period: string, user: UserDto) {
    const workspacesSearch =
      user.role.department === 'administration' || user.role.shortName === 'KD'
        ? { gt: 0 }
        : user.workSpaceId;
    const reports = await this.prisma.managerReport.findMany({
      where: {
        period,
        user: {
          workSpaceId: workspacesSearch,
        },
      },
      include: {
        user: {
          include: {
            dealSales: {
              where: {
                deal: {
                  saleDate: {
                    startsWith: period,
                  },
                  reservation: false,
                  status: {
                    not: 'Возврат',
                  },
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
                period,
                deal: {
                  reservation: false,
                  status: {
                    not: 'Возврат',
                  },
                },
              },
            },
            workSpace: {
              include: {
                adExpenses: {
                  where: { period },
                },
                reports: {
                  where: { period },
                },
              },
            },
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    return reports.map((r) => {
      const { date, calls, redirectToMSG } = r;
      const dateDeals = r.user.dealSales.filter(
        (d) => d.deal.saleDate === date,
      );
      const dateExpenses = r.user.workSpace.adExpenses.filter(
        (e) => e.date === date,
      );
      const dateCalls = r.user.workSpace.reports.reduce(
        (a, b) => a + b.calls,
        0,
      );
      const dateExpensesPrice = dateExpenses.reduce((a, b) => a + b.price, 0);
      const callCost = dateCalls
        ? +(dateExpensesPrice / dateCalls).toFixed()
        : 0;
      const dateDops = r.user.dops.filter((d) => d.saleDate === date);
      const dopSales = dateDops.reduce((a, b) => a + b.price, 0);
      const dealSales = dateDeals.reduce((a, b) => a + b.deal.price, 0);
      const totalSales = dopSales + dealSales;
      const dealsAmount = dateDeals.length;
      const averageBill = dealsAmount
        ? +(totalSales / dealsAmount).toFixed()
        : 0;
      const conversion = calls ? +((dealsAmount / calls) * 100).toFixed(2) : 0;
      const dealsDayToDayCount = dateDeals.filter(
        (d) => d.deal.saleDate === d.deal.client.firstContact,
      ).length;

      const drr = totalSales
        ? +((calls * callCost) / totalSales).toFixed(2)
        : 0;

      return {
        id: r.id,
        date: formatDate(r.date),
        manager: r.user.fullName,
        userId: r.userId,
        workSpaceId: r.user.workSpaceId,
        workSpace: r.user.workSpace.title,
        calls,
        dealSales,
        dealsAmount,
        dopSales,
        totalSales,
        averageBill,
        makets: r.makets,
        maketsDayToDay: r.maketsDayToDay,
        conversion,
        drr,
        redirectToMSG,
        dealsDayToDayCount,
      };
    });
  }

  async getManagersReportsFromRange(
    range: { from: string; to: string },
    user: UserDto,
  ) {
    const workspacesSearch =
      user.role.department === 'administration' || user.role.shortName === 'KD'
        ? { gt: 0 }
        : user.workSpaceId;
    const reports = await this.prisma.managerReport.findMany({
      where: {
        date: {
          gte: range.from,
          lte: range.to,
        },
        user: {
          workSpaceId: workspacesSearch,
        },
      },
      include: {
        user: {
          include: {
            dealSales: {
              where: {
                deal: {
                  saleDate: {
                    gte: range.from,
                    lte: range.to,
                  },
                  reservation: false,
                  status: {
                    not: 'Возврат',
                  },
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
                  gte: range.from,
                  lte: range.to,
                },
                deal: {
                  reservation: false,
                  status: {
                    not: 'Возврат',
                  },
                },
              },
            },
            workSpace: {
              include: {
                adExpenses: {
                  where: {
                    date: {
                      gte: range.from,
                      lte: range.to,
                    },
                  },
                },
                reports: {
                  where: {
                    date: {
                      gte: range.from,
                      lte: range.to,
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    return reports.map((r) => {
      const { date, calls, redirectToMSG } = r;
      const dateDeals = r.user.dealSales.filter(
        (d) => d.deal.saleDate === date,
      );
      // console.log(dateDeals.map(d=>d.deal.title));
      const dateExpenses = r.user.workSpace.adExpenses.filter(
        (e) => e.date === date,
      );
      const dateCalls = r.user.workSpace.reports.reduce(
        (a, b) => a + b.calls,
        0,
      );
      const dateExpensesPrice = dateExpenses.reduce((a, b) => a + b.price, 0);
      const callCost = dateCalls
        ? +(dateExpensesPrice / dateCalls).toFixed()
        : 0;
      const dateDops = r.user.dops.filter((d) => d.saleDate === date);
      const dopSales = dateDops.reduce((a, b) => a + b.price, 0);
      const dealSales = dateDeals.reduce((a, b) => a + b.deal.price, 0);
      const totalSales = dopSales + dealSales;
      const dealsAmount = dateDeals.length;
      const averageBill = dealsAmount
        ? +(totalSales / dealsAmount).toFixed()
        : 0;
      const conversion = calls ? +((dealsAmount / calls) * 100).toFixed(2) : 0;
      const dealsDayToDayCount = dateDeals.filter(
        (d) => d.deal.saleDate === d.deal.client.firstContact,
      ).length;

      const drr = totalSales
        ? +((calls * callCost) / totalSales).toFixed(2)
        : 0;

      return {
        id: r.id,
        date: formatDate(r.date),
        manager: r.user.fullName,
        userId: r.userId,
        workSpaceId: r.user.workSpaceId,
        workSpace: r.user.workSpace.title,
        calls,
        dealSales,
        dealsAmount,
        dopSales,
        totalSales,
        averageBill,
        makets: r.makets,
        maketsDayToDay: r.maketsDayToDay,
        conversion,
        drr,
        redirectToMSG,
        dealsDayToDayCount,
      };
    });
  }

  async getWorkSpaces(user: UserDto) {
    const workspacesSearch =
      user.role.department === 'administration' || user.role.shortName === 'KD'
        ? { gt: 0 }
        : user.workSpaceId;

    const workspaces = await this.prisma.workSpace.findMany({
      where: {
        deletedAt: null,
        id: workspacesSearch,
      },
    });
    if (!workspaces || workspaces.length === 0) {
      throw new NotFoundException('Нет доступных рабочих пространств');
    }
    return workspaces;
  }

  async getGroups(user: UserDto) {
    let groupSearch: {
      id: { gt: number } | number;
      workSpaceId?: number;
    } = { id: user.groupId };

    if (['ADMIN', 'G', 'KD'].includes(user.role.shortName)) {
      groupSearch = {
        id: { gt: 0 },
        // workSpaceId: 0,
      };
    }
    if (['DO'].includes(user.role.shortName)) {
      groupSearch = {
        id: { gt: 0 },
        workSpaceId: user.groupId,
      };
    }

    const groups = await this.prisma.group.findMany({
      where: {
        deletedAt: null,
        ...groupSearch,
        workSpace: {
          department: 'COMMERCIAL',
        },
      },
    });
    if (!groups || groups.length === 0) {
      throw new NotFoundException('Нет доступных рабочих групп');
    }
    return groups;
  }

  async getRopsReportsPredata(date: string, id: number) {
    const workSpace = await this.prisma.workSpace.findUnique({
      where: {
        id,
      },
      include: {
        deals: {
          where: {
            saleDate: date,
            reservation: false,
            status: {
              not: 'Возврат',
            },
          },
          include: {
            client: true,
          },
        },
        payments: {
          where: {
            date,
          },
        },
        dops: {
          where: {
            saleDate: date,
            deal: {
              reservation: false,
              status: {
                not: 'Возврат',
              },
            },
          },
        },
      },
    });

    if (!workSpace) {
      throw new NotFoundException(`Пространство с ID ${id} не найден`);
    }

    const dateDeals = workSpace.deals.filter((d) => d.saleDate === date);
    const dealSales = dateDeals.reduce((a, b) => a + b.price, 0);
    const dateDops = workSpace.dops.filter((d) => d.saleDate === date);
    const dopSales = dateDops.reduce((a, b) => a + b.price, 0);
    const totalSales = dopSales + dealSales;
    const dealsAmount = dateDeals.length;
    const averageBill = dealsAmount ? totalSales / dealsAmount : 0;
    const dealsDayToDayCount = dateDeals.filter(
      (d) => d.saleDate === d.client.firstContact,
    ).length;

    return {
      date, //дата
      workSpaceId: workSpace?.id,
      workSpace: workSpace.title,
      dealSales, //сумма сделок
      dealsAmount, //количество сделок
      dopSales, //сумма доп продаж
      totalSales, //общая сумма продаж
      averageBill: +averageBill.toFixed(), //средний чек
      dealsDayToDayCount, // заказов день в день
    };
  }

  async getRopsReportsGroupPredata(date: string, id: number) {
    const group = await this.prisma.group.findUnique({
      where: {
        id,
      },
      include: {
        deals: {
          where: {
            saleDate: date,
            reservation: false,
            status: {
              not: 'Возврат',
            },
          },
          include: {
            client: true,
          },
        },
        payments: {
          where: {
            date,
          },
        },
        dops: {
          where: {
            saleDate: date,
            deal: {
              reservation: false,
              status: {
                not: 'Возврат',
              },
            },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException(`Пространство с ID ${id} не найден`);
    }

    const dateDeals = group.deals.filter((d) => d.saleDate === date);
    const dealSales = dateDeals.reduce((a, b) => a + b.price, 0);
    const dateDops = group.dops.filter((d) => d.saleDate === date);
    const dopSales = dateDops.reduce((a, b) => a + b.price, 0);
    const totalSales = dopSales + dealSales;
    const dealsAmount = dateDeals.length;
    const averageBill = dealsAmount ? totalSales / dealsAmount : 0;
    const dealsDayToDayCount = dateDeals.filter(
      (d) => d.saleDate === d.client.firstContact,
    ).length;

    return {
      date, //дата
      groupId: group?.id,
      group: group.title,
      dealSales, //сумма сделок
      dealsAmount, //количество сделок
      dopSales, //сумма доп продаж
      totalSales, //общая сумма продаж
      averageBill: +averageBill.toFixed(), //средний чек
      dealsDayToDayCount, // заказов день в день
    };
  }

  // async getRopsReports(period: string, user: UserDto) {
  //   const workspacesSearch =
  //     user.role.department === 'administration' || user.role.shortName === 'KD'
  //       ? { gt: 0 }
  //       : user.workSpaceId;
  //   const reports = await this.prisma.ropReport.findMany({
  //     where: {
  //       period,
  //       workSpaceId: workspacesSearch,
  //     },
  //     include: {
  //       workSpace: {
  //         include: {
  //           deals: {
  //             where: {
  //               saleDate: {
  //                 startsWith: period,
  //               },
  //               reservation: false,
  //             },
  //             include: {
  //               client: true,
  //             },
  //           },
  //           dops: {
  //             where: {
  //               saleDate: {
  //                 startsWith: period,
  //               },
  //               deal: {
  //                 reservation: false,
  //                 status: {
  //                   not: 'Возврат',
  //                 },
  //               },
  //             },
  //           },
  //           payments: {
  //             where: {
  //               date: {
  //                 startsWith: period,
  //               },
  //             },
  //           },
  //           adExpenses: {
  //             where: { period },
  //           },
  //         },
  //       },
  //       group: true,
  //     },
  //     orderBy: {
  //       date: 'desc',
  //     },
  //   });

  //   return reports.map((r) => {
  //     const { date, calls, makets, maketsDayToDay, redirectToMSG } = r;
  //     const dateExpenses = r.workSpace.adExpenses.filter(
  //       (e) => e.date === date,
  //     );

  //     const dateExpensesPrice = dateExpenses.reduce((a, b) => a + b.price, 0);
  //     const dateDeals = r.workSpace.deals.filter((d) => d.saleDate === date);
  //     const dealSales = dateDeals.reduce((a, b) => a + b.price, 0);
  //     const dateDops = r.workSpace.dops.filter((d) => d.saleDate === date);
  //     const dopSales = dateDops.reduce((a, b) => a + b.price, 0);
  //     const totalSales = dopSales + dealSales;
  //     const dealsAmount = dateDeals.length;
  //     const averageBill = dealsAmount ? totalSales / dealsAmount : 0;
  //     const conversion = calls ? +((dealsAmount / calls) * 100).toFixed(2) : 0;
  //     const conversionMaket = calls ? +((makets / calls) * 100).toFixed(2) : 0;
  //     const conversionToSale = makets
  //       ? +((dealsAmount / makets) * 100).toFixed(2)
  //       : 0;

  //     const dealsDayToDayCount = dateDeals.filter(
  //       (d) => d.saleDate === d.client.firstContact,
  //     ).length;

  //     const conversionDealsDayToDay = calls
  //       ? +((dealsDayToDayCount / calls) * 100).toFixed(2)
  //       : 0;

  //     const callCost = calls ? +(dateExpensesPrice / calls).toFixed(2) : 0;
  //     const drr = totalSales
  //       ? +((dateExpensesPrice / totalSales) * 100).toFixed(2)
  //       : 0;

  //     const conversionMaketDayToDay = calls
  //       ? +((maketsDayToDay / calls) * 100).toFixed(2)
  //       : 0;

  //     // console.log(callCost);

  //     return {
  //       id: r.id,
  //       date: formatDate(date), //дата
  //       workSpaceId: r.workSpaceId,
  //       workSpace: r.workSpace.title,
  //       group: r.group?.title || 'Нет группы',
  //       calls, // количество заявок
  //       dealSales, //сумма сделок
  //       dealsAmount, //количество сделок
  //       dopSales, //сумма доп продаж
  //       totalSales, //общая сумма продаж
  //       averageBill: +averageBill.toFixed(), //средний чек
  //       makets, //количество макетов
  //       maketsDayToDay, //количество макетов день в день
  //       conversionMaketDayToDay, //количество макетов день в день
  //       redirectToMSG, //количество редиректов
  //       conversion, //конверсия
  //       conversionMaket, //конверсия в макет (количество макетов/колво сделок)
  //       conversionToSale, //конверсия из макета в продажу(колво сделок/колво макетов)
  //       dealsDayToDayCount, // заказов день в день
  //       conversionDealsDayToDay, // конверсия заказов день в день (заказы день в день/заявки)
  //       callCost, //Стоимость заявки(по формуле)
  //       drr, //ДРР(по формуле)
  //       dateExpensesPrice, //стоимость рекламы
  //     };
  //   });
  // }

  async getRopsReportsFromRange(
    range: { from: string; to: string },
    user: UserDto,
  ) {
    const workspacesSearch =
      user.role.department === 'administration' || user.role.shortName === 'KD'
        ? { gt: 0 }
        : user.workSpaceId;

    // console.log(user);

    const reports = await this.prisma.ropReport.findMany({
      where: {
        date: {
          gte: range.from,
          lte: range.to,
        },
        workSpaceId: workspacesSearch,
      },
      include: {
        workSpace: true,
        group: {
          include: {
            deals: {
              where: {
                saleDate: {
                  gte: range.from,
                  lte: range.to,
                },
                reservation: false,
                status: { not: 'Возврат' },
              },
              include: {
                client: true,
              },
            },
            dops: {
              where: {
                saleDate: {
                  gte: range.from,
                  lte: range.to,
                },
                deal: {
                  reservation: false,
                  status: {
                    not: 'Возврат',
                  },
                },
              },
            },
            payments: {
              where: {
                date: {
                  gte: range.from,
                  lte: range.to,
                },
              },
            },
            adExpenses: {
              where: {
                date: {
                  gte: range.from,
                  lte: range.to,
                },
              },
            },
            
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        deliveredDate: {
          gte: range.from,
          lte: range.to,
        },
      },
    });
    console.log(deliveries);

    // console.log(reports);

    return reports.map((r) => {
      const { date, calls, makets, maketsDayToDay, redirectToMSG } = r;
      const dateExpenses = r.group!.adExpenses.filter((e) => e.date === date);

      const dateExpensesPrice = dateExpenses.reduce((a, b) => a + b.price, 0);
      const dateDeals = r.group!.deals.filter((d) => d.saleDate === date);
      const dealSales = dateDeals.reduce((a, b) => a + b.price, 0);
      const dateDops = r.group!.dops.filter((d) => d.saleDate === date);

      const dopSales = dateDops.reduce((a, b) => a + b.price, 0);
      const totalSales = dopSales + dealSales;
      const dealsAmount = dateDeals.length;
      const averageBill = dealsAmount ? totalSales / dealsAmount : 0;
      const conversion = calls ? +((dealsAmount / calls) * 100).toFixed(2) : 0;
      const conversionMaket = calls ? +((makets / calls) * 100).toFixed(2) : 0;
      const conversionToSale = makets
        ? +((dealsAmount / makets) * 100).toFixed(2)
        : 0;

      const dealsDayToDayCount = dateDeals.filter(
        (d) => d.saleDate === d.client.firstContact,
      ).length;

      // console.log(
      //   dateDeals
      //     // .filter((d) => d.saleDate === d.client.firstContact)
      //     .map((d) => ({ title: d.title, price: d.price }))
      //     .reduce((a, b) => a + b.price, 0),
      // );
      // console.log(
      //   dateDops
      //     // .filter((d) => d.saleDate === d.client.firstContact)
      //     .map((d) => ({ title: d.type, price: d.price, data: d.saleDate, deal: d.dealId }))
      //     // .reduce((a, b) => a + b.price, 0),
      // );

      const conversionDealsDayToDay = calls
        ? +((dealsDayToDayCount / calls) * 100).toFixed(2)
        : 0;

      const callCost = calls ? +(dateExpensesPrice / calls).toFixed(2) : 0;
      const drr = totalSales
        ? +((dateExpensesPrice / totalSales) * 100).toFixed(2)
        : 0;

      const conversionMaketDayToDay = calls
        ? +((maketsDayToDay / calls) * 100).toFixed(2)
        : 0;

      // console.log(callCost);

      return {
        id: r.id,
        date: formatDate(date), //дата
        workSpaceId: r.workSpaceId,
        workSpace: r.workSpace.title,
        group: r.group?.title || 'Нет группы',
        calls, // количество заявок
        dealSales, //сумма сделок
        dealsAmount, //количество сделок
        dopSales, //сумма доп продаж
        totalSales, //общая сумма продаж
        averageBill: +averageBill.toFixed(), //средний чек
        makets, //количество макетов
        maketsDayToDay, //количество макетов день в день
        conversionMaketDayToDay, //количество макетов день в день
        redirectToMSG, //количество редиректов
        conversion, //конверсия
        conversionMaket, //конверсия в макет (количество макетов/колво сделок)
        conversionToSale, //конверсия из макета в продажу(колво сделок/колво макетов)
        dealsDayToDayCount, // заказов день в день
        conversionDealsDayToDay, // конверсия заказов день в день (заказы день в день/заявки)
        callCost, //Стоимость заявки(по формуле)
        drr, //ДРР(по формуле)
        dateExpensesPrice, //стоимость рекламы
      };
    });
  }
}
