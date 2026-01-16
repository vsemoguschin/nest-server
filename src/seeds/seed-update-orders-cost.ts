import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type NeonPriceKey = 'smart' | 'rgb' | 'rgb_8mm' | 'standart' | 'standart_8mm';

type NeonRates = Record<NeonPriceKey, { rate: number; controller: number }>;

type NeonCostInput = {
  color?: string | null;
  width?: string | null;
  length?: Prisma.Decimal | number | string | null;
};

type TaskOrderWithCostRelations = Prisma.TaskOrderGetPayload<{
  include: {
    neons: true;
    lightings: true;
    package: { include: { items: true } };
    task: { select: { boardId: true; dealId: true } };
  };
}>;

const ORDER_COST_HOLDER_NAMES = new Set([
  'Держатели стальные',
  'Держатели золотые',
  'Держатели черные',
]);

const ORDER_COST_PRICES = {
  perm: {
    polik: 2222,
    print: {
      polik: 1636,
      print: 1785,
      rezka: 30,
      package: 30,
      paz: 30,
    },
  },
  spb: {
    polik: 2700,
    print: {
      polik: 2700,
      print: 1600,
      rezka: 42,
      package: 0,
      paz: 42,
    },
  },
  neon: {
    smart: { rate: 548, controller: 1094 },
    rgb: { rate: 355, controller: 320 },
    rgb_8mm: { rate: 486, controller: 320 },
    standart: { rate: 190, controller: 0 },
    standart_8mm: { rate: 220, controller: 0 },
  },
  lightings: {
    rgb: { rate: 355, controller: 0 },
    standart: { rate: 190, controller: 0 },
  },
  wire: {
    ['Акустический']: 28,
    ['Черный']: 31,
    ['Белый']: 26,
  },
} as const;

const ORDER_COST_VERSION = 1;
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 200);

const resolveNumeric = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (
    value &&
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof (value as Prisma.Decimal).toNumber === 'function'
  ) {
    const numeric = (value as Prisma.Decimal).toNumber();
    return Number.isFinite(numeric) ? numeric : 0;
  }

  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? normalized : 0;
};

const roundCost = (value: number) => Math.round(value * 100) / 100;

const calculateNeonCosts = (neons: NeonCostInput[], neonRates: NeonRates) => {
  const items = neons.map((neon) => {
    const color = neon?.color?.trim().toLowerCase();
    const width = neon?.width?.trim().toLowerCase();
    const is8mm = width === '8мм' || width === '8mm';

    let type: NeonPriceKey = 'standart';
    if (color === 'смарт' || color === 'smart') {
      type = 'smart';
    } else if (color === 'ргб' || color === 'rgb') {
      type = is8mm ? 'rgb_8mm' : 'rgb';
    } else if (is8mm) {
      type = 'standart_8mm';
    }

    const lengthValue = neon?.length;
    const lengthRaw =
      lengthValue && typeof lengthValue === 'object' && 'toNumber' in lengthValue
        ? (lengthValue as Prisma.Decimal).toNumber()
        : Number(lengthValue ?? 0);
    const length = Number.isFinite(lengthRaw) ? lengthRaw : 0;

    const { rate, controller } = neonRates[type];
    const total = length * rate + controller;

    return {
      type,
      length,
      rate,
      controller,
      total,
    };
  });

  const total = items.reduce((sum, item) => sum + item.total, 0);

  return { items, total };
};

const getSupplies = async () => {
  const [adapters, fittings] = await Promise.all([
    prisma.suppliePosition.findMany({
      where: {
        category: 'Блоки питания',
      },
      distinct: ['name'],
      orderBy: [{ name: 'asc' }, { id: 'desc' }],
    }),
    prisma.suppliePosition.findMany({
      where: {
        name: {
          in: Array.from(ORDER_COST_HOLDER_NAMES),
        },
      },
      distinct: ['name'],
      orderBy: [{ name: 'asc' }, { id: 'desc' }],
    }),
  ]);

  const fittingsByName = new Map(
    fittings.map((fitting) => [fitting.name, resolveNumeric(fitting.priceForItem)]),
  );

  return { adapters, fittingsByName };
};

const buildOrderCostPayload = (
  order: TaskOrderWithCostRelations,
  supplies: Awaited<ReturnType<typeof getSupplies>>,
) => {
  const boardHeight = resolveNumeric(order.boardHeight);
  const boardWidth = resolveNumeric(order.boardWidth);
  const polikSquare = (boardHeight * boardWidth) / 10000;
  const policPerimetr = (2 * (boardHeight + boardWidth)) / 100;

  const pazLength = (order.neons ?? []).reduce(
    (sum, neon) => sum + resolveNumeric(neon.length),
    0,
  );
  const lightingsLength = (order.lightings ?? []).reduce(
    (sum, lighting) => sum + resolveNumeric(lighting.length),
    0,
  );

  let priceForBoard = 0;
  let priceForScreen = 0;
  const screen = Boolean(order.screen);

  if (order.task?.boardId === 10) {
    priceForBoard = order.print
      ? ORDER_COST_PRICES.perm.print.package +
        ORDER_COST_PRICES.perm.print.paz * pazLength +
        ORDER_COST_PRICES.perm.print.print * polikSquare +
        ORDER_COST_PRICES.perm.print.rezka * policPerimetr +
        ORDER_COST_PRICES.perm.print.polik * polikSquare
      : ORDER_COST_PRICES.perm.polik * polikSquare;
    priceForScreen = screen ? ORDER_COST_PRICES.perm.polik * polikSquare : 0;
  } else {
    priceForBoard = order.print
      ? ORDER_COST_PRICES.spb.print.package +
        ORDER_COST_PRICES.spb.print.paz * pazLength +
        ORDER_COST_PRICES.spb.print.print * polikSquare +
        ORDER_COST_PRICES.spb.print.rezka * policPerimetr +
        ORDER_COST_PRICES.spb.print.polik * polikSquare
      : ORDER_COST_PRICES.spb.polik * polikSquare +
        ORDER_COST_PRICES.spb.print.rezka * policPerimetr;
    priceForScreen = screen
      ? ORDER_COST_PRICES.spb.polik * polikSquare +
        ORDER_COST_PRICES.spb.print.rezka * policPerimetr
      : 0;
  }

  const { total: neonPrice } = calculateNeonCosts(
    order.neons ?? [],
    ORDER_COST_PRICES.neon,
  );

  const lightingPrice =
    lightingsLength * ORDER_COST_PRICES.lightings.standart.rate;

  const wireRate =
    ORDER_COST_PRICES.wire[
      order.wireType as keyof typeof ORDER_COST_PRICES.wire
    ] ?? 0;
  const wireLength = resolveNumeric(order.wireLength);
  const wirePrice = wireRate * wireLength;

  const adapterModel = order.adapterModel ?? '';
  const adapter = supplies.adapters.find((item) => item.name === adapterModel);
  const adapterPrice = resolveNumeric(adapter?.priceForItem);
  const plugPrice = order.plug === 'Стандарт' ? 76 : 0;

  const packageItems = order.package?.items ?? [];
  const packageCost = packageItems.reduce((sum, item) => {
    if (!ORDER_COST_HOLDER_NAMES.has(item.name)) return sum;
    const price = supplies.fittingsByName.get(item.name);
    if (price == null) return sum;
    return sum + resolveNumeric(item.quantity) * price;
  }, 0);

  const dimmerPrice = order.dimmer ? 590 : 0;

  const totalCost =
    priceForBoard +
    neonPrice +
    lightingPrice +
    wirePrice +
    adapterPrice +
    plugPrice +
    packageCost +
    dimmerPrice +
    priceForScreen;

  return {
    taskId: order.taskId,
    dealId: order.dealId ?? order.task?.dealId ?? null,
    boardId: order.task?.boardId ?? 0,
    computedAt: new Date(),
    calcVersion: ORDER_COST_VERSION,
    priceForBoard: roundCost(priceForBoard),
    priceForScreen: roundCost(priceForScreen),
    neonPrice: roundCost(neonPrice),
    lightingPrice: roundCost(lightingPrice),
    wirePrice: roundCost(wirePrice),
    adapterPrice: roundCost(adapterPrice),
    plugPrice: roundCost(plugPrice),
    packageCost: roundCost(packageCost),
    dimmerPrice: roundCost(dimmerPrice),
    totalCost: roundCost(totalCost),
    boardWidth,
    boardHeight,
    polikSquare,
    policPerimetr,
    pazLength,
    lightingsLength,
    wireLength,
    print: Boolean(order.print),
    screen,
    dimmer: Boolean(order.dimmer),
    wireType: order.wireType ?? '',
    adapterModel,
    plug: order.plug ?? '',
  };
};

async function updateOrdersCost() {
  console.log('Пересчет себестоимости заказов...');

  const supplies = await getSupplies();
  let lastId = 0;
  let processed = 0;

  while (true) {
    const orders = await prisma.taskOrder.findMany({
      where: {
        deletedAt: null,
        id: { gt: lastId },
      },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
      include: {
        neons: true,
        lightings: true,
        package: { include: { items: true } },
        task: { select: { boardId: true, dealId: true } },
      },
    });

    if (!orders.length) break;

    lastId = orders[orders.length - 1].id;
    processed += orders.length;

    const updates = orders.map((order) => {
      const payload = buildOrderCostPayload(order, supplies);
      return prisma.orderCost.upsert({
        where: { orderId: order.id },
        update: payload,
        create: {
          orderId: order.id,
          ...payload,
        },
      });
    });

    await prisma.$transaction(updates);
    console.log(`Обработано заказов: ${processed}`);
  }

  console.log('Пересчет себестоимости завершен.');
}

async function main() {
  try {
    await updateOrdersCost();
    console.log('\n✓ Скрипт успешно выполнен');
  } catch (error) {
    console.error('✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
