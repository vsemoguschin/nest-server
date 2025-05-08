import { Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryCreateDto } from './dto/delivery-create.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserDto } from '../users/dto/user.dto';
import axios from 'axios';

@Injectable()
export class DeliveriesService {
  constructor(private readonly prisma: PrismaService) {}

  async checkTrack(track: string) {
    try {
      // Получение токена авторизации
      const response = await axios.post(
        'https://api.cdek.ru/v2/oauth/token',
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: process.env.CDEK_ACCOUNT || '',
          client_secret: process.env.CDEK_PASSWORD || '',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
      const { access_token } = response.data;

      try {
        // Получение информации о заказе
        const responseOrders = await axios.get(
          'https://api.cdek.ru/v2/orders',
          {
            params: {
              cdek_number: track,
            },
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          },
        );

        const statuses = responseOrders.data.entity.statuses;
        const is_client_return = responseOrders.data.entity.is_client_return;

        let status = '';
        let send_date = '';
        let delivered_date = '';

        if (statuses.find((s) => s.code === 'CREATED')) {
          status = 'Создана';
        }
        if (statuses.find((s) => s.code === 'RECEIVED_AT_SHIPMENT_WAREHOUSE')) {
          status = 'Отправлена';
          send_date = statuses
            .find((s) => s.code === 'RECEIVED_AT_SHIPMENT_WAREHOUSE')
            .date_time.slice(0, 10);
        }
        if (statuses.find((s) => s.code === 'DELIVERED')) {
          status = 'Вручена';
          delivered_date = statuses
            .find((s) => s.code === 'DELIVERED')
            .date_time.slice(0, 10);
        }
        if (is_client_return) {
          status = 'Возврат';
        }

        return {
          price: responseOrders.data.entity.delivery_detail.total_sum,
          status,
          send_date,
          delivered_date,
        };
      } catch (orderError) {
        // Если возникла ошибка при получении информации о заказе, возвращаем пустой объект
        console.error('Error fetching order information:', orderError.message);
        return {
          price: 0,
          status: 'Создана',
          send_date: '',
          delivered_date: '',
        };
      }
    } catch (authError) {
      // Если возникла ошибка при получении токена авторизации, выбрасываем исключение
      console.error(
        'Error while authenticating with CDEK API:',
        authError.message,
      );
      throw new NotFoundException(`Доставка с ID ${track} не найдена`);
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
