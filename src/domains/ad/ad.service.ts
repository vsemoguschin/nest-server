import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdExpenseCreateDto } from './dto/ad-expense-create.dto';

@Injectable()
export class AdService {
  constructor(private readonly prisma: PrismaService) {}

  async createAdExpense(adExpenseCreateDto: AdExpenseCreateDto) {
    const adSource = await this.prisma.adSource.findUnique({
      where: {
        id: adExpenseCreateDto.adSourceId || 0,
      },
    });

    if (!adSource) {
      throw new NotFoundException(
        `Источник с id ${adExpenseCreateDto.adSourceId} не найдено.`,
      );
    }

    const newAdExpense = await this.prisma.adExpense.create({
      data: {
        ...adExpenseCreateDto,
        period: adExpenseCreateDto.date.slice(0, 7),
        workSpaceId: adSource.workSpaceId,
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
        // dealSource: true,
        adSource: true,
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
        source: s.adSource?.title,
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

  async getSources() {
    return await this.prisma.adSource.findMany();
  }
}
