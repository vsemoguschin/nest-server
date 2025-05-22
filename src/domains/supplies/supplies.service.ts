import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SuppliesCreateDto } from './dto/supplies-create.dto';

@Injectable()
export class SuppliesService {
  constructor(private readonly prisma: PrismaService) {}
  async create(suppliesCreateDto: SuppliesCreateDto) {
    const newSupplie = await this.prisma.supplies.create({
      data: suppliesCreateDto,
    });

    await this.prisma.suppliers.upsert({
      where: { name: suppliesCreateDto.supplier },
      update: {},
      create: {
        name: suppliesCreateDto.supplier,
      },
    });
    // console.log(newSupplie);
    return newSupplie;
  }

  async getSupplies(period: string) {
    return await this.prisma.supplies.findMany({
      where: {
        date: {
          startsWith: period,
        },
      },
    });
  }

  async delete(id: number) {
    return this.prisma.supplies.delete({
      where: {
        id,
      },
    });
  }

  async update(id: number, suppliesCreateDto: SuppliesCreateDto) {
    return this.prisma.supplies.update({
      where: {
        id,
      },
      data: {
        ...suppliesCreateDto,
      },
    });
  }

  async getSuppliers() {
    return this.prisma.suppliers.findMany();
  }
}
