import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function updateDeliveries() {
  // обновляем доставки
  try {
    await prisma.delivery.updateMany({
      where: {
        type: 'Досыл',
      },
      data: {
        type: 'Платно',
        purpose: 'Досыл',
      },
    });
    const oneDeliveryDealIds = await prisma.delivery.groupBy({
      by: ['dealId'],
      _count: { _all: true },
      having: {
        dealId: {
          _count: { equals: 1 },
        },
      },
    });
    const dealIds = oneDeliveryDealIds.map((x) => x.dealId);

    const result = await prisma.delivery.updateMany({
      where: {
        dealId: { in: dealIds },
      },
      data: {
        purpose: 'Заказ',
      },
    });

    console.log('Updated deliveries:', result.count);
  } catch (error) {
    console.error('Ошибка при обновлении доставок:', error);
    throw error;
  }
}

async function updateOrderHoles() {
  const holesTypes = ['Нет', '6мм', '8мм', '10мм', '4мм', 'Другое'];
  await prisma.taskOrder.updateMany({
    where: {
      holeType: {
        contains: '4',
      },
    },
    data: {
      holeType: '4мм',
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      holeType: {
        contains: '1,3',
      },
    },
    data: {
      holeType: 'Другое',
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      holeType: {
        contains: '6',
      },
    },
    data: {
      holeType: '6мм',
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      holeType: {
        contains: '8',
      },
    },
    data: {
      holeType: '8мм',
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      holeType: {
        contains: '10',
      },
    },
    data: {
      holeType: '10мм',
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      holeType: {
        contains: 'другое',
        mode: 'insensitive',
      },
    },
    data: {
      holeType: 'Другое',
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      holeType: {
        contains: '9',
      },
    },
    data: {
      holeType: '9мм',
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          holeType: {
            contains: 'подставка',
            mode: 'insensitive',
          },
        },
        {
          holeType: {
            contains: 'нет',
            mode: 'insensitive',
          },
        },
        {
          holeType: {
            contains: 'без отверстий',
            mode: 'insensitive',
          },
        },
        {
          holeType: '0',
        },
        {
          holeType: {
            contains: '-',
            mode: 'insensitive',
          },
        },
        {
          holeType: '',
        },
      ],
    },
    data: {
      holeType: 'Нет',
    },
  });
}

async function updateOrderPlug() {
  // Нормализация старого текстового поля `plug`:
  // 1) plugColor: из исходного текста
  // 2) plugLength: из исходного текста
  // 3) plug: нормализуем в ['Нет','Другое','Подарочный','Стандарт']

  // Цвет (обязательно до любых перезаписей `plug`)
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        { plug: { contains: 'черный', mode: 'insensitive' } },
        { plug: { contains: 'черный', mode: 'insensitive' } },
      ],
    },
    data: { plugColor: 'Черный' },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [{ plug: { contains: 'белый', mode: 'insensitive' } }],
    },
    data: { plugColor: 'Белый' },
  });

  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '8м',
            mode: 'insensitive',
          },
        },
        {
          plug: '8',
        },
      ],
    },
    data: {
      plugLength: 8,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '7м',
            mode: 'insensitive',
          },
        },
        {
          plug: '7',
        },
      ],
    },
    data: {
      plugLength: 7,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '6м',
            mode: 'insensitive',
          },
        },
        {
          plug: '6',
        },
      ],
    },
    data: {
      plugLength: 6,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '4м',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '4 м',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '4/',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '4, ',
            mode: 'insensitive',
          },
        },
        {
          plug: '4',
        },
      ],
    },
    data: {
      plugLength: 4,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '5м',
            mode: 'insensitive',
          },
        },
        {
          plug: '5',
        },
      ],
    },
    data: {
      plugLength: 5,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '3м',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '3/',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '3 ',
            mode: 'insensitive',
          },
        },
        {
          plug: '3',
        },
      ],
    },
    data: {
      plugLength: 3,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '2м',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '2 м',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '2/',
            mode: 'insensitive',
          },
        },
        {
          plug: '2',
        },
        {
          plug: '2ч',
        },
      ],
    },
    data: {
      plugLength: 2,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '2.8',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '2,8',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '2, 8',
            mode: 'insensitive',
          },
        },
        {
          plug: '2.8',
        },
        {
          plug: '2,8',
        },
      ],
    },
    data: {
      plugLength: 2.8,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '1.9',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '1,9',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '1, 9',
            mode: 'insensitive',
          },
        },
        {
          plug: '1.9',
        },
        {
          plug: '1,9',
        },
      ],
    },
    data: {
      plugLength: 1.9,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '3.8',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '3,8',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '3, 8',
            mode: 'insensitive',
          },
        },
        {
          plug: '3.8',
        },
        {
          plug: '3,8',
        },
      ],
    },
    data: {
      plugLength: 3.8,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '2.5',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '2,5',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '2, 5',
            mode: 'insensitive',
          },
        },
        {
          plug: '2.5',
        },
        {
          plug: '2,5',
        },
      ],
    },
    data: {
      plugLength: 2.5,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '1, 8',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plugLength: 1.8,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '40см',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '40 см',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plugLength: 0.4,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '10см',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '10 см',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plugLength: 0.1,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '4,5',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plugLength: 4.5,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '1,5',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '1.5',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plugLength: 1.5,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '0,5',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '0.5',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '50см',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plugLength: 0.5,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '3.30м',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plugLength: 3.3,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '1. 8',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plugLength: 1.8,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '0,8',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '0.8',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '80см',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plugLength: 0.8,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '4.8',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plugLength: 4.8,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '3,4',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '3.4',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plugLength: 3.4,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '1м',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '1/',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '1 ',
            mode: 'insensitive',
          },
        },
        {
          plug: '1',
        },
        {
          plug: '1б',
        },
        {
          plug: '1,м, белый ',
        },
      ],
    },
    data: {
      plugLength: 1,
    },
  });

  // Если в старом поле указан только цвет — это "Стандарт"
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        { plug: { equals: 'черный', mode: 'insensitive' } },
        { plug: { equals: ' черный', mode: 'insensitive' } },
        { plug: { equals: 'черный', mode: 'insensitive' } },
      ],
    },
    data: {
      plug: 'Стандарт',
      plugColor: 'Черный',
      plugLength: 1.8,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [{ plug: { equals: 'белый', mode: 'insensitive' } }],
    },
    data: {
      plug: 'Стандарт',
      plugColor: 'Белый',
      plugLength: 1.8,
    },
  });
  //стандарт
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: '1.8',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: 'стандарт',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: 'Станрдарт',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: '1,8',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plug: 'Стандарт',
      plugLength: 1.8,
    },
  });
  //Подарочный
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: {
            contains: 'Подар',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plug: 'Подарочный',
      plugLength: 1,
    },
  });
  //нет
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          plug: '0',
        },
        {
          plug: '',
        },
        {
          plug: '-',
        },
        {
          plug: {
            contains: 'Без вилки',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: 'нет',
            mode: 'insensitive',
          },
        },
        {
          plug: {
            contains: 'не нужен',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      plug: 'Нет',
      plugColor: '',
      plugLength: 0,
    },
  });

  // Финальная нормализация: всё, что осталось не enum-значением — считаем "Другое"
  await prisma.taskOrder.updateMany({
    where: {
      AND: [
        { plug: { notIn: ['Нет', 'Другое', 'Подарочный', 'Стандарт', 'USB'] } },
        { plug: { not: '' } },
      ],
    },
    data: {
      plug: 'Другое',
    },
  });
}

async function updateTaskOrdersWireLengthToWireInfo() {
  try {
    const updated = await prisma.$executeRaw`
      UPDATE "TaskOrder"
      SET "wireInfo" = CASE
            WHEN "wireLength" IS NULL THEN "wireInfo"
            ELSE "wireLength"
          END,
          "wireLength" = ''
      WHERE "wireLength" IS DISTINCT FROM ''
    `;

    console.log(`TaskOrder updated: ${updated}`);
  } catch (error) {
    console.error(
      'Ошибка при обновлении TaskOrder (wireLength -> wireInfo):',
      error,
    );
    throw error;
  }
}

async function updateOrderAdapters() {
  const adapterTypes = ['Помещение', 'Уличный', 'Подарочный', 'Нет', 'Другое'];
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          adapter: {
            contains: 'подар',
            mode: 'insensitive',
          },
        },
        {
          adapter: {
            contains: 'Подарочный',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      adapter: 'Подарочный',
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          adapter: {
            contains: 'помещение',
            mode: 'insensitive',
          },
        },
        {
          adapter: {
            contains: 'поещение',
            mode: 'insensitive',
          },
        },
        {
          adapter: {
            contains: 'станд',
            mode: 'insensitive',
          },
        },
        {
          adapter: {
            contains: 'станларт',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      adapter: 'Помещение',
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        { adapter: '' },
        { adapter: '-' },
        {
          adapter: {
            contains: 'нет',
            mode: 'insensitive',
          },
        },
        {
          adapter: {
            contains: ' От вывески до блока 1м, от блока до розетки 1,8м',
            mode: 'insensitive',
          },
        },
        {
          adapter: {
            contains: 'без',
            mode: 'insensitive',
          },
        },
        {
          adapter: {
            contains: 'не нужен, у клиента есть',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      adapter: 'Нет',
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          adapter: {
            contains: 'Уличный',
            mode: 'insensitive',
          },
        },
        {
          adapter: {
            contains: 'улица',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      adapter: 'Уличный',
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          adapter: {
            contains: 'Блок  170х18мм серебристый ',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      adapter: 'Помещение',
      adapterInfo: 'Блок  170х18мм серебристый',
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          adapter: {
            contains: 'вывод юсб на павербанк',
            mode: 'insensitive',
          },
        },
      ],
    },
    data: {
      adapter: 'Другое',
      adapterInfo: 'вывод юсб на павербанк',
    },
  });
}

async function updateOrderFittings() {
  const fittings = [
    'Держатели стальные',
    'Держатели золотые',
    'Держатели черные',
    'Крепления для окна',
    'Шуруп + дюбель',
    'Присоски',
    'Нет',
  ] as const;
  //нет
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          fitting: '',
        },
        {
          fitting: 'нет',
        },
        {
          fitting: 'нет отверстий',
        },
        {
          fitting: 'нет, без отверстий',
        },
        {
          fitting: 'без отверстий ',
        },
        {
          fitting: 'У клиента есть свои держатели ',
        },
        {
          fitting: 'Нету',
        },
      ],
    },
    data: {
      fitting: 'Нет',
    },
  });
  //подставка
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          fitting: 'подставка',
        },
        {
          fitting: 'Подставка',
        },
        {
          fitting: 'Подставка ',
        },
        {
          fitting: 'Подставка стандарт ',
        },
        {
          fitting: 'Нет (есть у клиента)',
        },
        {
          fitting: 'Нет, отверстия под держатели',
        },
        {
          fitting: 'Ничего не нужно. У клиента будут свои держатели',
        },
        {
          fitting: 'нет, у клиента в прошлом заказе держатели ',
        },
        {
          fitting: 'без',
        },
      ],
    },
    data: {
      fitting: 'Нет',
      stand: true,
    },
  });
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          fitting: 'Дюбеля',
        },
        {
          fitting: 'дюбеля',
        },
        {
          fitting: 'дюбель',
        },
        {
          fitting: 'ДюбеляДюбеля',
        },
        {
          fitting: 'Шуруп+Дюбеля',
        },
        {
          fitting: 'Шуруп + Дюбель',
        },
        {
          fitting: 'Шуруп+дюбеля',
        },
        {
          fitting: 'шуруп+дюбель',
        },
        {
          fitting: 'Шуруп + дюбель (одно отверстие)',
        },
        {
          fitting: 'шуШуруп + дюбель',
        },
        {
          fitting: 'Шуруп+дюбель',
        },
        {
          fitting: 'Шуруп + дюбель и подставка',
        },
      ],
    },
    data: {
      fitting: 'Шуруп + дюбель',
    },
  });
  //Крепления для окна
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          fitting: 'Тросы',
        },
        {
          fitting: 'Тросы ',
        },
        {
          fitting: 'тросы',
        },
        {
          fitting: 'тросы ',
        },
        {
          fitting: 'крепления для окна, троссы',
        },
        {
          fitting: 'тросы для окна ',
        },
        {
          fitting: 'крепления для окна ',
        },
        {
          fitting: 'тросы для окна (4 шт)',
        },
        {
          fitting: 'Крепления для окна Тросы',
        },
      ],
    },
    data: {
      fitting: 'Крепления для окна',
    },
  });
  //Держатели стальные
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          fitting: 'Стальные держатели',
        },
        {
          fitting: 'стальные держатели',
        },
        {
          fitting: 'Держатели стальные 2 шт',
        },
        {
          fitting: 'деДержатели стальные',
        },
        {
          fitting: 'Стальные Держатели ',
        },
        {
          fitting: 'Держатели стальные 5см от стены',
        },
        {
          fitting: 'Держатели стальные + 2шт (запас)',
        },
        {
          fitting: 'Держатели стальныеДержатели стальные',
        },
        {
          fitting: 'держатели стальные 8шт ',
        },
        {
          fitting: 'Стальные Держатели',
        },
        {
          fitting: 'Держатели стальные, 2шт',
        },
        {
          fitting: 'Держатели стальные ',
        },
      ],
    },
    data: {
      fitting: 'Держатели стальные',
    },
  });
  //Держатели черные
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          fitting: 'черные держатели',
        },
        {
          fitting: 'держатели черные ',
        },
        {
          fitting: 'Держатели черные (чтоб блок спрятать за вывеской)',
        },
        {
          fitting: 'Держатели черные 2 шт',
        },
        {
          fitting: 'Держатели черныеДержатели черные',
        },
        {
          fitting: 'Держатели черные 4шт ',
        },
      ],
    },
    data: {
      fitting: 'Держатели черные',
    },
  });
  //Присоски
  await prisma.taskOrder.updateMany({
    where: {
      OR: [
        {
          fitting: 'Присоски для окна',
        },
        {
          fitting: 'Присоски 2шт',
        },
      ],
    },
    data: {
      fitting: 'Присоски',
    },
  });
}

async function main() {
  try {
    await updateDeliveries();
    await updateTaskOrdersWireLengthToWireInfo();
    await updateOrderHoles();
    await updateOrderPlug();
    await updateOrderAdapters();
    await updateOrderFittings();

    const oldLogist = await prisma.user.findUnique({
      where: { id: 46 },
      include: { boards: true },
    });
    if (!oldLogist) throw new Error('oldLogist not found');

    const boardLinks = oldLogist.boards.map((b) => ({ id: b.id }));

    await prisma.$transaction([
      prisma.user.update({
        where: { id: 129 },
        data: { roleId: 13, boards: { connect: boardLinks } },
      }),
    ]);

    console.log('Сид успешно выполнен.');
  } catch (error) {
    console.error('Ошибка при выполнении сида:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
