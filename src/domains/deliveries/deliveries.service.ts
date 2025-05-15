import { Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryCreateDto } from './dto/delivery-create.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserDto } from '../users/dto/user.dto';
import { CdekService } from 'src/services/cdek.service';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cdekService: CdekService,
  ) {}

  async checkTrack(track: string) {
    try {
      // const data = await this.cdekService.getRegisters();
      // const orders = data.registries
      //   .flatMap((r) => r.orders)
      //   .map((o) => o.cdek_number);
      // console.log(orders);
      // const dels = await this.prisma.delivery.findMany({
      //   where: {
      //     track: {
      //       in: orders,
      //     },
      //   },
      // });
      // console.log(dels);
      return await this.cdekService.checkTrackInfo(track);
    } catch (error) {
      console.error('Ошибка при проверке трека:', error.message);
      throw new NotFoundException(`Ошибка при проверке трека ${track} не найдена`);
    }
  }

  // Создание записи о доставке
  async create(createDto: DeliveryCreateDto, user: UserDto) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: createDto.dealId },
    });
    if (!deal) {
      throw new NotFoundException(`Сделка с ID ${createDto.dealId} не найдена`);
    }
    return this.prisma.delivery.create({
      data: {
        date: createDto.date,
        method: createDto.method || '',
        type: createDto.type || '',
        description: createDto.description || '',
        track: createDto.track || '',
        status: createDto.status || 'Создана',
        price: createDto.price || 0,
        dealId: createDto.dealId,
        deliveredDate: createDto.deliveredDate,
        userId: user.id,
        workSpaceId: deal.workSpaceId,
      },
      include: {
        deal: true, // Включаем данные сделки в ответ
      },
    });
  }

  // Редактирование записи
  async update(id: number, updateDto: DeliveryCreateDto) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
    });

    if (!delivery) {
      throw new NotFoundException(`Доставка с ID ${id} не найдена`);
    }

    return this.prisma.delivery.update({
      where: { id },
      data: {
        date: updateDto.date,
        method: updateDto.method,
        type: updateDto.type,
        description: updateDto.description,
        track: updateDto.track,
        status: updateDto.status,
        price: updateDto.price,
        deliveredDate: updateDto.deliveredDate,
        dealId: updateDto.dealId,
      },
      include: {
        deal: true,
      },
    });
  }

  // Удаление записи
  async delete(id: number) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
    });

    if (!delivery) {
      throw new NotFoundException(`Доставка с ID ${id} не найдена`);
    }

    await this.prisma.delivery.delete({
      where: { id },
    });
  }
}
