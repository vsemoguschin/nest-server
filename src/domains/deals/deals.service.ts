import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDealDto } from './dto/deal-create.dto';
import { UserDto } from '../users/dto/user.dto';
import { UpdateDealDto } from './dto/deal-update.dto';
import { UpdateDealersDto } from './dto/dealers-update.dto';
import { GroupsAccessService } from '../groups/groups-access.service';
import { YandexDiskClient } from 'src/integrations/yandex-disk/yandex-disk.client';

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

interface DealMapOptions {
  includeLeadAging?: boolean;
  includeReviewSummary?: boolean;
}

interface DealTotals {
  totalPrice: number;
  price: number;
  dopsPrice: number;
  recievedPayments: number;
  remainder: number;
  dealsAmount: number;
  deliveredPrice: number;
  deliveredAmount: number;
}

type DealSortKey =
  | 'saleDate'
  | 'totalPrice'
  | 'price'
  | 'dopsPrice'
  | 'remainder'
  | 'receivedPayments';

type SortOrder = 'asc' | 'desc';

type NeonPriceKey = 'smart' | 'rgb' | 'rgb_8mm' | 'standart' | 'standart_8mm';

type NeonRates = Record<NeonPriceKey, { rate: number; controller: number }>;

type NeonCostInput = {
  color?: string | null;
  width?: string | null;
  length?: Prisma.Decimal | number | string | null;
};

interface DealListFilters {
  status?: string[];
  maketType?: string[];
  source?: string[];
  adTag?: string[];
  daysGone?: string[];
  dealers?: Array<number>;
  haveReviews?: string[];
  isRegular?: string[];
  boxsize?: string[];
}

interface BuildDealsResponseOptions extends DealMapOptions {
  totalsOverride?: DealTotals;
  meta?: Record<string, any>;
  sortKey?: DealSortKey;
  sortOrder?: SortOrder;
  pagination?: {
    skip: number;
    limit: number;
  };
}

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groupsAccessService: GroupsAccessService,
    private readonly yandexDisk: YandexDiskClient,

    // private readonly filesService: FilesService,
  ) {}

  private readonly DEFAULT_LIMIT = 20;
  private readonly MAX_LIMIT = 100;

  private normalizeSortKey(sortKey?: string): DealSortKey {
    switch ((sortKey ?? 'saleDate').toLowerCase()) {
      case 'totalprice':
        return 'totalPrice';
      case 'price':
        return 'price';
      case 'dopsprice':
        return 'dopsPrice';
      case 'remainder':
        return 'remainder';
      case 'receivedpayments':
      case 'recievedpayments':
        return 'receivedPayments';
      case 'saledate':
      default:
        return 'saleDate';
    }
  }

  private normalizeSortOrder(sortOrder?: string): SortOrder {
    return sortOrder && sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc';
  }

  private requiresManualSorting(sortKey: DealSortKey) {
    return [
      'totalPrice',
      'dopsPrice',
      'remainder',
      'receivedPayments',
    ].includes(sortKey);
  }

  private getOrderByForSortKey(
    sortKey: DealSortKey,
    sortOrder: SortOrder,
  ): Prisma.DealOrderByWithRelationInput {
    switch (sortKey) {
      case 'price':
        return { price: sortOrder };
      case 'saleDate':
      default:
        return { saleDate: sortOrder };
    }
  }

  private getDealInclude() {
    return {
      dops: true,
      payments: true,
      dealers: true,
      client: true,
      deliveries: true,
      reviews: true,
      masterReports: true,
      packerReports: true,
      group: true,
    } as const;
  }

  private normalizePagination(page?: number, limit?: number) {
    const normalizedPage =
      typeof page === 'number' && Number.isFinite(page) && page > 0
        ? Math.floor(page)
        : 1;

    const safeLimit =
      typeof limit === 'number' && Number.isFinite(limit) && limit > 0
        ? Math.floor(Math.min(limit, this.MAX_LIMIT))
        : this.DEFAULT_LIMIT;

    const normalizedLimit = Math.max(safeLimit, 1);

    return {
      page: normalizedPage,
      limit: normalizedLimit,
      skip: (normalizedPage - 1) * normalizedLimit,
    };
  }

  private getDaysGoneCategory(deal: Record<string, any>): string {
    if (!deal.client?.firstContact || !deal.saleDate) {
      return '';
    }

    const difference = useMyGetDaysDifference(
      deal.client.firstContact,
      deal.saleDate,
    );

    if (difference > 31) {
      return 'Больше 31';
    }
    if (difference > 7) {
      return '8-31';
    }
    if (difference > 2) {
      return '3-7';
    }
    if (difference >= 1) {
      return '1-2';
    }
    if (difference === 0) {
      return '0';
    }

    return '';
  }

  private getDealStatus(deal: Record<string, any>): string {
    const deliveryStatus = (deal.deliveries ?? [])
      .slice()
      .sort(
        (a: Record<string, any>, b: Record<string, any>) =>
          new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
      .slice(0, 1)[0]?.status;

    let status = 'Создана';

    if (deal.masterReports?.length) {
      status = 'Сборка';
    }
    if (deal.packerReports?.length) {
      status = 'Упаковка';
    }
    if (deliveryStatus) {
      status = deliveryStatus;
    }
    if (deal.reservation) {
      status = 'Бронь';
    }

    return status;
  }

  private async fetchTotals(where: Prisma.DealWhereInput): Promise<DealTotals> {
    const totalsSource = await this.prisma.deal.findMany({
      where,
      select: {
        reservation: true,
        price: true,
        dops: {
          select: {
            price: true,
          },
        },
        payments: {
          select: {
            price: true,
          },
        },
        deliveries: {
          select: {
            status: true,
          },
        },
      },
    });

    const totalsInput = totalsSource.map((deal) => {
      const price = deal.price ?? 0;
      const dopsPrice = (deal.dops ?? []).reduce(
        (acc: number, dop: { price: number | null }) => acc + (dop.price ?? 0),
        0,
      );
      const recievedPayments = (deal.payments ?? []).reduce(
        (acc: number, payment: { price: number | null }) =>
          acc + (payment.price ?? 0),
        0,
      );
      const totalPrice = price + dopsPrice;
      const remainder = totalPrice - recievedPayments;

      return {
        totalPrice,
        price,
        dopsPrice,
        recievedPayments,
        remainder,
        reservation: deal.reservation,
        deliveries: deal.deliveries,
      };
    });

    return this.calculateTotals(totalsInput);
  }

  private sortDealsList(
    deals: Array<Record<string, any>>,
    sortKey: DealSortKey,
    sortOrder: SortOrder,
  ) {
    const sorted = [...deals];

    const getNumeric = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : 0;

    const getDateTimestamp = (value: unknown) => {
      if (value instanceof Date) {
        return value.getTime();
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    sorted.sort((a, b) => {
      const compareNumbers = (left: number, right: number) =>
        sortOrder === 'desc' ? right - left : left - right;

      switch (sortKey) {
        case 'saleDate': {
          const aDate = getDateTimestamp(a.saleDate);
          const bDate = getDateTimestamp(b.saleDate);
          return compareNumbers(aDate, bDate);
        }
        case 'totalPrice':
          return compareNumbers(
            getNumeric(a.totalPrice),
            getNumeric(b.totalPrice),
          );
        case 'price':
          return compareNumbers(getNumeric(a.price), getNumeric(b.price));
        case 'dopsPrice':
          return compareNumbers(
            getNumeric(a.dopsPrice),
            getNumeric(b.dopsPrice),
          );
        case 'remainder':
          return compareNumbers(
            getNumeric(a.remainder),
            getNumeric(b.remainder),
          );
        case 'receivedPayments':
          return compareNumbers(
            getNumeric(a.recievedPayments),
            getNumeric(b.recievedPayments),
          );
        default:
          return 0;
      }
    });

    return sorted;
  }

  private applyDealListFilters(
    where: Prisma.DealWhereInput,
    filters?: DealListFilters,
  ) {
    const postFilters: Array<(deal: Record<string, any>) => boolean> = [];

    if (!filters) {
      return { where, postFilters };
    }

    const normalizeStrings = (values?: string[]) =>
      values
        ?.map((value) => value?.trim())
        .filter((value): value is string => !!value) ?? [];

    const status = normalizeStrings(filters.status);
    if (status.length) {
      const allowed = new Set(status);
      postFilters.push((deal) => allowed.has(this.getDealStatus(deal)));
    }

    const maketType = normalizeStrings(filters.maketType);
    if (maketType.length) {
      where.maketType = { in: maketType };
    }

    const source = normalizeStrings(filters.source);
    if (source.length) {
      where.source = { in: source };
    }

    const adTag = normalizeStrings(filters.adTag);
    if (adTag.length) {
      where.adTag = { in: adTag };
    }

    const boxsize = normalizeStrings(filters.boxsize);
    if (boxsize.length) {
      where.bookSize = { in: boxsize };
    }

    const dealers = (filters.dealers ?? []).filter((id) =>
      Number.isInteger(id),
    );
    if (dealers.length) {
      where.dealers = {
        some: {
          userId: {
            in: dealers,
          },
        },
      };
    }

    const haveReviews = normalizeStrings(filters.haveReviews);
    if (haveReviews.length) {
      const has = haveReviews.includes('Есть');
      const hasNot = haveReviews.includes('Нет');

      if (has && !hasNot) {
        where.reviews = { some: {} };
      } else if (hasNot && !has) {
        where.reviews = { none: {} };
      }
    }

    const isRegularFilters = normalizeStrings(filters.isRegular);
    if (isRegularFilters.length) {
      const wantRegular = isRegularFilters.includes('Постоянный клиент');
      const wantNew = isRegularFilters.includes('Новый клиент');

      if (wantRegular && !wantNew) {
        where.client = { is: { isRegular: true } };
      } else if (wantNew && !wantRegular) {
        where.client = { is: { isRegular: false } };
      }
    }

    const daysGone = normalizeStrings(filters.daysGone);
    if (daysGone.length) {
      const allowed = new Set(daysGone);
      postFilters.push((deal) => allowed.has(this.getDaysGoneCategory(deal)));
    }

    return { where, postFilters };
  }

  private mapDealToListItem(
    deal: Record<string, any>,
    options: DealMapOptions = {},
  ) {
    const price = deal.price ?? 0;
    const dopsPrice = (deal.dops ?? []).reduce(
      (total: number, dop: Record<string, any>) => total + (dop.price ?? 0),
      0,
    );
    const recievedPayments = (deal.payments ?? []).reduce(
      (total: number, payment: Record<string, any>) =>
        total + (payment.price ?? 0),
      0,
    );
    const totalPrice = price + dopsPrice;
    const remainder = totalPrice - recievedPayments;
    const firstPayment = deal.payments?.[0]?.method ?? '';

    const status = this.getDealStatus(deal);
    const hasDelivered = (deal.deliveries ?? []).some((delivery: any) =>
      ['Отправлена', 'Вручена'].includes(delivery.status),
    );

    const dto: Record<string, any> = {
      payments: deal.payments,
      id: deal.id,
      title: deal.title,
      totalPrice,
      price,
      clientType: deal.client?.type,
      dopsPrice,
      recievedPayments,
      remainder,
      dealers: deal.dealers,
      source: deal.source,
      adTag: deal.adTag,
      firstPayment,
      city: deal.city,
      clothingMethod: deal.clothingMethod,
      client: { firstContact: deal.client?.firstContact },
      sphere: deal.sphere,
      discont: deal.discont,
      status,
      // paid: deal.paid,
      // workSpaceId: deal.workSpaceId,
      // groupId: deal.groupId,
      group: deal.group?.title,
      // chatLink: deal.client?.chatLink,
      saleDate: deal.saleDate,
      maketType: deal.maketType,
      // deletedAt: deal.deletedAt,
      reservation: deal.reservation,
      isRegular: deal.client?.isRegular ? 'Постоянный клиент' : 'Новый клиент',
      courseType: deal.courseType,
      discontAmount: deal.discontAmount,
      boxsize: deal.bookSize,
      pages: deal.pages,
      pageType: deal.pageType,
      hasDelivered,
    };

    if (options.includeLeadAging) {
      dto.daysGone = this.getDaysGoneCategory(deal);
    }

    if (options.includeReviewSummary) {
      dto.haveReviews = (deal.reviews ?? []).length ? 'Есть' : 'Нет';
    }

    return dto;
  }

  private calculateTotals(deals: Array<Record<string, any>>): DealTotals {
    const totals: DealTotals = {
      totalPrice: 0,
      price: 0,
      dopsPrice: 0,
      recievedPayments: 0,
      remainder: 0,
      dealsAmount: deals.length,
      deliveredPrice: 0,
      deliveredAmount: 0,
    };

    deals.forEach((deal) => {
      if (!deal.reservation) {
        totals.totalPrice += deal.totalPrice ?? 0;
        totals.price += deal.price ?? 0;
        totals.dopsPrice += deal.dopsPrice ?? 0;
        totals.recievedPayments += deal.recievedPayments ?? 0;
        totals.remainder += deal.remainder ?? 0;
      }

      const hasDelivered = Array.isArray(deal.deliveries)
        ? deal.deliveries.some((delivery: any) =>
            ['Отправлена', 'Вручена'].includes(delivery.status),
          )
        : deal.hasDelivered === true;

      if (hasDelivered) {
        totals.deliveredPrice += deal.price + deal.dopsPrice;
        totals.deliveredAmount += 1;
      }
    });

    return totals;
  }

  private buildDealsResponse(
    deals: any[],
    options: BuildDealsResponseOptions = {},
  ) {
    const {
      totalsOverride,
      meta,
      sortKey,
      sortOrder = 'desc',
      pagination,
      ...mapOptions
    } = options;
    const mappedDeals = deals.map((deal) =>
      this.mapDealToListItem(deal, mapOptions),
    );

    const totals = totalsOverride ?? this.calculateTotals(mappedDeals);
    const totalCount = totalsOverride?.dealsAmount ?? mappedDeals.length;

    const sortedDeals = sortKey
      ? this.sortDealsList(mappedDeals, sortKey, sortOrder)
      : mappedDeals;

    const paginatedDeals = pagination
      ? sortedDeals.slice(pagination.skip, pagination.skip + pagination.limit)
      : sortedDeals;

    const response: Record<string, any> = {
      deals: paginatedDeals,
      totalInfo: totals,
    };

    if (meta || pagination) {
      const metaPayload = {
        ...(meta ?? {}),
        totalCount: meta?.totalCount ?? totalCount,
      };
      response.meta = metaPayload;
    }

    return response;
  }

  private calculateNeonCosts(neons: NeonCostInput[], neonRates: NeonRates) {
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
        lengthValue &&
        typeof lengthValue === 'object' &&
        'toNumber' in lengthValue
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
  }

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

  async getList(
    user: UserDto,
    from: string,
    to: string,
    groupId?: number,
    page?: number,
    limit?: number,
    sortKey?: string,
    sortOrder?: string,
    filters?: DealListFilters,
  ) {
    const groupsSearch = this.groupsAccessService.buildGroupsScope(user);
    const {
      page: currentPage,
      limit: currentLimit,
      skip,
    } = this.normalizePagination(page, limit);
    const normalizedSortKey = this.normalizeSortKey(sortKey);
    const normalizedSortOrder = this.normalizeSortOrder(sortOrder);
    const requiresManual = this.requiresManualSorting(normalizedSortKey);
    const baseOrderKey = requiresManual ? 'saleDate' : normalizedSortKey;
    const orderBy = this.getOrderByForSortKey(
      baseOrderKey,
      normalizedSortOrder,
    );

    const whereBase: Prisma.DealWhereInput = {
      saleDate: {
        gte: from,
        lte: to,
      },
      groupId: groupId ? groupId : { gt: 0 },
      group: groupsSearch,
    };

    const { where, postFilters } = this.applyDealListFilters(
      whereBase,
      filters,
    );
    const needsPostFilter = postFilters.length > 0;
    const shouldDisablePagination = requiresManual || needsPostFilter;
    const includeTotals = !needsPostFilter;

    const dealsPromise = this.prisma.deal.findMany({
      where,
      include: this.getDealInclude(),
      orderBy,
      ...(shouldDisablePagination
        ? {}
        : {
            skip,
            take: currentLimit,
          }),
    });

    const totalsPromise = includeTotals
      ? this.fetchTotals(where)
      : Promise.resolve<DealTotals | undefined>(undefined);

    const [deals, totals] = await Promise.all([dealsPromise, totalsPromise]);

    const filteredDeals = postFilters.length
      ? deals.filter((deal) =>
          postFilters.every((predicate) => predicate(deal)),
        )
      : deals;

    const totalCount = includeTotals
      ? (totals?.dealsAmount ?? filteredDeals.length)
      : filteredDeals.length;

    return this.buildDealsResponse(filteredDeals, {
      includeLeadAging: true,
      includeReviewSummary: true,
      totalsOverride: includeTotals ? totals : undefined,
      sortKey: normalizedSortKey,
      sortOrder: normalizedSortOrder,
      pagination: shouldDisablePagination
        ? {
            skip,
            limit: currentLimit,
          }
        : undefined,
      meta: {
        page: currentPage,
        limit: currentLimit,
        totalCount,
        sortBy: normalizedSortKey,
        sortOrder: normalizedSortOrder,
      },
    });
  }

  async searchByName(
    user: UserDto,
    name: string,
    page?: number,
    limit?: number,
    sortKey?: string,
    sortOrder?: string,
  ) {
    const groupsSearch = this.groupsAccessService.buildGroupsScope(user);
    const {
      page: currentPage,
      limit: currentLimit,
      skip,
    } = this.normalizePagination(page, limit);
    const normalizedSortKey = this.normalizeSortKey(sortKey);
    const normalizedSortOrder = this.normalizeSortOrder(sortOrder);
    const requiresManual = this.requiresManualSorting(normalizedSortKey);
    const orderBy = this.getOrderByForSortKey(
      requiresManual ? 'saleDate' : normalizedSortKey,
      normalizedSortOrder,
    );

    const where: Prisma.DealWhereInput = {
      OR: [
        {
          title: {
            contains: name,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          client: {
            chatLink: {
              contains: name,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        },
        {
          deliveries: {
            some: {
              track: {
                contains: name,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          },
        },
      ],
      group: groupsSearch,
    };

    const [deals, totals] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        include: this.getDealInclude(),
        orderBy,
        ...(requiresManual
          ? {}
          : {
              skip,
              take: currentLimit,
            }),
      }),
      this.fetchTotals(where),
    ]);

    return this.buildDealsResponse(deals, {
      totalsOverride: totals,
      sortKey: normalizedSortKey,
      sortOrder: normalizedSortOrder,
      pagination: requiresManual
        ? {
            skip,
            limit: currentLimit,
          }
        : undefined,
      meta: {
        page: currentPage,
        limit: currentLimit,
        totalCount: totals.dealsAmount,
        sortBy: normalizedSortKey,
        sortOrder: normalizedSortOrder,
      },
    });
  }

  async getDealCost(id: number) {
    const prices = {
      perm: {
        polik: 2222, // стоимость м2 подложки(полик 5мм) для подложек без печати
        print: {
          polik: 1636, // стоимость м2 подложки(полик 4мм) для печати
          print: 1785, //м2
          rezka: 30, //погонный метр по подложке
          package: 30, //упаковка фиксировано
          paz: 30, // погонный метр для паза
        },
      },
      spb: {
        polik: 2700, // стоимость м2 подложки для подложек без печати
        print: {
          polik: 2700, // стоимость м2 подложки для печати
          print: 1600, //м2
          rezka: 42, // погонный метр по подложке
          package: 0, //упаковка фиксировано
          paz: 42, // погонный метр для паза
        },
      },
      // TODO
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
    };
    const prodTasks = await this.prisma.kanbanTask.findMany({
      where: {
        dealId: id,
        boardId: { in: [10, 5] },
      },
      include: {
        orders: {
          include: {
            neons: true,
            lightings: true,
            package: {
              include: {
                items: true,
              },
            },
          },
        },
      },
    });
    const deliveries = await this.prisma.delivery.findMany({
      where: {
        dealId: id,
        type: 'Бесплатно',
      },
    });
    const deliveriesTotal = deliveries.reduce(
      (sum, delivery) => sum + Number(delivery.price ?? 0),
      0,
    );

    let productionTasks: any[] = [];
    if (prodTasks.length) {
      type MasterReportWithUser = Prisma.MasterReportGetPayload<{
        include: { user: true };
      }>;
      type PackerReportWithUser = Prisma.PackerReportGetPayload<{
        include: { user: true };
      }>;

      const taskIds = prodTasks.map((task) => task.id);
      const ordersIds = prodTasks.flatMap((task) =>
        task.orders.map((o) => o.id),
      );

      const [masterReports, packerReports, adapters, fittings] =
        await Promise.all([
          ordersIds.length
            ? this.prisma.masterReport.findMany({
                where: {
                  orderId: { in: ordersIds },
                },
                include: {
                  user: true,
                },
              })
            : Promise.resolve([] as MasterReportWithUser[]),
          taskIds.length
            ? this.prisma.packerReport.findMany({
                where: {
                  taskId: { in: taskIds },
                },
                include: {
                  user: true,
                },
              })
            : Promise.resolve([] as PackerReportWithUser[]),
          this.prisma.suppliePosition.findMany({
            where: {
              category: 'Блоки питания',
            },
            distinct: ['name'],
            orderBy: [{ name: 'asc' }, { id: 'desc' }],
          }),
          this.prisma.suppliePosition.findMany({
            where: {
              name: {
                in: [
                  'Держатели стальные',
                  'Держатели золотые',
                  'Держатели черные',
                ],
              },
            },
            distinct: ['name'],
            orderBy: [{ name: 'asc' }, { id: 'desc' }],
          }),
        ]);

      const holderNames = new Set([
        'Держатели стальные',
        'Держатели золотые',
        'Держатели черные',
      ]);

      const fittingsByName = new Map(
        fittings.map((f) => [f.name, f.priceForItem]),
      );

      const masterReportsByOrderId = new Map<number, MasterReportWithUser>();
      masterReports.forEach((report) => {
        if (report.orderId == null) {
          return;
        }
        masterReportsByOrderId.set(report.orderId, report);
      });

      const packerReportsByTaskId = new Map<number, PackerReportWithUser[]>();
      packerReports.forEach((report) => {
        if (report.taskId == null) {
          return;
        }
        const list = packerReportsByTaskId.get(report.taskId) ?? [];
        list.push(report);
        packerReportsByTaskId.set(report.taskId, list);
      });

      productionTasks = prodTasks.map((task) => {
        const { orders: taskOrders, id: taskId, boardId: taskBoardId } = task;
        const orders = taskOrders.map((order) => {
          const {
            boardHeight,
            boardWidth,
            print,
            neons,
            lightings,
            wireType,
            wireLength,
            screen,
          } = order;
          // площадь подложки
          const polikSquare = (boardHeight * boardWidth) / 10000;
          // периметр подложки
          const policPerimetr = (2 * (boardHeight + boardWidth)) / 100;
          // длина неона/паза
          const paz = neons.reduce(
            (sum, neon) => sum + neon.length.toNumber(),
            0,
          );
          // длина подсветки
          const lightingsLength = lightings.reduce(
            (sum, lighting) => sum + lighting.length.toNumber(),
            0,
          );
          //стоимость экрана
          let priceForScreen = 0;

          let priceForBoard = 0;
          // если изготавливают в Перми
          if (taskBoardId === 10) {
            //если есть печать то считаем по ценам печати, нет - по ценам фрезеровки
            priceForBoard = print
              ? prices.perm.print.package +
                prices.perm.print.paz * paz +
                prices.perm.print.print * polikSquare +
                prices.perm.print.rezka * policPerimetr +
                prices.perm.print.polik * polikSquare
              : prices.perm.polik * polikSquare;
            priceForScreen = screen ? prices.perm.polik * polikSquare : 0;
          } else {
            priceForBoard = print
              ? prices.spb.print.package +
                prices.spb.print.paz * paz +
                prices.spb.print.print * polikSquare +
                prices.spb.print.rezka * policPerimetr +
                prices.spb.print.polik * polikSquare
              : prices.spb.polik * polikSquare +
                prices.spb.print.rezka * policPerimetr;
            priceForScreen = screen
              ? prices.spb.polik * polikSquare +
                prices.spb.print.rezka * policPerimetr
              : 0;
          }
          const { total: neonPrice } = this.calculateNeonCosts(
            neons,
            prices.neon,
          );

          const lightingPrice =
            lightingsLength * prices.lightings.standart.rate;
          const masterReport = masterReportsByOrderId.get(order.id);
          // const masterPrice = masterReport?.cost ?? 0;
          const wireRate =
            prices.wire[wireType as keyof typeof prices.wire] ?? 0;
          const wireLengthNum = Number(wireLength) || 0;
          const wirePrice = wireRate * wireLengthNum;
          const adapter = adapters.find((a) => a.name === order.adapterModel);
          const adapterPrice = adapter?.priceForItem ?? 0;
          const plugPrice = order.plug === 'Стандарт' ? 76 : 0;

          const packageItems = order.package?.items ?? [];

          const packageCost = packageItems.reduce((sum, item) => {
            if (!holderNames.has(item.name)) return sum;

            const price = fittingsByName.get(item.name);
            if (price == null) return sum;

            const qty =
              typeof item.quantity?.toNumber === 'function'
                ? item.quantity.toNumber()
                : Number(item.quantity);

            return sum + qty * price;
          }, 0);
          const dimmerPrice = order.dimmer ? 590 : 0;
          const masterCost = Number(masterReport?.cost ?? 0);
          const totalCost =
            priceForBoard +
            neonPrice +
            lightingPrice +
            masterCost +
            wirePrice +
            adapterPrice +
            plugPrice +
            packageCost +
            dimmerPrice +
            priceForScreen;
          return {
            title: order.title, // название заказа
            deadline: order.deadline, // срок  выполнения
            polikSquare, // площадь полика
            print, // есть ли печать
            priceForBoard, // стоимость изготовления подложки
            neonPrice, // стоимость неона
            // neonCosts,
            lightingPrice, // стоимость подсветки
            screen,
            priceForScreen,
            // masterPrice,
            masterReport: {
              // Отчет сборщика
              master: masterReport?.user.fullName ?? 'Не известно', // Сборщик
              cost: masterCost, // ЗП сборщика
              date: masterReport?.date ?? null, // дата сборки
            },
            wirePrice,
            adapter: adapter?.name ?? 'Нет',
            adapterPrice,
            plugPrice,
            packageCost,
            dimmerPrice,
            totalCost,
          };
        });
        const packerReportsForTask = packerReportsByTaskId.get(taskId) ?? [];
        const packerReportsRes = packerReportsForTask.map((report) => {
          return {
            packer: report.user.fullName, // Упаковщик
            cost: report.cost, // ЗП упаковщика
            date: report.date, // Дата упаковки
          };
        });
        const totalCost =
          orders.reduce((acc, order) => acc + order.totalCost, 0) +
          packerReportsForTask.reduce(
            (acc, report) => acc + Number(report.cost ?? 0),
            0,
          );

        return {
          id: taskId,
          boardId: taskBoardId,
          orders,
          packerReports: packerReportsRes,
          totalCost,
        };
      });
    }

    return {
      productionTasks,
      deliveriesTotal,
    };
  }

  async getDealCards(id: number) {
    const ordersInclude = {
      orders: {
        include: {
          neons: true,
          lightings: true,
          package: {
            include: {
              items: true,
            },
          },
        },
      },
    } as const;

    const [designTasks, productionTasks] = await Promise.all([
      this.prisma.kanbanTask.findMany({
        where: {
          dealId: id,
          boardId: { in: [3, 16] },
        },
        include: ordersInclude,
      }),
      this.prisma.kanbanTask.findMany({
        where: {
          dealId: id,
          boardId: { in: [10, 5] },
        },
        include: ordersInclude,
      }),
    ]);

    const mapTask = (task: (typeof designTasks)[number]) => ({
      id: task.id,
      boardId: task.boardId,
      cover: task.cover,
      orders: task.orders,
    });

    return {
      designTasks: designTasks.map(mapTask),
      productionTasks: productionTasks.map(mapTask),
    };
  }
  async findOne(user: UserDto, id: number) {
    const groupsSearch = this.groupsAccessService.buildGroupsScope(user);

    const deal = await this.prisma.deal.findUnique({
      where: { id, group: groupsSearch },
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
        tasks: {
          select: {
            id: true,
            title: true,
            boardId: true,
            board: { select: { title: true } },
          },
        },
      },
    });

    if (!deal) {
      throw new NotFoundException(`Сделка с id ${id} не найдено.`);
    }

    deal.status = this.getDealStatus(deal);

    const { reviews } = deal;
    if (reviews.length > 0) {
      await Promise.all(
        reviews.map(async (review, i) => {
          // console.log(review.file);
          if (review.file[0]?.path) {
            const filePath = review.file[0].path;
            const resource = await this.yandexDisk.getResource(filePath, {
              fields: 'preview,sizes',
            });

            const preview = Array.isArray((resource as any).sizes)
              ? ((resource as any).sizes[0]?.url ?? resource.preview ?? '')
              : (resource.preview ?? '');

            reviews[i].file[0].preview = preview;
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
      include: { client: true },
    });
    if (!dealExists) {
      throw new NotFoundException(`Сделка с ID ${id} не найдена`);
    }

    // Проверяем существование нового клиента если передан clientId
    let newClient: { id: number; fullName: string } | null = null;
    if (
      updateDealDto.clientId &&
      updateDealDto.clientId !== dealExists.clientId
    ) {
      const foundClient = await this.prisma.client.findUnique({
        where: { id: updateDealDto.clientId },
      });
      if (!foundClient) {
        throw new NotFoundException(
          `Клиент с ID ${updateDealDto.clientId} не найден`,
        );
      }
      newClient = foundClient;
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
      bookSize: 'Размер книги',
      pages: 'Количество страниц',
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

    // Логируем изменение клиента отдельно
    if (newClient) {
      await this.prisma.dealAudit.create({
        data: {
          dealId: id,
          userId: user.id,
          action: 'Обновление',
          comment: `Изменение клиента: с "${dealExists.client?.fullName || 'не указан'}" на "${newClient.fullName}"`,
        },
      });
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
    const groupsSearch = this.groupsAccessService.buildGroupsScope(user);
    const groups = await this.prisma.group.findMany({
      where: {
        ...groupsSearch,
        workSpace: {
          department: 'COMMERCIAL',
        },
      },
      select: {
        id: true,
        title: true,
      },
    });

    const methods = await this.prisma.clothingMethod.findMany({
      select: {
        title: true,
      },
    });
    const sources = await this.prisma.dealSource.findMany({
      // where: {
      //   workSpace: {
      //     groups: {
      //       some: groupsSearch,
      //     },
      //   },
      // },
      select: {
        title: true,
      },
    });
    const adTags = await this.prisma.adTag.findMany({
      select: {
        title: true,
      },
    });
    const spheres = await this.prisma.sphere.findMany({
      select: {
        title: true,
      },
    });

    const managers = await this.prisma.user.findMany({
      where: {
        group: groupsSearch,
        role: { shortName: { in: ['MOP', 'DO', 'ROP', 'MOV', 'ROV'] } },
        deletedAt: null,
      },
      select: {
        id: true,
        fullName: true,
      },
    });

    return {
      methods: methods.map((i) => i.title),
      sources: sources.map((i) => i.title),
      adTags: adTags.map((i) => i.title),
      spheres: spheres.map((i) => i.title),
      groups,
      managers,
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
