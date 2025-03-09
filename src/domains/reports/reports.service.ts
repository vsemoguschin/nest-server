// src/services/manager-report.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateManagerReportDto } from './dto/create-manager-report.dto';
import { UserDto } from '../users/dto/user.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async create(createManagerReportDto: CreateManagerReportDto) {
    const { calls, makets, maketsDayToDay, userId, date } =
      createManagerReportDto;

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

    const report = await this.prisma.managerReport.create({
      data: {
        calls,
        makets,
        maketsDayToDay,
        userId,
        date,
        period: date.slice(0, 7),
      },
    });

    return report;
  }

  async delete(id: number) {
    const report = await this.prisma.managerReport.findUnique({
      where: { id },
    });

    if (!report) {
      throw new NotFoundException(`Отчет с ID ${id} не найден`);
    }

    await this.prisma.managerReport.delete({
      where: { id },
    });

    return { message: `Отчет с ID ${id} успешно удален` };
  }

  async getManagerData(id: number, date: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`Пользователь с ID ${id} не найден`);
    }

    const deals = await this.prisma.deal.findMany({
      where: {
        saleDate: date,
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
    console.log(deals[0]?.dealers);

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
    const reports = await this.prisma.managerReport.findMany({
      where: { period },
      include: {
        user: {
          include: {
            dealSales: {
              where: {
                deal: {
                  period,
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
      const { date } = r;
      const dateDeals = r.user.dealSales.filter(
        (d) => d.deal.saleDate === date,
      );
      const dateDops = r.user.dops.filter((d) => d.saleDate === date);
      const dopSales = dateDops.reduce((a, b) => a + b.price, 0);
      const dealSales = dateDeals.reduce((a, b) => a + b.deal.price, 0);
      const totalSales = dopSales + dealSales;
      const dealsAmount = dateDeals.length;
      const averageBill = dealsAmount ? totalSales / dealsAmount : 0;
      const dealsDayToDayCount = r.user.dealSales.filter(
        (d) => d.deal.saleDate === d.deal.client.firstContact,
      ).length;
      return {
        manager: r.user.fullName,
        userId: r.userId,
        calls: r.calls,
        date: r.date,
        makets: r.makets,
        maketsDayToDay: r.maketsDayToDay,
        totalSales,
        dealSales,
        dealsAmount,
        conversion: +(dealsAmount / r.calls).toFixed(2),
        ddr: 0,
        dopSales,
        averageBill,
        dealsDayToDayCount,
      };
    });
  }
}
