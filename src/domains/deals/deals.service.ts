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
import { FilesService } from '../files/files.service';
import axios from 'axios';

const useMyGetDaysDifference = (
  dateString1: string,
  dateString2: string,
): number => {
  const date1 = new Date(dateString1);
  const date2 = new Date(dateString2);

  // Вычисляем разницу в миллисекундах
  const timeDifference = Math.abs(date2.getTime() - date1.getTime());

  // Переводим миллисекунды в дни
  const differenceInDays = Math.ceil(timeDifference / (1000 * 3600 * 24));

  return differenceInDays;
};

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    // private readonly filesService: FilesService,
  ) {}

  async create(createDealDto: CreateDealDto, user: UserDto) {
    const client = await this.prisma.client.findUnique({
      where: {
        id: createDealDto.clientId,
      },
      include: {
        deals: true,
      },
    });
    if (!client) {
      throw new NotFoundException(`Клиент не найден.`);
    }
    const group = await this.prisma.group.findUnique({
      where: {
        id: createDealDto.groupId,
      },
    });
    if (!group) {
      throw new NotFoundException(`Проект не найден.`);
    }
    if (group.id === 16) {
      createDealDto.discont = '';
      createDealDto.maketType = '';
    } else {
      createDealDto.discontAmount = 0;
      createDealDto.courseType = '';
    }
    const newDeal = await this.prisma.deal.create({
      data: {
        ...createDealDto,
        workSpaceId: group.workSpaceId,
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

    await this.prisma.dealAudit.create({
      data: {
        dealId: newDeal.id,
        action: 'Создана',
        userId: user.id,
        comment: 'Сделка создана',
      },
    });

    if (client.deals.length)
      await this.prisma.client.update({
        where: {
          id: client.id,
        },
        data: {
          isRegular: true,
        },
      });

    // console.log(newDeal);
    return newDeal;
  }

  async getList(user: UserDto, period: string) {
    let workspacesSearch =
      user.role.department === 'administration' ||
      user.role.shortName === 'ROV' ||
      user.role.shortName === 'KD' ||
      user.role.shortName === 'LOGIST' ||
      user.role.shortName === 'MOV' ||
      user.role.shortName === 'MARKETER'
        ? { gt: 0 }
        : user.workSpaceId;

    //Ведение авито
    if (user.id === 84 || user.id === 87) {
      workspacesSearch = 2;
    }
    // Ведение ВК
    if (user.id === 86 || user.id === 88) {
      workspacesSearch = 3;
    }
    // console.log(user);
    // Запрашиваем сделки, у которых saleDate попадает в диапазон
    const deals = await this.prisma.deal.findMany({
      where: {
        // deletedAt: null,
        saleDate: {
          startsWith: period,
        },
        workSpaceId: workspacesSearch,
      },

      include: {
        dops: true,
        payments: true,
        dealers: true,
        client: true,
        deliveries: true,
        reviews: true,
        masterReports: true,
        packerReports: true,
        group: true,
        // workSpace: true,
      },
      orderBy: {
        saleDate: 'desc',
      },
    });

    // console.log(deals.length);

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
      const paid = el.paid;
      // const delivery = el.deliveries; //полностью
      // const workspace = el.workSpace.title;
      const client = el.client; //передаю полность
      const workSpaceId = el.workSpaceId;
      const groupId = el.groupId;
      const saleDate = el.saleDate;
      const maketType = el.maketType;
      const deletedAt = el.deletedAt;
      const reservation = el.reservation;
      const payments = el.payments;
      const group = el.group.title;
      const courseType = el.courseType;
      const discontAmount = el.discontAmount;
      const isRegular = el.client.isRegular
        ? 'Постоянный клиент'
        : 'Новый клиент';

      const haveReviews = el.reviews.length ? 'Есть' : 'Нет';
      const dg = useMyGetDaysDifference(el.client.firstContact, saleDate);
      let daysGone = '';
      if (dg > 31) {
        daysGone = 'Больше 31';
      } else if (7 < dg && dg <= 31) {
        daysGone = '8-31';
      } else if (2 < dg && dg <= 7) {
        daysGone = '3-7';
      } else if (1 <= dg && dg <= 2) {
        daysGone = '1-2';
      } else if (dg === 0) {
        daysGone = '0';
      }

      let status = 'Создана';

      const deliveryStatus = el.deliveries
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 1)[0]?.status;

      if (el.masterReports.length) {
        status = 'Сборка';
      }
      if (el.packerReports.length) {
        status = 'Упаковка';
      }
      if (deliveryStatus) {
        status = deliveryStatus;
      }
      // console.log(title, status, deliveryStatus);

      return {
        id,
        payments,
        title,
        group,
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
        deletedAt,
        reservation,
        daysGone,
        haveReviews,
        isRegular,
        courseType,
        discontAmount,
      };
    });

    const totalInfo = {
      totalPrice: 0,
      price: 0,
      dopsPrice: 0,
      recievedPayments: 0,
      remainder: 0,
      dealsAmount: dealsList.length,
    };

    dealsList.map((el) => {
      if (!el.reservation) {
        totalInfo.totalPrice += el.totalPrice;
        totalInfo.price += el.price;
        totalInfo.dopsPrice += el.dopsPrice;
        totalInfo.recievedPayments += el.recievedPayments;
        totalInfo.remainder += el.remainder;
      }
    });

    const resp = {
      deals: dealsList,
      totalInfo,
    };

    // const pay = await this.prisma.payment.findMany({
    //   where: {
    //     period: start.slice(0, 7),
    //   },
    // });
    // console.log(pay.length);
    // console.log(pay.reduce((a, b) => a + b.price, 0));
    return resp;
  }

  async searchByName(user: UserDto, name: string) {
    let workspacesSearch =
      user.role.department === 'administration' ||
      user.role.shortName === 'ROV' ||
      user.role.shortName === 'LOGIST' ||
      user.role.shortName === 'KD' ||
      user.role.shortName === 'MOV'
        ? { gt: 0 }
        : user.workSpaceId;
    // Запрашиваем сделки, у которых saleDate попадает в диапазон

    //Ведение авито
    if (user.id === 84 || user.id === 87) {
      workspacesSearch = 2;
    }
    // Ведение ВК
    if (user.id === 86 || user.id === 88) {
      workspacesSearch = 3;
    }

    const deals = await this.prisma.deal.findMany({
      where: {
        OR: [
          {
            title: {
              contains: name,
              mode: 'insensitive',
            },
          },
          {
            client: {
              chatLink: {
                contains: name,
                mode: 'insensitive',
              },
            },
          },
          {
            deliveries: {
              some: {
                track: {
                  contains: name,
                  mode: 'insensitive',
                },
              },
            },
          },
        ],
        workSpaceId: workspacesSearch,
      },

      include: {
        dops: true,
        payments: true,
        dealers: true,
        client: true,
        deliveries: true,
        masterReports: true,
        packerReports: true,
        group: true,
        // workSpace: true,
      },
      orderBy: {
        saleDate: 'desc',
      },
    });

    // console.log(deals.length);

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
      const paid = el.paid;
      // const delivery = el.deliveries; //полностью
      // const workspace = el.workSpace.title;
      const client = el.client; //передаю полность
      const workSpaceId = el.workSpaceId;
      const groupId = el.groupId;
      const group = el.group.title;
      const saleDate = el.saleDate;
      const maketType = el.maketType;
      const deletedAt = el.deletedAt;
      const reservation = el.reservation;
      const payments = el.payments;
      const courseType = el.courseType;
      const discontAmount = el.discontAmount;
      const isRegular = el.client.isRegular
        ? 'Постоянный клиент'
        : 'Новый клиент';

      let status = 'Создана';

      const deliveryStatus = el.deliveries
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 1)[0]?.status;

      if (el.masterReports.length) {
        status = 'Сборка';
      }
      if (el.packerReports.length) {
        status = 'Упаковка';
      }
      if (deliveryStatus) {
        status = deliveryStatus;
      }
      // console.log(saleDate.toISOString().slice(0, 10), 234356);

      return {
        payments,
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
        group,
        chatLink,
        saleDate,
        maketType,
        deletedAt,
        reservation,
        isRegular,
        courseType,
        discontAmount,
      };
    });

    const totalInfo = {
      totalPrice: 0,
      price: 0,
      dopsPrice: 0,
      recievedPayments: 0,
      remainder: 0,
      dealsAmount: dealsList.length,
    };

    dealsList.map((el) => {
      if (!el.reservation) {
        totalInfo.totalPrice += el.totalPrice;
        totalInfo.price += el.price;
        totalInfo.dopsPrice += el.dopsPrice;
        totalInfo.recievedPayments += el.recievedPayments;
        totalInfo.remainder += el.remainder;
      }
    });

    const resp = {
      deals: dealsList,
      totalInfo,
    };

    // const pay = await this.prisma.payment.findMany({
    //   where: {
    //     period: start.slice(0, 7),
    //   },
    // });
    // console.log(pay.length);
    // console.log(pay.reduce((a, b) => a + b.price, 0));
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
          orderBy: {
            idx: 'asc',
          },
        },
        client: true,
        deliveries: true,
        workSpace: true,
        reviews: {
          include: {
            file: true,
          },
        },
        masterReports: true,
        packerReports: true,
      },
    });

    if (!deal) {
      throw new NotFoundException(`Сделка с id ${id} не найдено.`);
    }

    const deliveryStatus = deal.deliveries
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 1)[0]?.status;

    if (deal.masterReports.length) {
      deal.status = 'Сборка';
    }
    if (deal.packerReports.length) {
      deal.status = 'Упаковка';
    }
    if (deliveryStatus) {
      deal.status = deliveryStatus;
    }

    const { reviews } = deal;
    if (reviews.length > 0) {
      await Promise.all(
        reviews.map(async (review, i) => {
          console.log(review.file);
          if (review.file[0]?.path) {
            const filePath = review.file[0].path;
            const md = await axios.get(
              'https://cloud-api.yandex.net/v1/disk/resources',
              {
                params: {
                  path: filePath,
                },
                headers: { Authorization: `OAuth ${process.env.YA_TOKEN}` },
              },
            );
            console.log(md.data);
            console.log(filePath);
            // console.log(reviews[i].file[0].path);

            reviews[i].file[0].preview = md.data.sizes[0].url || '';
          }
        }),
      );
    }

    return deal;
  }

  async update(id: number, updateDealDto: UpdateDealDto, user: UserDto) {
    // Проверяем, существует ли сделка
    // console.log('updateDealDto', updateDealDto);
    const dealExists = await this.prisma.deal.findUnique({
      where: { id },
    });
    if (!dealExists) {
      throw new NotFoundException(`Сделка с ID ${id} не найдена`);
    }

    // Словарь для маппинга полей на русские названия
    const fieldNames: Record<string, string> = {
      saleDate: 'Дата продажи',
      card_id: 'ID карточки дизайна',
      title: 'Название сделки',
      price: 'Стоимость',
      status: 'Статус',
      clothingMethod: 'Метод закрытия',
      description: 'Описание',
      source: 'Источник',
      adTag: 'Тег',
      discont: 'Скидка',
      sphere: 'Сфера деятельности',
      city: 'Город',
      region: 'Регион',
      paid: 'Оплачено',
      maketType: 'Тип макета',
      maketPresentation: 'Дата презентации макета',
      period: 'Период',
      category: 'Категория',
      reservation: 'Бронь',
      discontAmount: 'Размер скидки',
      courseType: 'Тип курса',
    };

    // Сравниваем поля updateDealDto с dealExists
    const changedFields: { field: string; oldValue: any; newValue: any }[] = [];
    const fieldsToCompare = Object.keys(fieldNames);

    fieldsToCompare.forEach((field) => {
      if (
        updateDealDto[field] !== undefined && // Проверяем, что поле передано
        updateDealDto[field] !== dealExists[field] // Проверяем, что значение изменилось
      ) {
        changedFields.push({
          field: fieldNames[field], // Используем русское название
          oldValue: dealExists[field],
          newValue: updateDealDto[field],
        });
      }
    });

    // Обновляем связанные сущности
    if (updateDealDto.clothingMethod) {
      await this.prisma.clothingMethod.upsert({
        where: { title: updateDealDto.clothingMethod },
        update: {},
        create: {
          title: updateDealDto.clothingMethod,
        },
      });
    }

    if (updateDealDto.source) {
      await this.prisma.dealSource.upsert({
        where: { title: updateDealDto.source },
        update: {},
        create: {
          title: updateDealDto.source,
          workSpaceId: dealExists.workSpaceId,
        },
      });
    }

    if (updateDealDto.adTag) {
      await this.prisma.adTag.upsert({
        where: { title: updateDealDto.adTag },
        update: {},
        create: {
          title: updateDealDto.adTag,
        },
      });
    }

    // Обновляем сделку
    const updatedDeal = await this.prisma.deal.update({
      where: { id },
      data: updateDealDto,
    });

    // Создаем отдельную запись в аудите для каждого измененного поля
    if (changedFields.length > 0) {
      await Promise.all(
        changedFields.map((change) =>
          this.prisma.dealAudit.create({
            data: {
              dealId: id,
              userId: user.id,
              action: 'Обновление',
              comment: `Изменение поля "${change.field}": с "${change.oldValue}" на "${change.newValue}"`,
            },
          }),
        ),
      );
    }

    return updatedDeal;
  }

  async delete(id: number, user: UserDto) {
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

      await prisma.dealAudit.deleteMany({
        where: {
          dealId,
        },
      });

      // Удаляем саму сделку
      const deletedDeal = await prisma.deal.delete({
        where: { id: dealId },
      });

      // Формируем комментарий для аудита
      // const auditComment = `Удалил сделку ${dealExists.title}(${dealId})`;

      // Создаем запись в аудите
      // await this.prisma.dealAudit.create({
      //   data: {
      //     dealId: dealExists.id,
      //     userId: user.id,
      //     action: 'Удаление сделки',
      //     comment: auditComment,
      //   },
      // });

      return deletedDeal;
    });

    return this.prisma.deal.update({
      where: { id },
      data: {
        deletedAt: new Date(), // Помечаем как удаленную
      },
    });
  }

  async getDatas(user: UserDto) {
    const methods = await this.prisma.clothingMethod.findMany();
    const sources = await this.prisma.dealSource.findMany();
    const adTags = await this.prisma.adTag.findMany();
    const spheres = await this.prisma.sphere.findMany();

    let groupSearch: {
      id: { gt: number } | number;
      workSpaceId?: number;
    } = { id: user.groupId };

    if (['ADMIN', 'G', 'KD'].includes(user.role.shortName)) {
      groupSearch = {
        id: { gt: 0 },
      };
    }
    if (['DO'].includes(user.role.shortName)) {
      groupSearch = {
        id: { gt: 0 },
        workSpaceId: user.workSpaceId,
      };
    }

    const userGroups = await this.prisma.group.findMany({
      where: { ...groupSearch, workSpace: { department: 'COMMERCIAL' } },
    });

    return {
      methods: methods.map((el) => el.title.trim()),
      sources: sources.map((el) => el.title.trim()),
      adTags: adTags.map((el) => el.title.trim()),
      spheres: spheres.map((el) => el.title.trim()),
      userGroups,
    };
  }

  async getSources() {
    return await this.prisma.dealSource.findMany();
  }

  async updateDealers(
    dealId: number,
    updateDealersDto: UpdateDealersDto,
    user: UserDto,
  ) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: { dealers: { include: { user: true } } },
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
            idx: dealer.idx,
          },
          create: {
            dealId: dealer.dealId,
            userId: dealer.userId,
            price: dealer.price,
            idx: dealer.idx,
          },
        }),
      );

      await Promise.all(upsertPromises);

      const updatedDeal = await prisma.deal.findUnique({
        where: { id: dealId },
        include: { dealers: { include: { user: true } } },
      });

      // Формируем данные для аудита
      const oldDealers = deal.dealers
        .map((d) => `Менеджер: ${d.user.fullName}, стоимость: ${d.price}`)
        .join('; ');
      const newDealers = updatedDeal!.dealers
        .map((d) => `Менеджер: ${d.user.fullName}, стоимость: ${d.price}`)
        .join('; ');

      const auditComment = `Обновление менеджеров. Было: ${
        oldDealers || 'нет'
      }; Стало: ${newDealers || 'нет'}`;

      // Создаем запись в аудите
      await prisma.dealAudit.create({
        data: {
          dealId,
          userId: user.id,
          action: 'Обновление дилеров',
          comment: auditComment,
        },
      });
    });
  }

  async getHistory(id: number, user: UserDto) {
    const dealExists = await this.prisma.deal.findUnique({
      where: { id },
      include: {
        audit: {
          include: {
            user: true,
          },
        },
      },
    });
    if (!dealExists) {
      throw new NotFoundException(`Сделка с ID ${id} не найдена`);
    }
    return dealExists.audit;
  }
}
