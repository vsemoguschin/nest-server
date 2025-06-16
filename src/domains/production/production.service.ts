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
import axios from 'axios';
const KAITEN_TOKEN = process.env.KAITEN_TOKEN;

@Injectable()
export class ProductionService {
  constructor(private prisma: PrismaService) {}

  async getPredata(user: UserDto) {
    if (['ADMIN', 'G', 'DP'].includes(user.role.shortName)) {
      return {
        tabs: [
          { value: 'table', label: 'График' },
          { value: 'masters', label: 'Сборка' },
          { value: 'package', label: 'Упаковка' },
          { value: 'supplie', label: 'Закупки' },
        ],
      };
    }
    if (['LOGIST'].includes(user.role.shortName)) {
      return { tabs: [{ value: 'supplie', label: 'Закупки' }] };
    }
    if (['MASTER'].includes(user.role.shortName)) {
      return { tabs: [{ value: 'masters', label: 'Сборка' }] };
    }
  }

  async getMasters(user: UserDto) {
    const users = await this.prisma.user.findMany({
      where: {
        role: { shortName: 'MASTER' },
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
          // Регулярное выражение для поиска ссылок на bluesales.ru или easyneon.amocrm.ru
          const linkRegex = /(https:\/\/(?:bluesales\.ru|easyneon\.amocrm\.ru)[^\]\s]+)/g;
          const match = description.match(linkRegex);
        
          if (match && match.length > 0) {
            const link = match[0]; // Берем первую найденную ссылку
            console.log(link);
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
    return this.prisma.masterReport.update({
      where: { id },
      data: dto,
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
}
