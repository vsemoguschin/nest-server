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
      return await this.cdekService.checkTrackInfo(track);
    } catch (error) {
      console.error('Ошибка при проверке трека:', error.message);
      throw new NotFoundException(
        `Ошибка при проверке трека ${track} не найдена`,
      );
    }
  }

  async checkRegisters(period: string) {
    try {
      // return console.log(days);
      // Resolve all async calls using Promise.all
      const { tracks, sum } = await this.cdekService.getRegisters(period);
      console.log('total', sum);

      const dels = await this.prisma.delivery.findMany({
        where: {
          track: {
            in: tracks,
          },
          deal: {
            payments: {
              some: {
                method: 'Наложка',
                isConfirmed: false, // Только неоплаченные наложки
              },
            },
          },
        },
        include: {
          deal: {
            include: {
              payments: true,
            },
          },
        },
      });

      const paymentsId = dels.flatMap((d) =>
        d.deal.payments
          .filter((p) => p.method === 'Наложка')
          .map((p) => {
            return { id: p.id, method: p.method, isConfirmed: p.isConfirmed };
          }),
      );
      console.log(paymentsId);

      await this.prisma.payment.updateMany({
        where: {
          id: {
            in: paymentsId.map((p) => p.id),
          },
        },
        data: {
          isConfirmed: true,
        },
      });

      return {
        sum,
        message: `Реестры  за ${period} подтверждены. Обновлено ${paymentsId.length} платежей.`,
      };
    } catch (error) {
      console.error('Ошибка при проверке реестров:', error.message);
      throw new NotFoundException(`Ошибка при проверке реестров`);
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
    const createdDelivery = await this.prisma.delivery.create({
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

    // Формируем комментарий для аудита
    const auditComment = `Добавил доставку(${createdDelivery.method})`;

    // Создаем запись в аудите
    await this.prisma.dealAudit.create({
      data: {
        dealId: createdDelivery.dealId,
        userId: user.id,
        action: 'Добавление доставки',
        comment: auditComment,
      },
    });

    return createdDelivery;
  }

  // Редактирование записи
  async update(id: number, updateDto: DeliveryCreateDto, user: UserDto) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
    });

    if (!delivery) {
      throw new NotFoundException(`Доставка с ID ${id} не найдена`);
    }

    // Словарь для маппинга полей на русские названия
    const fieldNames: Record<string, string> = {
      date: 'Дата отправки',
      method: 'Метод доставки',
      type: 'Тип доставки',
      description: 'Описание',
      track: 'Трек-номер',
      status: 'Статус',
      price: 'Стоимость',
      deliveredDate: 'Дата доставки',
      dealId: 'ID сделки',
    };

    // Сравниваем поля updateDto с delivery
    const changedFields: { field: string; oldValue: any; newValue: any }[] = [];
    const fieldsToCompare = Object.keys(fieldNames);

    fieldsToCompare.forEach((field) => {
      if (
        updateDto[field] !== undefined && // Проверяем, что поле передано
        updateDto[field] !== delivery[field] // Проверяем, что значение изменилось
      ) {
        changedFields.push({
          field: fieldNames[field], // Используем русское название
          oldValue: delivery[field],
          newValue: updateDto[field],
        });
      }
    });

    // Обновляем доставку и создаем аудит внутри транзакции
    return await this.prisma.$transaction(async (prisma) => {
      const updatedDelivery = await prisma.delivery.update({
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

      // Создаем отдельную запись в аудите для каждого измененного поля
      if (changedFields.length > 0) {
        await Promise.all(
          changedFields.map((change) =>
            prisma.dealAudit.create({
              data: {
                dealId: updatedDelivery.dealId,
                userId: user.id,
                action: 'Обновление доставки',
                comment: `Изменение поля "${change.field}": с "${change.oldValue}" на "${change.newValue}"`,
              },
            }),
          ),
        );
      } else {
        // Если изменений нет, создаем одну запись
        await prisma.dealAudit.create({
          data: {
            dealId: updatedDelivery.dealId,
            userId: user.id,
            action: 'Обновление доставки',
            comment: 'Обновление доставки без изменений полей',
          },
        });
      }

      return updatedDelivery;
    });
  }

  // Удаление записи
  async delete(id: number, user: UserDto) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
    });

    if (!delivery) {
      throw new NotFoundException(`Доставка с ID ${id} не найдена`);
    }

    // Формируем комментарий для аудита
    const auditComment = `Удалил доставку(${delivery.method})`;

    // Создаем запись в аудите
    await this.prisma.dealAudit.create({
      data: {
        dealId: delivery.dealId,
        userId: user.id,
        action: 'Удаление доставки',
        comment: auditComment,
      },
    });

    await this.prisma.delivery.delete({
      where: { id },
    });
  }
}
