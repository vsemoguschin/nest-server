import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  SupplieCreateDto,
  SuppliePositionCreateDto,
} from './dto/supplie-create.dto';
import { UserDto } from '../users/dto/user.dto';

@Injectable()
export class SuppliesService {
  constructor(private readonly prisma: PrismaService) {}
  async create(suppliesCreateDto: SupplieCreateDto) {
    // Извлекаем positions и остальные данные
    const { positions, ...supplieData } = suppliesCreateDto;

    const supplie = await this.prisma.supplie.create({
      data: supplieData,
    });
    if (positions && positions.length > 0) {
      await this.prisma.suppliePosition.createMany({
        data: positions.map((position) => ({
          name: position.name,
          quantity: position.quantity,
          priceForItem: position.priceForItem,
          category: position.category,
          supplieId: supplie.id,
        })),
      });
    }

    // Upsert для suppliers
    await this.prisma.suppliers.upsert({
      where: { name: suppliesCreateDto.supplier },
      update: {},
      create: {
        name: suppliesCreateDto.supplier,
      },
    });

    // Получаем созданную запись Supplie с включенными positions
    const fullSupplie = await this.prisma.supplie.findUnique({
      where: { id: supplie.id },
      include: { positions: true }, // Включаем связанные позиции
    });

    // Возвращаем созданную запись Supplie
    if (!fullSupplie) {
      return fullSupplie;
    }

    return {
      ...fullSupplie,
      positions: fullSupplie.positions.map((position) => ({
        ...position,
        quantity: position.quantity.toNumber(),
      })),
    };
  }

  async getSupplies(from: string, to: string, user: UserDto) {
    const supplies = await this.prisma.supplie.findMany({
      where: {
        date: {
          gte: from,
          lte: to,
        },
      },
      include: {
        positions: true,
      },
      orderBy: {
        date: 'desc',
      },
    });
    const positions = supplies.flatMap((s) => s.positions).map((p) => p.name);
    const suppliers = supplies.map((s) => s.supplier);
    const categories = supplies
      .flatMap((s) => s.positions)
      .map((p) => p.category);
    const uniquePositions = Array.from(
      new Map(positions.map((item) => [item, item])).values(),
    );
    const uniqueCategories = Array.from(
      new Map(categories.map((item) => [item, item])).values(),
    );
    const uniqueSuppliers = Array.from(
      new Map(suppliers.map((item) => [item, item])).values(),
    );

    // console.log(uniquePositions);
    const normalizedSupplies = supplies.map((supplie) => ({
      ...supplie,
      positions: supplie.positions.map((position) => ({
        ...position,
        quantity: position.quantity.toNumber(),
      })),
    }));

    return {
      supplies: normalizedSupplies,
      filters: {
        uniquePositions,
        uniqueCategories,
        uniqueSuppliers,
      },
    };
  }

  async delete(id: number): Promise<SupplieCreateDto> {
    const deletedSupplie = await this.prisma.$transaction(async (prisma) => {
      const existingSupplie = await prisma.supplie.findUnique({
        where: { id },
        include: { positions: true },
      });
      if (!existingSupplie) {
        throw new NotFoundException(`Supplie с id ${id} не найдена`);
      }

      await prisma.suppliePosition.deleteMany({
        where: { supplieId: id },
      });

      await prisma.supplie.delete({
        where: { id },
      });

      return {
        ...existingSupplie,
        positions: existingSupplie.positions.map((position) => ({
          name: position.name,
          quantity: position.quantity.toNumber(),
          priceForItem: position.priceForItem,
          category: position.category,
        })),
      };
    });

    return deletedSupplie;
  }

  async update(
    id: number,
    suppliesCreateDto: SupplieCreateDto,
  ): Promise<SupplieCreateDto> {
    // Проверяем, что positions не пустой
    if (
      !suppliesCreateDto.positions ||
      suppliesCreateDto.positions.length === 0
    ) {
      throw new BadRequestException('Массив positions не может быть пустым');
    }

    // Извлекаем positions и остальные данные
    const { positions, ...supplieData } = suppliesCreateDto;

    // Обновляем запись Supplie и связанные SuppliePosition в транзакции
    const updatedSupplie = await this.prisma.$transaction(async (prisma) => {
      // Проверяем существование записи Supplie
      const existingSupplie = await prisma.supplie.findUnique({
        where: { id },
      });
      if (!existingSupplie) {
        throw new NotFoundException(`Supplie с id ${id} не найдена`);
      }

      // Обновляем запись Supplie
      const supplie = await prisma.supplie.update({
        where: { id },
        data: supplieData,
      });

      // Удаляем существующие SuppliePosition
      await this.prisma.suppliePosition.deleteMany({
        where: { supplieId: id },
      });

      // Создаем новые записи SuppliePosition
      await this.prisma.suppliePosition.createMany({
        data: positions.map((position) => ({
          name: position.name,
          quantity: position.quantity,
          priceForItem: position.priceForItem,
          supplieId: supplie.id,
          category: position.category,
        })),
      });

      // Upsert для suppliers
      await this.prisma.suppliers.upsert({
        where: { name: suppliesCreateDto.supplier },
        update: {},
        create: {
          name: suppliesCreateDto.supplier,
        },
      });

      // Получаем обновленную запись Supplie с включенными positions
      const fullSupplie = await prisma.supplie.findUnique({
        where: { id: supplie.id },
        include: { positions: true },
      });

      // Преобразуем в формат SupplieCreateDto
      return {
        ...supplie,
        positions: fullSupplie!.positions.map((position) => ({
          name: position.name,
          quantity: position.quantity.toNumber(),
          priceForItem: position.priceForItem,
          category: position.category,
        })) as SuppliePositionCreateDto[],
      };
    });

    return updatedSupplie;
  }

  async getSuppliers() {
    return await this.prisma.suppliers.findMany();
  }

  async getPositions() {
    const uniquePositions = await this.prisma.suppliePosition.groupBy({
      by: ['name', 'category'],
      _count: {
        _all: true,
      },
    });

    return uniquePositions.map((position) => ({
      name: position.name,
      category: position.category,
    }));
  }
}
