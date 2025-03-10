import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDealDto } from './dto/deal-create.dto';
import { UserDto } from '../users/dto/user.dto';
import { UpdateDealDto } from './dto/deal-update.dto';
import { UpdateDealersDto } from './dto/dealers-update.dto';

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDealDto: CreateDealDto, user: UserDto) {
    const newDeal = await this.prisma.deal.create({
      data: {
        ...createDealDto,
        workSpaceId: user.workSpaceId,
        groupId: user.groupId,
        userId: user.id,
        period: createDealDto.saleDate.slice(0, 7),
      },
    });
    await this.prisma.dealUser.create({
      data: {
        userId: user.id,
        dealId: newDeal.id,
        price: createDealDto.price,
      },
    });

    await this.prisma.clothingMethod.upsert({
      where: { title: createDealDto.clothingMethod },
      update: {},
      create: {
        title: createDealDto.clothingMethod,
      },
    });
    await this.prisma.dealSource.upsert({
      where: { title: createDealDto.source },
      update: {},
      create: {
        title: createDealDto.source,
        workSpaceId: newDeal.workSpaceId,
      },
    });
    await this.prisma.adTag.upsert({
      where: { title: createDealDto.adTag },
      update: {},
      create: {
        title: createDealDto.adTag,
      },
    });
    // console.log(newDeal);
    return newDeal;
  }

  async getList(user: UserDto, start: string, end: string) {
    const workspacesSearch =
      user.role.department === 'administration' ? { gt: 0 } : user.workSpaceId;
    // Запрашиваем сделки, у которых saleDate попадает в диапазон
    const deals = await this.prisma.deal.findMany({
      where: {
        // deletedAt: null,
        saleDate: {
          gte: start,
          lte: end,
        },
        workSpaceId: workspacesSearch,
      },

      include: {
        dops: true,
        payments: {
          where: {
            date: {
              gte: start,
              lte: end,
            },
          },
        },
        dealers: true,
        client: true,
        // deliveries: true,
        // workSpace: true,
      },
      orderBy: {
        saleDate: 'desc',
      },
    });

    const dealsList = deals.map((el) => {
      const { id } = el;
      const title = el.title; //Название
      const price = el.price; //Стоимость сделки
      const dopsPrice = el.dops.reduce((a, b) => a + b.price, 0); //сумма допов
      const recievedPayments = el.payments.reduce((a, b) => a + b.price, 0); //внесенных платежей
      const totalPrice = price + dopsPrice; //Общяя сумма
      const remainder = totalPrice - recievedPayments; //Остаток
      const dealers = el.dealers; //менеджер(ы)
      const source = el.source; //источник сделки
      const adTag = el.adTag; //тег рекламный
      const firstPayment = el.payments[0]?.method || ''; //метод первого платежа
      const city = el.city;
      const clothingMethod = el.clothingMethod;
      const clientType = el.client.type;
      const chatLink = el.client.chatLink;
      const sphere = el.sphere;
      const discont = el.discont;
      const status = el.status;
      const paid = el.paid;
      // const delivery = el.deliveries; //полностью
      // const workspace = el.workSpace.title;
      const client = el.client; //передаю полность
      const workSpaceId = el.workSpaceId;
      const groupId = el.groupId;
      const saleDate = el.saleDate;
      const maketType = el.maketType;
      const deletedAt = el.deletedAt;
      // console.log(saleDate.toISOString().slice(0, 10), 234356);

      return {
        id,
        title,
        totalPrice,
        price,
        clientType,
        dopsPrice,
        recievedPayments,
        remainder,
        dealers,
        source,
        adTag,
        firstPayment,
        city,
        clothingMethod,
        client,
        sphere,
        discont,
        status,
        paid,
        workSpaceId,
        groupId,
        chatLink,
        saleDate,
        maketType,
        deletedAt
      };
    });

    const totalInfo = {
      totalPrice: 0,
      price: 0,
      dopsPrice: 0,
      recievedPayments: 0,
      remainder: 0,
    };

    dealsList.map((el) => {
      totalInfo.totalPrice += el.totalPrice;
      totalInfo.price += el.price;
      totalInfo.dopsPrice += el.dopsPrice;
      totalInfo.recievedPayments += el.recievedPayments;
      totalInfo.remainder += el.remainder;
    });

    const resp = {
      deals: dealsList,
      totalInfo,
    };

    const pay = await this.prisma.payment.findMany({
      where: {
        period: start.slice(0, 7),
      },
    });
    console.log(pay.length);
    console.log(pay.reduce((a, b) => a + b.price, 0));
    return resp;
  }

  async findOne(id: number) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: {
        dops: {
          include: {
            user: true,
          },
        },
        payments: true,
        dealers: {
          include: {
            user: true,
          },
        },
        client: true,
        deliveries: true,
        workSpace: true,
      },
    });

    if (!deal) {
      throw new NotFoundException(`Сделка с id ${id} не найдено.`);
    }

    return deal;
  }

  async update(id: number, updateDealDto: UpdateDealDto) {
    // Проверяем, существует ли сделка
    const dealExists = await this.prisma.deal.findUnique({
      where: { id },
    });
    if (!dealExists) {
      throw new NotFoundException(`Сделка с ID ${id} не найдена`);
    }

    if (updateDealDto.clothingMethod) {
      await this.prisma.clothingMethod.upsert({
        where: { title: updateDealDto.clothingMethod },
        update: {}, // Ничего не обновляем, если запись существует
        create: {
          title: updateDealDto.clothingMethod,
        },
      });
    }

    if (updateDealDto.source) {
      await this.prisma.dealSource.upsert({
        where: { title: updateDealDto.source },
        update: {}, // Ничего не обновляем, если запись существует
        create: {
          title: updateDealDto.source,
          workSpaceId: dealExists.workSpaceId, // Используем существующий workSpaceId из сделки
        },
      });
    }

    if (updateDealDto.adTag) {
      await this.prisma.adTag.upsert({
        where: { title: updateDealDto.adTag },
        update: {}, // Ничего не обновляем, если запись существует
        create: {
          title: updateDealDto.adTag,
        },
      });
    }

    // Обновляем сделку
    const updatedDeal = await this.prisma.deal.update({
      where: { id },
      data: {
        saleDate: updateDealDto.saleDate,
        card_id: updateDealDto.card_id,
        title: updateDealDto.title,
        price: updateDealDto.price,
        status: updateDealDto.status,
        clothingMethod: updateDealDto.clothingMethod,
        description: updateDealDto.description,
        source: updateDealDto.source,
        adTag: updateDealDto.adTag,
        discont: updateDealDto.discont,
        sphere: updateDealDto.sphere,
        city: updateDealDto.city,
        region: updateDealDto.region,
        paid: updateDealDto.paid,
        maketType: updateDealDto.maketType,
        maketPresentation: updateDealDto.maketPresentation,
        period: updateDealDto.period,
        category: updateDealDto.category,
      },
    });

    return updatedDeal;
  }

  async delete(id: number) {
    const dealExists = await this.prisma.deal.findUnique({ where: { id } });
    if (!dealExists) {
      throw new NotFoundException(`Сделка с ID ${id} не найдена`);
    }
    const dealId = id;
    return this.prisma.$transaction(async (prisma) => {
      // Удаляем все связанные DealUser
      await prisma.dealUser.deleteMany({
        where: { dealId },
      });

      // Удаляем все связанные Payment
      await prisma.payment.deleteMany({
        where: { dealId },
      });

      // Удаляем все связанные Dop
      await prisma.dop.deleteMany({
        where: { dealId },
      });

      // Удаляем саму сделку
      const deletedDeal = await prisma.deal.delete({
        where: { id: dealId },
      });

      return deletedDeal;
    });

    return this.prisma.deal.update({
      where: { id },
      data: {
        deletedAt: new Date(), // Помечаем как удаленную
      },
    });
  }

  async getDatas() {
    const methods = await this.prisma.clothingMethod.findMany();
    const sources = await this.prisma.dealSource.findMany();
    const adTags = await this.prisma.adTag.findMany();
    const spheres = await this.prisma.sphere.findMany();

    return {
      methods: methods.map((el) => el.title.trim()),
      sources: sources.map((el) => el.title.trim()),
      adTags: adTags.map((el) => el.title.trim()),
      spheres: spheres.map((el) => el.title.trim()),
    };
  }

  async updateDealers(dealId: number, updateDealersDto: UpdateDealersDto) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: { dealers: true },
    });

    if (!deal) {
      throw new NotFoundException(`Сделка с ID ${dealId} не найдена`);
    }

    const totalDealersPrice = updateDealersDto.dealers.reduce(
      (sum, dealer) => sum + dealer.price,
      0,
    );
    if (totalDealersPrice !== deal.price) {
      throw new BadRequestException(
        `Сумма стоимостей дилеров (${totalDealersPrice}) не равна стоимости сделки (${deal.price}).`,
      );
    }

    // Проверка уникальности userId (дополнительно к DTO)
    const userIds = updateDealersDto.dealers.map((d) => d.userId);
    if (new Set(userIds).size !== userIds.length) {
      throw new BadRequestException(
        'В списке дилеров не должно быть одинаковых userId.',
      );
    }

    return this.prisma.$transaction(async (prisma) => {
      const existingDealerIds = deal.dealers.map((d) => d.id);
      const updatedDealerIds = updateDealersDto.dealers
        .map((d) => d.id)
        .filter((id) => id !== 0);
      const dealersToDelete = existingDealerIds.filter(
        (id) => !updatedDealerIds.includes(id),
      );

      if (dealersToDelete.length > 0) {
        await prisma.dealUser.deleteMany({
          where: {
            id: { in: dealersToDelete },
            dealId,
          },
        });
      }

      const upsertPromises = updateDealersDto.dealers.map((dealer) =>
        prisma.dealUser.upsert({
          where: { id: dealer.id || 0 },
          update: {
            userId: dealer.userId,
            price: dealer.price,
          },
          create: {
            dealId: dealer.dealId,
            userId: dealer.userId,
            price: dealer.price,
          },
        }),
      );

      await Promise.all(upsertPromises);

      return prisma.deal.findUnique({
        where: { id: dealId },
        include: { dealers: { include: { user: true } } },
      });
    });
  }
}
