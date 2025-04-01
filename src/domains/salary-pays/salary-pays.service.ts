import { Injectable, NotFoundException } from '@nestjs/common';
import { SalaryPayCreateDto } from './dto/salary-pay-create.dto';
import { SalaryPayUpdateStatusDto } from './dto/salary-pay-update-status.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SalaryPaysService {
  constructor(private readonly prisma: PrismaService) {}

  // Создание записи о выплате
  async create(createDto: SalaryPayCreateDto) {
    // Проверяем, существует ли пользователь
    const userExists = await this.prisma.user.findUnique({
      where: { id: createDto.userId },
    });
    if (!userExists) {
      throw new NotFoundException(
        `Пользователь с ID ${createDto.userId} не найден`,
      );
    }

    return this.prisma.salaryPay.create({
      data: {
        date: createDto.date,
        period: createDto.period,
        price: createDto.price,
        status: createDto.status,
        userId: createDto.userId,
        workSpaceId: userExists.workSpaceId,
      },
      include: {
        user: true, // Включаем данные пользователя в ответ
      },
    });
  }

  // Получение записей по периоду
  async findByPeriod(period: string) {
    return this.prisma.salaryPay.findMany({
      where: {
        period,
      },
      include: {
        user: true,
      },
    });
  }

  // Удаление записи
  async delete(id: number) {
    const salaryPay = await this.prisma.salaryPay.findUnique({
      where: { id },
    });

    if (!salaryPay) {
      throw new NotFoundException(`Запись с ID ${id} не найдена`);
    }

    await this.prisma.salaryPay.delete({
      where: { id },
    });
  }

  // Обновление статуса
  async updateStatus(id: number, updateStatusDto: SalaryPayUpdateStatusDto) {
    const salaryPay = await this.prisma.salaryPay.findUnique({
      where: { id },
    });

    if (!salaryPay) {
      throw new NotFoundException(`Запись с ID ${id} не найдена`);
    }

    return this.prisma.salaryPay.update({
      where: { id },
      data: {
          status: updateStatusDto.status,
          date: new Date().toISOString().slice(0, 10),
      },
      include: {
        user: true,
      },
    });
  }
}
