import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMasterReportDto } from './dto/create-master-report.dto';
import { UpdateMasterReportDto } from './dto/update-master-report.dto';
import { UserDto } from '../users/dto/user.dto';
import { MasterShiftResponseDto } from './dto/master-shift.dto';
import { CreateMasterShiftsDto } from './dto/create-master-shifts.dto';
import { CreatePackerReportDto } from './dto/create-packer-report.dto';
import { UpdatePackerReportDto } from './dto/update-packer-report.dto';
import { PackerShiftResponseDto } from './dto/packer-shift.dto';
import { CreatePackerShiftsDto } from './dto/create-packer-shifts.dto';
import axios from 'axios';
import {
  CreateMasterRepairReportDto,
  UpdateMasterRepairReportDto,
} from './dto/create-master-repair-report.dto';
import {
  CreateOtherReportDto,
  UpdateOtherReportDto,
} from './dto/other-report.dto';
import {
  CreateLogistShiftsDto,
  LogistShiftResponseDto,
} from './dto/logist-shift.dto';
import { CreateFrezerReportDto } from './dto/create-frezer-report.dto';
import { UpdateFrezerReportDto } from './dto/update-frezer-report.dto';
const KAITEN_TOKEN = process.env.KAITEN_TOKEN;

@Injectable()
export class ProductionService {
  constructor(private prisma: PrismaService) {}

  async getPredata(user: UserDto) {
    if (['ADMIN', 'G', 'DP', 'RP'].includes(user.role.shortName)) {
      return {
        tabs: [
          { value: 'orders', label: 'Заказы' },
          { value: 'table', label: 'Сборка' },
          { value: 'masters', label: 'Сборщики' },
          { value: 'packers-stat', label: 'Упаковка' },
          { value: 'package', label: 'Упаковщики' },
          { value: 'frezer', label: 'Фрезеровка' },
          { value: 'logist', label: 'Логист' },
          { value: 'supplie', label: 'Закупки' },
          // { value: 'salaries', label: 'Зарплаты' },
        ],
      };
    }
    if (['LOGIST'].includes(user.role.shortName)) {
      return {
        tabs: [
          { value: 'supplie', label: 'Закупки' },
          { value: 'logist', label: 'Логист' },
        ],
      };
    }
    if (['MASTER'].includes(user.role.shortName)) {
      return { tabs: [{ value: 'masters', label: 'Сборщики' }] };
    }
    if (['PACKER'].includes(user.role.shortName)) {
      return { tabs: [{ value: 'package', label: 'Упаковщики' }] };
    }
    if (['FINANCIER'].includes(user.role.shortName)) {
      return { tabs: [{ value: 'supplie', label: 'Закупки' }] };
    }
    if (['FRZ'].includes(user.role.shortName)) {
      return { tabs: [{ value: 'frezer', label: 'Фрезеровка' }] };
    }
  }

  async getOrders(from: string, to: string) {
    const masterReports = await this.prisma.masterReport.findMany({
      where: {
        date: {
          gte: from,
          lte: to,
        },
      },
      include: {
        user: {
          select: {
            fullName: true,
            id: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    const masterRepairReports = await this.prisma.masterRepairReport.findMany({
      where: {
        date: {
          gte: from,
          lte: to,
        },
      },
      include: {
        user: {
          select: {
            fullName: true,
            id: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    const otherReports = await this.prisma.otherReport.findMany({
      where: {
        date: {
          gte: from,
          lte: to,
        },
        user: {
          role: {
            shortName: {
              not: 'FRZ',
            },
          },
        },
      },
      include: {
        user: {
          select: {
            fullName: true,
            id: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    const packersReports = await this.prisma.packerReport.findMany({
      where: {
        date: {
          gte: from,
          lte: to,
        },
      },
      include: {
        user: {
          select: {
            fullName: true,
            id: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    const frezerReport = await this.prisma.frezerReport.findMany({
      where: {
        date: {
          gte: from,
          lte: to,
        },
      },
      include: {
        user: {
          select: {
            fullName: true,
            id: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });
    const frezerOtherReport = await this.prisma.frezerReport.findMany({
      where: {
        date: {
          gte: from,
          lte: to,
        },
        user: {
          role: {
            shortName: 'FRZ',
          },
        },
      },
      include: {
        user: {
          select: {
            fullName: true,
            id: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    // Объединяем все отчеты с добавлением уникальных ключей, меток и card_id
    const allReports = [
      ...masterReports.map((report) => ({
        ...report,
        key: `master-report-${report.id}`,
        report_type: 'Сборка',
      })),
      ...masterRepairReports.map((report) => ({
        ...report,
        key: `master-repair-${report.id}`,
        isRepair: true,
        report_type: 'Ремонт',
      })),
      ...otherReports.map((report) => ({
        ...report,
        key: `master-other-${report.id}`,
        isOther: true,
        type: 'Другое',
        report_type: 'Другое',
      })),
      ...packersReports.map((report) => ({
        ...report,
        key: `packer-report-${report.id}`,
        report_type: 'Упаковка',
      })),
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((r) => {
        let card_id = '';
        if (r.name.includes('easyneonwork.kaiten.ru/')) {
          const linkSplit = r.name.split('/');
          card_id = linkSplit[linkSplit.length - 1].trim();
        } else {
          card_id = r.name.trim();
        }
        return { ...r, card_id };
      });

    // Группировка по card_id
    const groupedByCardId = allReports.reduce(
      (acc, report) => {
        if (!acc[report.card_id]) {
          acc[report.card_id] = [];
        }
        acc[report.card_id].push(report);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    const totals = {
      frezerReports: frezerReport.length,
      frezerReportsCost: frezerReport.reduce(
        (a, b) => a + b.cost - b.penaltyCost,
        0,
      ),
      frezerOtherReport: frezerOtherReport.length,
      frezerOtherReportCost: frezerOtherReport.reduce((a, b) => a + b.cost, 0),
      frezerSalary: frezerReport.reduce(
        (a, b) => a + b.cost - b.penaltyCost,
        0,
      ),

      els: masterReports.reduce((a, b) => a + b.els, 0),
      metrs: masterReports.reduce((a, b) => a + b.metrs, 0),
      mastersSalary: masterReports.reduce(
        (a, b) => a + (b.cost - b.penaltyCost),
        0,
      ),
      mastersReports: masterReports.length,
      packersReports: packersReports.length,
      packages: packersReports.reduce((a, b) => a + b.items, 0),
      packagersSalary: packersReports.reduce(
        (a, b) => a + (b.cost - b.penaltyCost),
        0,
      ),
      repairs: masterRepairReports.length,
      repairsCost: masterRepairReports.reduce((a, b) => a + b.cost, 0),
      ordersCost: allReports.reduce((a, b) => a + b.cost, 0),
      penalties: allReports.filter((p) => p.penaltyCost > 0).length,
      penaltiesCost: allReports.reduce((a, b) => a + b.penaltyCost, 0),
      otherReports: otherReports.length,
      otherReportsCost: otherReports.reduce((a, b) => a + b.cost, 0),
      totalCost: allReports.reduce((a, b) => a + (b.cost - b.penaltyCost), 0),
    };

    // Преобразуем объект в массив сгруппированных отчетов и сортируем по самой свежей дате
    const orders = Object.entries(groupedByCardId)
      .map(([card_id, orders]) => ({
        name: orders[0].name,
        card_id,
        orders,
      }))
      .sort((a, b) => {
        const latestDateA = a.orders.reduce(
          (latest, report) => (latest > report.date ? latest : report.date),
          a.orders[0].date,
        );
        const latestDateB = b.orders.reduce(
          (latest, report) => (latest > report.date ? latest : report.date),
          b.orders[0].date,
        );
        return latestDateB.localeCompare(latestDateA);
      });
    return {
      orders,
      totals,
    };
  }

  async findOrders(name: string) {
    const masterReports = await this.prisma.masterReport.findMany({
      where: {
        name: {
          contains: name,
        },
      },
      include: {
        user: {
          select: {
            fullName: true,
            id: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    const masterRepairReports = await this.prisma.masterRepairReport.findMany({
      where: {
        name: {
          contains: name,
        },
      },
      include: {
        user: {
          select: {
            fullName: true,
            id: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    const otherReports = await this.prisma.otherReport.findMany({
      where: {
        name: {
          contains: name,
        },
      },
      include: {
        user: {
          select: {
            fullName: true,
            id: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    const packersReports = await this.prisma.packerReport.findMany({
      where: {
        name: {
          contains: name,
        },
      },
      include: {
        user: {
          select: {
            fullName: true,
            id: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    // Объединяем все отчеты с добавлением уникальных ключей, меток и card_id
    const allReports = [
      ...masterReports.map((report) => ({
        ...report,
        key: `master-report-${report.id}`,
        report_type: 'Сборка',
      })),
      ...masterRepairReports.map((report) => ({
        ...report,
        key: `master-repair-${report.id}`,
        isRepair: true,
        report_type: 'Ремонт',
      })),
      ...otherReports.map((report) => ({
        ...report,
        key: `master-other-${report.id}`,
        isOther: true,
        type: 'Другое',
        report_type: 'Другое',
      })),
      ...packersReports.map((report) => ({
        ...report,
        key: `packer-report-${report.id}`,
        report_type: 'Упаковка',
      })),
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((r) => {
        let card_id = '';
        if (r.name.includes('easyneonwork.kaiten.ru/')) {
          const linkSplit = r.name.split('/');
          card_id = linkSplit[linkSplit.length - 1].trim();
        } else {
          card_id = r.name.trim();
        }
        return { ...r, card_id };
      });

    // Группировка по card_id
    const groupedByCardId = allReports.reduce(
      (acc, report) => {
        if (!acc[report.card_id]) {
          acc[report.card_id] = [];
        }
        acc[report.card_id].push(report);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    // Преобразуем объект в массив сгруппированных отчетов и сортируем по самой свежей дате
    return Object.entries(groupedByCardId)
      .map(([card_id, orders]) => ({
        name: orders[0].name,
        card_id,
        orders,
      }))
      .sort((a, b) => {
        const latestDateA = a.orders.reduce(
          (latest, report) => (latest > report.date ? latest : report.date),
          a.orders[0].date,
        );
        const latestDateB = b.orders.reduce(
          (latest, report) => (latest > report.date ? latest : report.date),
          b.orders[0].date,
        );
        return latestDateB.localeCompare(latestDateA);
      });
  }

  async getMasters(user: UserDto) {
    const userSearch = user.role.shortName === 'MASTER' ? user.id : { gt: 0 };

    const users = await this.prisma.user.findMany({
      where: {
        id: userSearch,
        OR: [
          { role: { shortName: 'MASTER' } },
          { masterReports: { some: {} } },
          { masterRepairReports: { some: {} } },
          { masterShifts: { some: {} } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        deletedAt: true,
        otherReport: {
          where: {
            date: {
              startsWith: new Date().toISOString().slice(0, 7),
            },
          },
        },
        masterReports: {
          where: {
            date: {
              startsWith: new Date().toISOString().slice(0, 7),
            },
          },
        },
        masterRepairReports: {
          where: {
            date: {
              startsWith: new Date().toISOString().slice(0, 7),
            },
          },
        },
      },
    });
    return users
      .filter(
        (u) =>
          u.deletedAt === null ||
          u.masterReports.length ||
          u.otherReport.length ||
          u.masterRepairReports.length,
      )
      .map((u) => ({
        fullName: !u.deletedAt ? u.fullName : u.fullName + '(Уволен)',
        id: u.id,
      }));
  }

  async getFrezers(user: UserDto) {
    const userSearch = user.role.shortName === 'FRZ' ? user.id : { gt: 0 };

    const users = await this.prisma.user.findMany({
      where: {
        role: { shortName: 'FRZ' },
        id: userSearch,
      },
      select: {
        id: true,
        fullName: true,
        deletedAt: true,
        frezerReports: {
          where: {
            date: {
              startsWith: new Date().toISOString().slice(0, 7),
            },
          },
        },
      },
    });
    return users
      .filter((u) => u.deletedAt === null || u.frezerReports.length)
      .map((u) => ({
        fullName: !u.deletedAt ? u.fullName : u.fullName + '(Уволен)',
        id: u.id,
      }));
  }

  async createMasterReport(dto: CreateMasterReportDto) {
    const name = dto.name;
    let dealId = 0;

    if (dto.name.includes('easyneonwork.kaiten.ru/')) {
      const linkSplit = dto.name.split('/');
      const card_id = linkSplit[linkSplit.length - 1];
      // console.log(card_id);

      try {
        const options = {
          method: 'GET',
          url: `https://easyneonwork.kaiten.ru/api/latest/cards/${card_id}`,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${KAITEN_TOKEN}`,
          },
        };

        const response = await axios.request(options);
        const description = response.data.description;

        if (description) {
          // Регулярное выражение для поиска ссылок на bluesales.ru или easyneon.amocrm.ru
          const linkRegex =
            /(https:\/\/(?:bluesales\.ru|easyneon\.amocrm\.ru)[^\]\s]+)/g;
          const match = description.match(linkRegex);

          if (match && match.length > 0) {
            const link = match[0]; // Берем первую найденную ссылку
            const deal = await this.prisma.deal.findFirst({
              where: {
                client: {
                  chatLink: link,
                },
              },
            });
            const deals = await this.prisma.deal.findMany({
              where: {
                client: {
                  chatLink: link,
                },
              },
              orderBy: {
                saleDate: 'desc',
              },
            });
            console.log(deals[0]);
            dealId = deals.length ? deals[0].id : 0;
            // console.log(deal);
          }
        }
      } catch (error) {
        console.error('Error fetching Kaiten card:', error);
        // Продолжаем с исходным dto.name, если ошибка
      }
    }

    return this.prisma.masterReport.create({
      data: {
        ...dto,
        name, // Используем обновленное значение name
        dealId: dealId === 0 ? null : dealId,
      },
    });
  }

  async createFrezerReport(dto: CreateFrezerReportDto) {
    return this.prisma.frezerReport.create({
      data: {
        ...dto,
      },
    });
  }

  async getMasterReports(userId: number, from: string, to: string) {
    const masterReports = await this.prisma.masterReport.findMany({
      where: {
        userId,
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { date: 'desc' },
    });

    const masterRepairReports = await this.prisma.masterRepairReport.findMany({
      where: {
        userId,
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { date: 'desc' },
    });

    const masterOtherReports = await this.prisma.otherReport.findMany({
      where: {
        userId,
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { date: 'desc' },
    });

    return [
      ...masterReports.map((report) => ({
        ...report,
        key: `report-${report.id}`,
      })),
      ...masterRepairReports.map((report) => ({
        ...report,
        key: `repair-${report.id}`,
        isRepair: true,
      })),
      ...masterOtherReports.map((report) => ({
        ...report,
        key: `other-${report.id}`,
        isOther: true,
        type: 'Другое',
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
  }

  async getFrezerReports(userId: number, from: string, to: string) {
    const frezerReport = await this.prisma.frezerReport.findMany({
      where: {
        userId,
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { date: 'desc' },
    });

    const otherReports = await this.prisma.otherReport.findMany({
      where: {
        userId,
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { date: 'desc' },
    });

    return [
      ...frezerReport.map((report) => ({
        ...report,
        key: `report-${report.id}`,
      })),
      ...otherReports.map((report) => ({
        ...report,
        key: `other-${report.id}`,
        isOther: true,
        type: 'Другое',
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
  }

  async getMasterReportById(id: number) {
    const report = await this.prisma.masterReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }
    return report;
  }

  async updateMasterReport(
    id: number,
    dto: UpdateMasterReportDto,
    user: UserDto,
  ) {
    const report = await this.prisma.masterReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }
    let dealId = 0;
    if (dto.name && dto.name.includes('easyneonwork.kaiten.ru/')) {
      const linkSplit = dto.name.split('/');
      const card_id = linkSplit[linkSplit.length - 1];
      // console.log(card_id);

      try {
        const options = {
          method: 'GET',
          url: `https://easyneonwork.kaiten.ru/api/latest/cards/${card_id}`,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${KAITEN_TOKEN}`,
          },
        };

        const response = await axios.request(options);
        const description = response.data.description;

        if (description) {
          // Регулярное выражение для поиска ссылок на bluesales.ru или easyneon.amocrm.ru
          const linkRegex =
            /(https:\/\/(?:bluesales\.ru|easyneon\.amocrm\.ru)[^\]\s]+)/g;
          const match = description.match(linkRegex);

          if (match && match.length > 0) {
            const link = match[0]; // Берем первую найденную ссылку
            const deal = await this.prisma.deal.findFirst({
              where: {
                client: {
                  chatLink: link,
                },
              },
            });
            dealId = deal?.id ?? 0;
            console.log(deal);
          }
        }
      } catch (error) {
        console.error('Error fetching Kaiten card:', error);
        // Продолжаем с исходным dto.name, если ошибка
      }
    }
    if (user.role.shortName === 'MASTER') {
      dto.comment = report.comment;
      dto.penaltyCost = report.penaltyCost;
    }
    return this.prisma.masterReport.update({
      where: { id },
      data: {
        ...dto,
        dealId: dealId === 0 ? null : dealId,
      },
    });
  }

  async updateFrezerReport(
    id: number,
    dto: UpdateFrezerReportDto,
    user: UserDto,
  ) {
    const report = await this.prisma.frezerReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }
    return this.prisma.frezerReport.update({
      where: { id },
      data: {
        ...dto,
      },
    });
  }

  async deleteMasterReport(id: number) {
    const report = await this.prisma.masterReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }
    return this.prisma.masterReport.delete({
      where: { id },
    });
  }

  async deleteFrezerReport(id: number) {
    const report = await this.prisma.frezerReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }
    return this.prisma.frezerReport.delete({
      where: { id },
    });
  }

  async createMasterShifts(
    masterId: number,
    dto: CreateMasterShiftsDto,
  ): Promise<MasterShiftResponseDto[]> {
    const { shiftDates } = dto;

    // Проверка существования мастера
    const master = await this.prisma.user.findUnique({
      where: { id: masterId },
    });
    if (!master) {
      throw new BadRequestException('Master not found');
    }

    // Начинаем транзакцию для атомарности
    return this.prisma.$transaction(async (tx) => {
      // Удаляем все существующие смены для мастера
      await tx.masterShift.deleteMany({
        where: {
          userId: masterId,
          shift_date: {
            startsWith: dto.period,
          },
        },
      });

      // Создаём новые смены
      const shifts = await Promise.all(
        shiftDates.map((shift_date) =>
          tx.masterShift.create({
            data: {
              shift_date,
              userId: masterId,
            },
            select: {
              id: true,
              shift_date: true,
              userId: true,
            },
          }),
        ),
      );

      return shifts;
    });
  }

  async getMasterShifts(
    masterId: number,
    period: string,
  ): Promise<MasterShiftResponseDto[]> {
    // Проверка существования мастера
    const master = await this.prisma.user.findUnique({
      where: { id: masterId },
    });
    if (!master) {
      throw new BadRequestException('Master not found');
    }

    // Получаем все смены для мастера
    return this.prisma.masterShift.findMany({
      where: {
        userId: masterId,
        shift_date: {
          startsWith: period,
        },
      },
      select: {
        id: true,
        shift_date: true,
        userId: true,
      },
    });
  }

  async createMasterRepairReport(dto: CreateMasterRepairReportDto) {
    const name = dto.name;
    let dealId = 0;

    if (dto.name.includes('easyneonwork.kaiten.ru/')) {
      const linkSplit = dto.name.split('/');
      const card_id = linkSplit[linkSplit.length - 1];

      try {
        const options = {
          method: 'GET',
          url: `https://easyneonwork.kaiten.ru/api/latest/cards/${card_id}`,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${KAITEN_TOKEN}`,
          },
        };

        const response = await axios.request(options);
        const description = response.data.description;

        if (description) {
          const linkRegex =
            /(https:\/\/(?:bluesales\.ru|easyneon.amocrm.ru)[^\]\s]+)/g;
          const match = description.match(linkRegex);

          if (match && match.length > 0) {
            const link = match[0];
            const deal = await this.prisma.deal.findFirst({
              where: {
                client: {
                  chatLink: link,
                },
              },
            });
            dealId = deal?.id ?? 0;
          }
        }
      } catch (error) {
        console.error('Error fetching Kaiten card:', error);
      }
    }

    return this.prisma.masterRepairReport.create({
      data: {
        ...dto,
        name,
        dealId: dealId === 0 ? null : dealId,
      },
    });
  }

  async updateMasterRepairReport(id: number, dto: UpdateMasterRepairReportDto) {
    const report = await this.prisma.masterRepairReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException(`Repair Report with ID ${id} not found`);
    }
    let dealId = 0;
    if (dto.name && dto.name.includes('easyneonwork.kaiten.ru/')) {
      const linkSplit = dto.name.split('/');
      const card_id = linkSplit[linkSplit.length - 1];

      try {
        const options = {
          method: 'GET',
          url: `https://easyneonwork.kaiten.ru/api/latest/cards/${card_id}`,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${KAITEN_TOKEN}`,
          },
        };

        const response = await axios.request(options);
        const description = response.data.description;

        if (description) {
          const linkRegex =
            /(https:\/\/(?:bluesales\.ru|easyneon.amocrm.ru)[^\]\s]+)/g;
          const match = description.match(linkRegex);

          if (match && match.length > 0) {
            const link = match[0];
            const deal = await this.prisma.deal.findFirst({
              where: {
                client: {
                  chatLink: link,
                },
              },
            });
            dealId = deal?.id ?? 0;
          }
        }
      } catch (error) {
        console.error('Error fetching Kaiten card:', error);
      }
    }
    return this.prisma.masterRepairReport.update({
      where: { id },
      data: {
        ...dto,
        dealId: dealId === 0 ? null : dealId,
      },
    });
  }

  async deleteMasterRepairReport(id: number) {
    const report = await this.prisma.masterRepairReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException(`Repair Report with ID ${id} not found`);
    }
    return this.prisma.masterRepairReport.delete({
      where: { id },
    });
  }

  async getStat(period: string) {
    // Проверка формата period (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException('Period must be in YYYY-MM format');
    }

    // Получаем год и месяц из period
    const [year, month] = period.split('-').map(Number);

    // Генерируем все даты для месяца
    const daysInMonth = new Date(year, month, 0).getDate();
    const allDates = Array.from({ length: daysInMonth }, (_, i) => {
      const day = (i + 1).toString().padStart(2, '0');
      return `${year}-${month.toString().padStart(2, '0')}-${day}`;
    });

    // Получаем мастеров, их отчеты и смены
    const masters = await this.prisma.user.findMany({
      where: {
        role: {
          shortName: { in: ['MASTER', 'RP'] },
        },
      },
      select: {
        id: true,
        fullName: true,
        deletedAt: true,
        masterReports: {
          where: {
            date: {
              startsWith: period,
            },
          },
          select: {
            date: true,
            els: true,
            type: true, // Добавляем выбор типа отчета
          },
        },
        masterShifts: {
          where: {
            shift_date: {
              startsWith: period,
            },
          },
          select: {
            shift_date: true,
          },
        },
      },
    });

    // Подсчитываем суммы смен, обычных и специальных элементов по дням
    const shiftsSumByDate: { [date: string]: number } = {};
    const regularElsSumByDate: { [date: string]: number } = {};
    const specialElsSumByDate: { [date: string]: number } = {};
    allDates.forEach((date) => {
      shiftsSumByDate[date] = 0;
      regularElsSumByDate[date] = 0;
      specialElsSumByDate[date] = 0;
    });

    masters.forEach((master) => {
      master.masterShifts.forEach((shift) => {
        shiftsSumByDate[shift.shift_date] =
          (shiftsSumByDate[shift.shift_date] || 0) + 1;
      });
      master.masterReports.forEach((report) => {
        const isSpecial = ['Уличная', 'РГБ', 'Смарт'].includes(report.type);
        if (isSpecial) {
          specialElsSumByDate[report.date] =
            (specialElsSumByDate[report.date] || 0) + report.els;
        } else {
          regularElsSumByDate[report.date] =
            (regularElsSumByDate[report.date] || 0) + report.els;
        }
      });
    });

    // Формируем результат для мастеров
    const result = masters.map((master) => {
      const elsByDate: {
        [date: string]: { regular: number; special: number };
      } = {};
      const shiftsByDate: { [date: string]: boolean } = {};

      // Инициализируем все даты
      allDates.forEach((date) => {
        elsByDate[date] = { regular: 0, special: 0 };
        shiftsByDate[date] = master.masterShifts.some(
          (shift) => shift.shift_date === date,
        );
      });

      // Суммируем обычные и специальные элементы по датам
      master.masterReports.forEach((report) => {
        const isSpecial = ['Уличная', 'РГБ', 'Смарт'].includes(report.type);
        if (isSpecial) {
          elsByDate[report.date].special =
            (elsByDate[report.date].special || 0) + report.els;
        } else {
          elsByDate[report.date].regular =
            (elsByDate[report.date].regular || 0) + report.els;
        }
      });

      // Подсчитываем рейтинг: сумма всех элементов / количество смен / 10
      const totalEls = Object.values(elsByDate).reduce(
        (sum, { regular, special }) => sum + regular + special,
        0,
      );
      const totalElsRating = Object.values(elsByDate).reduce(
        (sum, { regular, special }) => sum + regular + special * 1.5,
        0,
      );
      const totalShifts = master.masterShifts.length;
      const rating =
        totalShifts > 0
          ? Number((totalElsRating / totalShifts / 10).toFixed(2))
          : 0;

      return {
        masterId: master.id,
        fullName: master.fullName,
        deleatedAt: master.deletedAt,
        elsByDate,
        shiftsByDate,
        rating,
      };
    });

    // Сортируем мастеров по рейтингу от большего к меньшему
    result.sort((a, b) => b.rating - a.rating);

    return {
      dates: allDates,
      masters: result.filter((u) => u.deleatedAt === null || u.rating),
      shiftsSumByDate,
      regularElsSumByDate,
      specialElsSumByDate,
    };
  }

  async getPackers(user: UserDto) {
    const userSearch = ['PACKER'].includes(user.role.shortName)
      ? user.id
      : { gt: 0 };

    const users = await this.prisma.user.findMany({
      where: {
        role: {
          shortName: { in: ['PACKER'] },
        },
        id: userSearch,
      },
      select: {
        id: true,
        fullName: true,
        deletedAt: true,
        packerShifts: true,
        packerReports: true,
      },
    });
    return users.filter(
      (u) =>
        u.deletedAt === null ||
        u.packerReports.length > 0 ||
        u.packerShifts.length > 0,
    );
  }

  async createPackerReport(dto: CreatePackerReportDto) {
    const name = dto.name;
    let dealId = 0;

    if (dto.name.includes('easyneonwork.kaiten.ru/')) {
      const linkSplit = dto.name.split('/');
      const card_id = linkSplit[linkSplit.length - 1];

      try {
        const options = {
          method: 'GET',
          url: `https://easyneonwork.kaiten.ru/api/latest/cards/${card_id}`,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.KAITEN_TOKEN}`,
          },
        };

        const response = await axios.request(options);
        const description = response.data.description;

        if (description) {
          const linkRegex =
            /(https:\/\/(?:bluesales\.ru|easyneon\.amocrm\.ru)[^\]\s]+)/g;
          const match = description.match(linkRegex);

          if (match && match.length > 0) {
            const link = match[0]; // Берем первую найденную ссылку
            const deal = await this.prisma.deal.findFirst({
              where: {
                client: {
                  chatLink: link,
                },
              },
            });
            dealId = deal?.id ?? 0;
          }
        }
      } catch (error) {
        console.error('Error fetching Kaiten card:', error);
      }
    }

    return this.prisma.packerReport.create({
      data: {
        ...dto,
        name,
        dealId: dealId === 0 ? null : dealId,
      },
    });
  }

  async getPackerReports(userId: number, from: string, to: string) {
    const reports = await this.prisma.packerReport.findMany({
      where: {
        userId,
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { date: 'desc' },
    });
    const packersOtherReports = await this.prisma.otherReport.findMany({
      where: {
        userId,
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { date: 'desc' },
    });
    return [
      ...reports.map((report) => ({
        ...report,
        key: `report-${report.id}`,
      })),
      ...packersOtherReports.map((report) => ({
        ...report,
        key: `other-${report.id}`,
        isOther: true,
        type: 'Другое',
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
  }

  async updatePackerReport(
    id: number,
    dto: UpdatePackerReportDto,
    user: UserDto,
  ) {
    const report = await this.prisma.packerReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException(`Packer report with ID ${id} not found`);
    }

    let dealId = 0;
    const name = dto.name;

    if (dto.name && dto.name.includes('easyneonwork.kaiten.ru/')) {
      const linkSplit = dto.name.split('/');
      const card_id = linkSplit[linkSplit.length - 1];

      try {
        const options = {
          method: 'GET',
          url: `https://easyneonwork.kaiten.ru/api/latest/cards/${card_id}`,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.KAITEN_TOKEN}`,
          },
        };

        const response = await axios.request(options);
        const description = response.data.description;

        if (description) {
          const linkRegex =
            /(https:\/\/(?:bluesales\.ru|easyneon\.amocrm\.ru)[^\]\s]+)/g;
          const match = description.match(linkRegex);

          if (match && match.length > 0) {
            const link = match[0];
            const deal = await this.prisma.deal.findFirst({
              where: {
                client: {
                  chatLink: link,
                },
              },
            });
            dealId = deal?.id ?? 0;
          }
        }
      } catch (error) {
        console.error('Error fetching Kaiten card:', error);
      }
    }

    if (user.role.shortName === 'PACKER') {
      dto.comment = report.comment;
      dto.penaltyCost = report.penaltyCost;
    }

    return this.prisma.packerReport.update({
      where: { id },
      data: {
        ...dto,
        name,
        dealId: dealId === 0 ? null : dealId,
      },
    });
  }

  async deletePackerReport(id: number) {
    const report = await this.prisma.packerReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException(`Packer report with ID ${id} not found`);
    }
    return this.prisma.packerReport.delete({
      where: { id },
    });
  }

  async createPackerShifts(
    packerId: number,
    dto: CreatePackerShiftsDto,
  ): Promise<PackerShiftResponseDto[]> {
    const { shiftDates } = dto;

    const packer = await this.prisma.user.findUnique({
      where: { id: packerId },
    });
    if (!packer) {
      throw new BadRequestException('Packer not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.packerShift.deleteMany({
        where: {
          userId: packerId,
          shift_date: {
            startsWith: dto.period,
          },
        },
      });

      const shifts = await Promise.all(
        shiftDates.map((shift_date) =>
          tx.packerShift.create({
            data: {
              shift_date,
              userId: packerId,
            },
            select: {
              id: true,
              shift_date: true,
              userId: true,
            },
          }),
        ),
      );

      return shifts;
    });
  }

  async getPackerShifts(
    packerId: number,
    period: string,
  ): Promise<PackerShiftResponseDto[]> {
    const packer = await this.prisma.user.findUnique({
      where: { id: packerId },
    });
    if (!packer) {
      throw new BadRequestException('Packer not found');
    }

    return this.prisma.packerShift.findMany({
      where: {
        userId: packerId,
        shift_date: {
          startsWith: period,
        },
      },
      select: {
        id: true,
        shift_date: true,
        userId: true,
      },
    });
  }

  async getPackerStat(period: string) {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException('Period must be in YYYY-MM format');
    }

    const [year, month] = period.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const allDates = Array.from({ length: daysInMonth }, (_, i) => {
      const day = (i + 1).toString().padStart(2, '0');
      return `${year}-${month.toString().padStart(2, '0')}-${day}`;
    });

    const packers = await this.prisma.user.findMany({
      where: {
        role: {
          shortName: { in: ['PACKER'] },
        },
      },
      select: {
        id: true,
        fullName: true,
        deletedAt: true,
        packerReports: {
          where: {
            date: {
              startsWith: period,
            },
          },
          select: {
            date: true,
            items: true,
          },
        },
        packerShifts: {
          where: {
            shift_date: {
              startsWith: period,
            },
          },
          select: {
            shift_date: true,
          },
        },
      },
    });

    const shiftsSumByDate: { [date: string]: number } = {};
    const itemsSumByDate: { [date: string]: number } = {};
    allDates.forEach((date) => {
      shiftsSumByDate[date] = 0;
      itemsSumByDate[date] = 0;
    });

    packers.forEach((packer) => {
      packer.packerShifts.forEach((shift) => {
        shiftsSumByDate[shift.shift_date] =
          (shiftsSumByDate[shift.shift_date] || 0) + 1;
      });
      packer.packerReports.forEach((report) => {
        itemsSumByDate[report.date] =
          (itemsSumByDate[report.date] || 0) + report.items;
      });
    });

    const result = packers.map((packer) => {
      const itemsByDate: { [date: string]: number } = {};
      const shiftsByDate: { [date: string]: boolean } = {};

      allDates.forEach((date) => {
        itemsByDate[date] = 0;
        shiftsByDate[date] = packer.packerShifts.some(
          (shift) => shift.shift_date === date,
        );
      });

      packer.packerReports.forEach((report) => {
        itemsByDate[report.date] =
          (itemsByDate[report.date] || 0) + report.items;
      });

      return {
        packerId: packer.id,
        fullName: packer.fullName,
        itemsByDate,
        shiftsByDate,
        deleatedAt: packer.deletedAt,
        reports: packer.packerReports,
        shifts: packer.packerShifts,
      };
    });

    return {
      dates: allDates,
      packers: result.filter(
        (u) =>
          u.deleatedAt === null || u.reports.length > 0 || u.shifts.length > 0,
      ),
      shiftsSumByDate,
      itemsSumByDate,
    };
  }

  async createOtherReport(dto: CreateOtherReportDto) {
    console.log(dto);
    return this.prisma.otherReport.create({
      data: { ...dto },
    });
  }

  async updateOtherReport(id: number, dto: UpdateOtherReportDto) {
    const report = await this.prisma.otherReport.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException(`Other Report with ID ${id} not found`);
    }
    return this.prisma.otherReport.update({
      where: { id },
      data: { ...dto },
    });
  }

  async deleteOtherReport(id: number) {
    const report = await this.prisma.otherReport.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException(`Other Report with ID ${id} not found`);
    }
    return this.prisma.otherReport.delete({ where: { id } });
  }

  // LOGISTS

  async getLogists(user: UserDto) {
    const userSearch = ['LOGIST'].includes(user.role.shortName)
      ? user.id
      : { gt: 0 };

    const users = await this.prisma.user.findMany({
      where: {
        role: {
          shortName: { in: ['LOGIST'] },
        },
        id: userSearch,
      },
      select: {
        id: true,
        fullName: true,
        deletedAt: true,
        logistShifts: true,
      },
    });
    return users.filter(
      (u) => u.deletedAt === null || u.logistShifts.length > 0,
    );
  }

  async getlogistShifts(
    logistId: number,
    from: string,
    to: string,
  ): Promise<LogistShiftResponseDto[]> {
    const logist = await this.prisma.user.findUnique({
      where: { id: logistId },
    });
    if (!logist) {
      throw new BadRequestException('logist not found');
    }

    return this.prisma.logistShift.findMany({
      where: {
        userId: logistId,
        shift_date: {
          gte: from,
          lte: to,
        },
      },
      select: {
        id: true,
        shift_date: true,
        userId: true,
        cost: true,
      },
    });
  }

  async createLogistShifts(
    logistId: number,
    dto: CreateLogistShiftsDto,
  ): Promise<LogistShiftResponseDto[]> {
    const { shiftDates } = dto;

    const logist = await this.prisma.user.findUnique({
      where: { id: logistId },
    });
    if (!logist) {
      throw new BadRequestException('logist not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.logistShift.deleteMany({
        where: {
          userId: logistId,
          shift_date: {
            startsWith: dto.period,
          },
        },
      });

      const shifts = await Promise.all(
        shiftDates.map((shift_date) =>
          tx.logistShift.create({
            data: {
              shift_date,
              userId: logistId,
              cost: 3500,
            },
            select: {
              id: true,
              shift_date: true,
              userId: true,
              cost: true,
            },
          }),
        ),
      );

      return shifts;
    });
  }
}
