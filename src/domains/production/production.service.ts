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
const KAITEN_TOKEN = process.env.KAITEN_TOKEN;

@Injectable()
export class ProductionService {
  constructor(private prisma: PrismaService) {}

  async getPredata(user: UserDto) {
    if (['ADMIN', 'G', 'DP'].includes(user.role.shortName)) {
      return {
        tabs: [
          { value: 'table', label: 'Сборка' },
          { value: 'masters', label: 'Сборщики' },
          { value: 'package', label: 'Упаковщики' },
          { value: 'packers-stat', label: 'Упаковка' },
          { value: 'supplie', label: 'Закупки' },
        ],
      };
    }
    if (['LOGIST'].includes(user.role.shortName)) {
      return { tabs: [{ value: 'supplie', label: 'Закупки' }] };
    }
    if (['MASTER'].includes(user.role.shortName)) {
      return { tabs: [{ value: 'masters', label: 'Сборщики' }] };
    }
    if (['PACKER'].includes(user.role.shortName)) {
      return { tabs: [{ value: 'package', label: 'Упаковщики' }] };
    }
  }

  async getMasters(user: UserDto) {
    const userSearch = user.role.shortName === 'MASTER' ? user.id : { gt: 0 };

    const users = await this.prisma.user.findMany({
      where: {
        role: { shortName: 'MASTER' },
        id: userSearch,
      },
      select: {
        id: true,
        fullName: true,
      },
    });
    return users;
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
            dealId = deal?.id ?? 0;
            console.log(deal);
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

  async getMasterReports(userId: number, period) {
    return this.prisma.masterReport.findMany({
      where: {
        userId,
        date: {
          startsWith: period,
        },
      },
      orderBy: { date: 'desc' },
    });
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

  async updateMasterReport(id: number, dto: UpdateMasterReportDto) {
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
    return this.prisma.masterReport.update({
      where: { id },
      data: {
        ...dto,
        dealId: dealId === 0 ? null : dealId,
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
          shortName: 'MASTER',
        },
      },
      select: {
        id: true,
        fullName: true,
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
      const totalShifts = master.masterShifts.length;
      const rating =
        totalShifts > 0 ? Number((totalEls / totalShifts / 10).toFixed(2)) : 0;

      return {
        masterId: master.id,
        fullName: master.fullName,
        elsByDate,
        shiftsByDate,
        rating,
      };
    });

    // Сортируем мастеров по рейтингу от большего к меньшему
    result.sort((a, b) => b.rating - a.rating);

    return {
      dates: allDates,
      masters: result,
      shiftsSumByDate,
      regularElsSumByDate,
      specialElsSumByDate,
    };
  }
  
  async getPackers(user: UserDto) {
    const userSearch = user.role.shortName === 'PACKER' ? user.id : { gt: 0 };

    const users = await this.prisma.user.findMany({
      where: {
        role: { shortName: 'PACKER' },
        id: userSearch,
      },
      select: {
        id: true,
        fullName: true,
      },
    });
    return users;
  }

  async createPackerReport(dto: CreatePackerReportDto) {
    let name = dto.name;
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
            name = match[0];
            const deal = await this.prisma.deal.findFirst({
              where: {
                client: {
                  chatLink: name,
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

  async getPackerReports(userId: number, period: string) {
    return this.prisma.packerReport.findMany({
      where: {
        userId,
        date: {
          startsWith: period,
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  async updatePackerReport(id: number, dto: UpdatePackerReportDto) {
    const report = await this.prisma.packerReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException(`Packer report with ID ${id} not found`);
    }

    let dealId = 0;
    let name = dto.name;

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
            name = match[0];
            const deal = await this.prisma.deal.findFirst({
              where: {
                client: {
                  chatLink: name,
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
          shortName: 'PACKER',
        },
      },
      select: {
        id: true,
        fullName: true,
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
      };
    });

    return {
      dates: allDates,
      packers: result,
      shiftsSumByDate,
      itemsSumByDate,
    };
  }
}
