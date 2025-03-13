import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdExpenseCreateDto } from './dto/ad-expense-create.dto';

@Injectable()
export class AdService {
  constructor(private readonly prisma: PrismaService) {}

  async createAdExpense(adExpenseCreateDto: AdExpenseCreateDto) {
    const dealSource = await this.prisma.dealSource.findUnique({
      where: {
        id: adExpenseCreateDto.dealSourceId,
      },
    });

    if (!dealSource) {
      throw new NotFoundException(
        `Источник с id ${adExpenseCreateDto.dealSourceId} не найдено.`,
      );
    }

    const newAdExpense = await this.prisma.adExpense.create({
      data: {
        ...adExpenseCreateDto,
        period: adExpenseCreateDto.date.slice(0, 7),
        workSpaceId: dealSource.workSpaceId,
      },
    });
    // console.log(newAdExpense);
    return newAdExpense;
  }

  async getAdExpensesList(period: string) {
    const sources = await this.prisma.adExpense.findMany({
      where: {
        date: {
          startsWith: period,
        },
      },
      include: {
        dealSource: true,
        workSpace: {
          include: {
            reports: {
              where: {
                date: {
                  startsWith: period,
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

    return sources.map((s) => {
      return {
        ...s,
        source: s.dealSource.title,
        workSpace: s.workSpace.title,
      };
    });
  }

  async delete(id: number) {
    // Проверяем, существует ли доп
    const adExists = await this.prisma.adExpense.findUnique({
      where: { id },
    });
    if (!adExists) {
      throw new NotFoundException(`Запись с ID ${id} не найдена`);
    }

    // Удаляем доп
    return this.prisma.adExpense.delete({
      where: { id },
    });
  }
}
