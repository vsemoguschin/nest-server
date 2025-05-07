import { Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryCreateDto } from './dto/delivery-create.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserDto } from '../users/dto/user.dto';
import axios from 'axios';

@Injectable()
export class DeliveriesService {
  constructor(private readonly prisma: PrismaService) {}

  async checkTrack(track: string) {
    const CDEK_Account = 'DRCqUsjqi1SW9NuqSSg2mkiaH1oAQKmk';
    const CDEK_password = 'V1OSykuiWzG07SEXUZ6JknBfE4pRt9lo';
    // console.log(track);
    const statuses = [
      'CREATED', // Создана
      'DELIVERED', // Вручен
    ]

    try {
      const response = await axios.post(
        'https://api.cdek.ru/v2/oauth/token',
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: CDEK_Account, // Тестовый account
          client_secret: CDEK_password, // Тестовый secure_password
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
      const { access_token } = response.data;

      const responseOrders = await axios.get('https://api.cdek.ru/v2/orders', {
        params: {
          cdek_number: 10111755737,
        },
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });
      console.log('Response statuses:', responseOrders.data);
      // console.log('Response statuses:', responseOrders.data.entity.statuses);
      // console.log(
      //   'Response sum:',
      //   responseOrders.data.entity.delivery_detail.total_sum,
      // );
      return {
        price: responseOrders.data.entity.delivery_detail.total_sum,
      };
    } catch (error) {
      console.error('Error while checking track:', error.message);
      // throw new Error('Failed to check track information');
    }
  }

  // Создание записи о доставке
  async create(createDto: DeliveryCreateDto, user: UserDto) {
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
