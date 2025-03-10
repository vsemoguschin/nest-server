import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdExpenseCreateDto } from './dto/ad-expense-create.dto';

@Injectable()
export class AdService {
  constructor(private readonly prisma: PrismaService) {}

  async createAdExpense(adExpenseCreateDto: AdExpenseCreateDto) {
    const newAdExpense = await this.prisma.adExpense.create({
      data: {
        ...adExpenseCreateDto,
        period: adExpenseCreateDto.date.slice(0, 7),
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
      },
      orderBy: {
        date: 'desc',
      },
    });
    return sources.map((s) => {
      return {
        ...s,
        source: s.dealSource.title,
      };
    });
  }
}
