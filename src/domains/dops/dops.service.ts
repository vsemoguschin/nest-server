import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateDopDto } from './dto/dop-create.dto';
import { UserDto } from '../users/dto/user.dto';

@Injectable()
export class DopsService {
  constructor(private prisma: PrismaService) {}

  async create(createDopDto: CreateDopDto, user: UserDto) {
    // Проверяем, существует ли сделка
    const dealExists = await this.prisma.deal.findUnique({
      where: { id: createDopDto.dealId },
    });
    if (!dealExists) {
      throw new NotFoundException(
        `Сделка с ID ${createDopDto.dealId} не найдена`,
      );
    }

    const managerExists = await this.prisma.user.findUnique({
      where: { id: createDopDto.userId, deletedAt: null },
    });
    if (!managerExists) {
      throw new NotFoundException(
        `Менеджера с ID ${createDopDto.userId} не найден`,
      );
    }
    // return console.log(managerExists);

    // Вычисляем period из saleDate
    const period = createDopDto.saleDate.slice(0, 7); // Например, "2025-02" из "2025-02-20"

    // Создаем запись Dop
    const createdDop = await this.prisma.dop.create({
      data: {
        saleDate: createDopDto.saleDate,
        type: createDopDto.type,
        price: createDopDto.price,
        description: createDopDto.description ?? '', // По умолчанию пустая строка
        period, // Вычисленное значение
        userId: createDopDto.userId, // Берем из текущего пользователя
        dealId: createDopDto.dealId,
        workSpaceId: managerExists.workSpaceId,
      },
    });

    await this.prisma.dopsType.upsert({
      where: { title: createdDop.type },
      update: {},
      create: { title: createdDop.type },
    });

    // Формируем комментарий для аудита
    const auditComment = `Добавил доп(${createdDop.type}) на сумму ${createdDop.price} руб.`;

    // Создаем запись в аудите
    await this.prisma.dealAudit.create({
      data: {
        dealId: createdDop.dealId,
        userId: user.id,
        action: 'Создание доп. услуги',
        comment: auditComment,
      },
    });

    return createdDop;
  }

  async delete(id: number, user: UserDto) {
    // Проверяем, существует ли доп
    const dopExists = await this.prisma.dop.findUnique({
      where: { id },
    });
    if (!dopExists) {
      throw new NotFoundException(`Доп. услуга с ID ${id} не найдена`);
    }

    // Формируем комментарий для аудита
    const auditComment = `Удалил доп(${dopExists.type}) на сумму ${dopExists.price} руб.`;

    // Создаем запись в аудите
    await this.prisma.dealAudit.create({
      data: {
        dealId: dopExists.dealId,
        userId: user.id,
        action: 'Удаление доп. услуги',
        comment: auditComment,
      },
    });

    // Удаляем доп
    return this.prisma.dop.delete({
      where: { id },
    });
  }

  async getDopTypes() {
    const dopTypes = await this.prisma.dopsType.findMany({
      orderBy: { title: 'asc' }, // Сортировка по алфавиту (опционально)
    });
    return dopTypes.map((t) => t.title);
  }
}
