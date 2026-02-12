import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import * as ExcelJS from 'exceljs';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlanFactAccountCreateDto } from './dto/planfact-account-create.dto';
import { DashboardsService } from '../dashboards/dashboards.service';
// import { CommercialDatasService } from '../commercial-datas/commercial-datas.service';
import { CreateOperationDto } from './dto/create-operation.dto';
import { UpdateOperationDto } from './dto/update-operation.dto';
import { CreateExpenseCategoryDto } from './dto/expense-category-create.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { CreateCounterPartyDto } from './dto/counterparty-create.dto';
import { SocksProxyAgent } from 'socks-proxy-agent';

const tbankProxy = 'socks5h://127.0.0.1:1080';
const tbankProxyAgent = tbankProxy
  ? new SocksProxyAgent(tbankProxy)
  : undefined;

const tToken = process.env.TB_TOKEN;

export interface OperationFromApi {
  operationId: string;
  operationDate: string;
  typeOfOperation: string;
  category: string;
  description: string;
  payPurpose: string;
  accountAmount: number;

  counterParty: CounterPartyFromApi;
  expenseCategoryId: number | null;
  expenseCategoryName: string | null;
}

export interface CounterPartyFromApi {
  account: string;
  inn: string;
  kpp: string;
  name: string;
  bankName: string;
  bankBic: string;
  corrAccount: string;
}

export interface CounterPartyType {
  id: number;
  title: string;
}

export interface ExpenseCategoryType {
  id: number;
  name: string;
}

export interface ExpenseCategoryTree {
  id: number;
  name: string;
  type: string;
  description: string | null;
  parentId: number | null;
  createdAt: Date;
  updatedAt: Date;
  children: ExpenseCategoryTree[];
}

export interface ProjectType {
  id: number;
  name: string;
  code?: string | null;
}

export interface OperationPositionType {
  id: number;
  counterPartyId: number | null;
  expenseCategoryId: number | null;
  amount: number;
  period?: string | null;
  counterParty?: CounterPartyType;
  expenseCategory?: ExpenseCategoryType;
  project?: ProjectType | null;
}

export interface OriginalOperationType {
  id: number;
  operationId: string;
  operationDate: string;
  accountAmount: number;
  payPurpose?: string;
  counterPartyAccount?: string | null;
  account?: {
    id: number;
    name: string;
    accountNumber?: string;
    isReal?: boolean;
  };
  operationPositions: OperationPositionType[];
  typeOfOperation: string;
  category: string;
}

interface ExtendedPrismaClient {
  originalOperationFromTbank: {
    findMany: (args: unknown) => Promise<OriginalOperationType[]>;
    findUnique: (args: unknown) => Promise<OriginalOperationType>;
    upsert: (args: unknown) => Promise<OriginalOperationType>;
  };
  tbankSyncStatus: {
    upsert: (args: unknown) => Promise<unknown>;
  };
}

@Injectable()
export class PlanfactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardsService: DashboardsService,
  ) {}

  async createOperation(dto: CreateOperationDto) {
    // Проверка счета
    const account = await this.prisma.planFactAccount.findUnique({
      where: { id: dto.accountId },
    });
    if (!account) {
      throw new NotFoundException(`Счет с ID ${dto.accountId} не найден`);
    }

    // Проверка категорий и контрагентов для каждой позиции
    for (const position of dto.operationPositions || []) {
      if (position.expenseCategoryId) {
        const category = await this.prisma.expenseCategory.findUnique({
          where: { id: position.expenseCategoryId },
        });
        if (!category) {
          throw new NotFoundException(
            `Категория с ID ${position.expenseCategoryId} не найдена`,
          );
        }
      }

      if (position.counterPartyId) {
        const counterParty = await this.prisma.counterParty.findUnique({
          where: { id: position.counterPartyId },
        });
        if (!counterParty) {
          throw new NotFoundException(
            `Контрагент с ID ${position.counterPartyId} не найден`,
          );
        }
      }
    }

    return this.prisma.$transaction(async (prisma) => {
      // Создаем операцию
      const operation = await prisma.operation.create({
        data: {
          operationDate: dto.operationDate,
          operationDateTime: new Date(dto.operationDate),
          operationType: dto.operationType,
          description: dto.description || '',
          payPurpose: dto.payPurpose || '',
          accountId: dto.accountId,
          operationId: Date.now().toString(),
        },
      });

      // Создаем позиции, присваивая operationId
      if (dto.operationPositions && dto.operationPositions.length > 0) {
        const fallbackPeriod = dto.operationDate?.slice(0, 7);
        await prisma.operationPosition.createMany({
          data: dto.operationPositions.map((pos) => ({
            amount: pos.amount,
            period: pos.period || fallbackPeriod,
            counterPartyId: pos.counterPartyId || null,
            expenseCategoryId: pos.expenseCategoryId || null,
            operationId: operation.id,
          })),
        });
      }

      // Возвращаем операцию с позициями
      return prisma.operation.findUnique({
        where: { id: operation.id },
        include: { operationPositions: true },
      });
    });
  }

  async updateOperation(operationId: string, dto: UpdateOperationDto) {
    const operation = await this.prisma.operation.findUnique({
      where: { operationId },
      include: { operationPositions: true },
    });
    if (!operation) {
      throw new NotFoundException(`Операция с ID ${operationId} не найдена`);
    }

    const account = await this.prisma.planFactAccount.findUnique({
      where: { id: dto.accountId },
    });
    if (!account) {
      throw new NotFoundException(`Счет с ID ${dto.accountId} не найден`);
    }

    // Проверка категорий и контрагентов для каждой позиции
    if (dto.operationPositions) {
      for (const position of dto.operationPositions) {
        if (position.expenseCategoryId) {
          const category = await this.prisma.expenseCategory.findUnique({
            where: { id: position.expenseCategoryId },
          });
          if (!category) {
            throw new NotFoundException(
              `Категория с ID ${position.expenseCategoryId} не найдена`,
            );
          }
        }

        if (position.counterPartyId) {
          const counterParty = await this.prisma.counterParty.findUnique({
            where: { id: position.counterPartyId },
          });
          if (!counterParty) {
            throw new NotFoundException(
              `Контрагент с ID ${position.counterPartyId} не найден`,
            );
          }
        }
      }
    }

    return this.prisma.$transaction(async (prisma) => {
      // Обновляем операцию
      const updatedOperation = await prisma.operation.update({
        where: { operationId },
        data: {
          operationDate: dto.operationDate,
          operationType: dto.operationType,
          description: dto.description || '',
          payPurpose: dto.payPurpose || '',
          accountId: dto.accountId,
        },
        include: { operationPositions: true },
      });

      const fallbackPeriod = (
        dto.operationDate || operation.operationDate
      ).slice(0, 7);

      // Если есть позиции, обновляем/создаем/удаляем их
      if (dto.operationPositions) {
        // Удаляем позиции, которых нет в новом списке
        const existingPositionIds = operation.operationPositions.map(
          (pos) => pos.id,
        );
        const newPositionIds = dto.operationPositions
          .filter((pos) => pos.id)
          .map((pos) => pos.id!);
        const positionsToDelete = existingPositionIds.filter(
          (id) => !newPositionIds.includes(id),
        );

        await prisma.operationPosition.deleteMany({
          where: {
            id: { in: positionsToDelete },
            operationId: operation.id,
          },
        });

        // Создаем или обновляем позиции
        for (const position of dto.operationPositions) {
          if (position.id) {
            // Обновляем существующую позицию
            await prisma.operationPosition.update({
              where: { id: position.id, operationId: operation.id },
              data: {
                amount: position.amount,
                period: position.period || fallbackPeriod,
                counterPartyId: position.counterPartyId || null,
                expenseCategoryId: position.expenseCategoryId || null,
              },
            });
          } else {
            // Создаем новую позицию
            await prisma.operationPosition.create({
              data: {
                amount: position.amount,
                period: position.period || fallbackPeriod,
                counterPartyId: position.counterPartyId || null,
                expenseCategoryId: position.expenseCategoryId || null,
                operationId: operation.id,
              },
            });
          }
        }
      }

      return updatedOperation;
    });
  }

  async deleteOperation(operationId: string) {
    const operation = await this.prisma.operation.findUnique({
      where: { operationId },
    });
    if (!operation) {
      throw new NotFoundException(`Операция с ID ${operationId} не найдена`);
    }

    return this.prisma.operation.update({
      where: { operationId },
      data: { deletedAt: new Date() },
    });
  }

  async getOrCreateCounterParty(counterPartyData: {
    account: string;
    inn: string;
    kpp: string;
    name: string;
    bankName: string;
    bankBic: string;
  }) {
    // console.log(counterPartyData);
    const existingCounterParty = await this.prisma.counterParty.findFirst({
      where: { account: counterPartyData.account },
    });

    if (existingCounterParty) {
      // console.log('existingCounterParty', counterPartyData);
      return existingCounterParty;
    }
    // console.log('newCounter', counterPartyData);

    const counterParty = await this.prisma.counterParty.create({
      data: {
        title: counterPartyData.name || 'Неизвестный контрагент',
        type: 'Получатель',
        inn: counterPartyData.inn || '',
        kpp: counterPartyData.kpp || '',
        account: counterPartyData.account || '',
        bankBic: counterPartyData.bankBic || '',
        bankName: counterPartyData.bankName || '',
        contrAgentGroup: 'Контрагенты без группы', // По умолчанию, если группа неизвестна
      },
    });

    return counterParty;
  }

  async createCounterParty(dto: CreateCounterPartyDto) {
    // Проверяем существование категорий, если указаны
    if (dto.incomeExpenseCategoryId) {
      const incomeCategory = await this.prisma.expenseCategory.findUnique({
        where: { id: dto.incomeExpenseCategoryId },
      });
      if (!incomeCategory) {
        throw new BadRequestException(
          'Указанная категория для входящих операций не найдена',
        );
      }
    }

    if (dto.outcomeExpenseCategoryId) {
      const outcomeCategory = await this.prisma.expenseCategory.findUnique({
        where: { id: dto.outcomeExpenseCategoryId },
      });
      if (!outcomeCategory) {
        throw new BadRequestException(
          'Указанная категория для исходящих операций не найдена',
        );
      }
    }

    return this.prisma.counterParty.create({
      data: {
        title: dto.title,
        type: dto.type,
        inn: dto.inn || '',
        kpp: dto.kpp || '',
        account: dto.account || '',
        bankBic: dto.bankBic || '',
        bankName: dto.bankName || '',
        contrAgentGroup: dto.contrAgentGroup || '',
        incomeExpenseCategoryId: dto.incomeExpenseCategoryId || null,
        outcomeExpenseCategoryId: dto.outcomeExpenseCategoryId || null,
      },
      include: {
        incomeExpenseCategory: true,
        outcomeExpenseCategory: true,
      },
    });
  }

  async getCounterPartiesFilters({
    page,
    limit,
    title,
  }: {
    page: number;
    limit: number;
    title?: string;
  }) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (title) {
      where.title = {
        contains: title,
        mode: 'insensitive',
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.counterParty.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          title: 'asc',
        },
        select: {
          id: true,
          title: true,
          account: true,
        },
      }),
      this.prisma.counterParty.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async createExpenseCategory(dto: CreateExpenseCategoryDto) {
    // Проверяем, существует ли родительская категория, если указан parentId
    // console.log(dto);
    if (dto.parentId) {
      const parentExists = await this.prisma.expenseCategory.findUnique({
        where: { id: dto.parentId },
      });
      if (!parentExists) {
        throw new BadRequestException(
          'Указанная родительская категория не найдена',
        );
      }
      // Проверяем, что родительская категория имеет тот же тип
      if (parentExists.type !== dto.type) {
        throw new BadRequestException(
          'Тип родительской категории должен совпадать с типом новой категории',
        );
      }
    }

    return this.prisma.expenseCategory.create({
      data: {
        name: dto.name,
        type: dto.type,
        description: dto.description || '',
        parentId: dto.parentId || null,
      },
      include: {
        parent: true,
        children: true,
      },
    });
  }

  async updateExpenseCategory(id: number, dto: UpdateExpenseCategoryDto) {
    // Проверяем, существует ли категория
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException(`Категория с ID ${id} не найдена`);
    }

    // Если обновляется parentId, проверяем существование родительской категории
    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        // Разрешаем установку parentId в null (удаление родителя)
      } else {
        // Проверяем, что родительская категория существует
        const parentExists = await this.prisma.expenseCategory.findUnique({
          where: { id: dto.parentId },
        });
        if (!parentExists) {
          throw new BadRequestException(
            'Указанная родительская категория не найдена',
          );
        }

        // Проверяем, что не пытаемся установить категорию родителем самой себя
        if (dto.parentId === id) {
          throw new BadRequestException(
            'Категория не может быть родителем самой себя',
          );
        }

        // Проверяем, что тип родительской категории совпадает с типом текущей категории
        const categoryType = dto.type || category.type;
        if (parentExists.type !== categoryType) {
          throw new BadRequestException(
            'Тип родительской категории должен совпадать с типом категории',
          );
        }

        // Проверяем, что не создается циклическая зависимость
        // (родитель не должен быть потомком текущей категории)
        const checkCircularDependency = async (
          parentId: number,
          currentId: number,
        ): Promise<boolean> => {
          const parent = await this.prisma.expenseCategory.findUnique({
            where: { id: parentId },
            select: { parentId: true },
          });
          if (!parent || !parent.parentId) {
            return false;
          }
          if (parent.parentId === currentId) {
            return true;
          }
          return checkCircularDependency(parent.parentId, currentId);
        };

        const hasCircularDependency = await checkCircularDependency(
          dto.parentId,
          id,
        );
        if (hasCircularDependency) {
          throw new BadRequestException(
            'Невозможно установить родителя: создается циклическая зависимость',
          );
        }
      }
    }

    // Если обновляется type, проверяем, что все дочерние категории имеют тот же тип
    if (dto.type && dto.type !== category.type) {
      const children = await this.prisma.expenseCategory.findMany({
        where: { parentId: id },
      });
      if (children.length > 0) {
        throw new BadRequestException(
          'Невозможно изменить тип категории, у которой есть дочерние категории',
        );
      }
    }

    // Подготавливаем данные для обновления
    const updateData: {
      name?: string;
      type?: string;
      description?: string;
      parentId?: number | null;
    } = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name;
    }
    if (dto.type !== undefined) {
      updateData.type = dto.type;
    }
    if (dto.description !== undefined) {
      updateData.description = dto.description;
    }
    if (dto.parentId !== undefined) {
      updateData.parentId = dto.parentId;
    }

    return this.prisma.expenseCategory.update({
      where: { id },
      data: updateData,
      include: {
        parent: true,
        children: true,
      },
    });
  }

  async deleteExpenseCategory(id: number) {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException(`Категория с ID ${id} не найдена`);
    }

    const result = await this.prisma.$transaction(async (prisma) => {
      const childrenUpdate = await prisma.expenseCategory.updateMany({
        where: { parentId: id },
        data: { parentId: null },
      });

      const positionsUpdate = await prisma.operationPosition.updateMany({
        where: { expenseCategoryId: id },
        data: { expenseCategoryId: null },
      });

      const incomeCounterPartiesUpdate = await prisma.counterParty.updateMany({
        where: { incomeExpenseCategoryId: id },
        data: { incomeExpenseCategoryId: null },
      });

      const outcomeCounterPartiesUpdate = await prisma.counterParty.updateMany({
        where: { outcomeExpenseCategoryId: id },
        data: { outcomeExpenseCategoryId: null },
      });

      await prisma.expenseCategory.delete({ where: { id } });

      return {
        childrenUpdated: childrenUpdate.count,
        positionsUpdated: positionsUpdate.count,
        counterPartiesUpdated:
          incomeCounterPartiesUpdate.count + outcomeCounterPartiesUpdate.count,
      };
    });

    return { success: true, ...result };
  }

  async getExpenseCategoriesByType(type: string) {
    // Получаем все категории нужного типа без include (более эффективно)
    const allCategories = await this.prisma.expenseCategory.findMany({
      where: {
        type,
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Создаем карту для быстрого доступа к детям по parentId
    const childrenMap = new Map<number, typeof allCategories>();
    for (const category of allCategories) {
      if (category.parentId !== null) {
        if (!childrenMap.has(category.parentId)) {
          childrenMap.set(category.parentId, []);
        }
        childrenMap.get(category.parentId)!.push(category);
      }
    }

    // Рекурсивная функция для построения дерева категорий с полной вложенностью
    const buildCategoryTree = (category: (typeof allCategories)[0]) => {
      const categoryData = {
        ...category,
        children: [] as typeof allCategories,
      };

      // Находим всех детей этой категории из карты
      const children = childrenMap.get(category.id) || [];

      // Рекурсивно строим дерево для каждого ребенка
      categoryData.children = children.map((child) => buildCategoryTree(child));

      return categoryData;
    };

    // Фильтруем только корневые категории (без родителей)
    const rootCategories = allCategories.filter((cat) => cat.parentId === null);

    // Строим дерево для каждой корневой категории
    const categories = rootCategories.map((rootCategory) =>
      buildCategoryTree(rootCategory),
    );

    const flattenCategories = (categories, prefix = '') => {
      return categories.reduce((acc, cat) => {
        const formattedCategory = { ...cat, name: `${prefix}${cat.name}` };
        acc.push(formattedCategory);
        if (cat.children && cat.children.length > 0) {
          acc.push(...flattenCategories(cat.children, `${prefix} - `));
        }
        return acc;
      }, []);
    };

    return flattenCategories(categories);
  }

  async getExpenseCategoriesList() {
    // Получаем все категории без include (более эффективно)
    const allCategories = await this.prisma.expenseCategory.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    // Создаем карту для быстрого доступа к детям по parentId
    const childrenMap = new Map<number, typeof allCategories>();
    for (const category of allCategories) {
      if (category.parentId !== null) {
        if (!childrenMap.has(category.parentId)) {
          childrenMap.set(category.parentId, []);
        }
        childrenMap.get(category.parentId)!.push(category);
      }
    }

    // Рекурсивная функция для построения дерева категорий
    const buildCategoryTree = (
      category: (typeof allCategories)[0],
    ): ExpenseCategoryTree => {
      const categoryData: ExpenseCategoryTree = {
        id: category.id,
        name: category.name,
        type: category.type,
        description: category.description,
        parentId: category.parentId,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
        children: [],
      };

      // Находим всех детей этой категории из карты
      const children = childrenMap.get(category.id) || [];

      // Рекурсивно строим дерево для каждого ребенка
      categoryData.children = children
        .map((child) => buildCategoryTree(child))
        .sort((a, b) => a.name.localeCompare(b.name));

      return categoryData;
    };

    // Фильтруем только корневые категории (без родителей)
    const rootCategories = allCategories.filter((cat) => cat.parentId === null);

    // Группируем по типу
    const groupedByType: Record<string, ExpenseCategoryTree[]> = {};

    for (const rootCategory of rootCategories) {
      const type = rootCategory.type;
      if (!groupedByType[type]) {
        groupedByType[type] = [];
      }

      // Строим дерево для каждой корневой категории
      const categoryTree = buildCategoryTree(rootCategory);
      groupedByType[type].push(categoryTree);
    }

    // Сортируем категории внутри каждого типа по имени
    for (const type in groupedByType) {
      groupedByType[type].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Определяем порядок типов
    const typeOrder = [
      'Расходы',
      'Доходы',
      'Обязательства',
      'Капитал',
      'Активы',
    ];

    // Создаем новый объект с типами в нужном порядке
    const orderedResult: Record<string, ExpenseCategoryTree[]> = {};
    for (const type of typeOrder) {
      if (groupedByType[type]) {
        orderedResult[type] = groupedByType[type];
      }
    }

    // Добавляем остальные типы, если они есть (на случай, если появятся новые типы)
    for (const type in groupedByType) {
      if (!orderedResult[type]) {
        orderedResult[type] = groupedByType[type];
      }
    }

    return orderedResult;
  }

  // async assignExpenseCategory(operationId: string, expenseCategoryId: number) {
  //   // Проверяем существование категории и что она листовая
  //   const category = await this.prisma.expenseCategory.findUnique({
  //     where: { id: expenseCategoryId },
  //     // include: { children: { select: { id: true } } },
  //   });

  //   if (!category) {
  //     throw new NotFoundException('Категория не найдена');
  //   }

  //   // Проверяем операцию
  //   const operation = await this.prisma.operation.findUnique({
  //     where: { operationId },
  //     include: {
  //       // expenseCategory: true,
  //     },
  //   });

  //   if (!operation) {
  //     throw new NotFoundException('Операция не найдена');
  //   }
  //   // Обновляем существующую операцию
  //   const updatedOperation = await this.prisma.operation.update({
  //     where: { operationId },
  //     data: { expenseCategoryId },
  //     include: {
  //       // expenseCategory: true,
  //       // counterParty: true,
  //     },
  //   });

  //   return updatedOperation;
  // }

  async createAccount(PlanFactAccountCreateDto: PlanFactAccountCreateDto) {
    return await this.prisma.planFactAccount.create({
      data: PlanFactAccountCreateDto,
    });
  }

  async getBankAccounts() {
    // const bankAccounts = ['40802810800000977213', '40802810900002414658']; // Список банковских счетов

    // const response = await axios.get(
    //   'https://business.tbank.ru/openapi/api/v4/bank-accounts',
    //   {
    //     headers: {
    //       Authorization: 'Bearer ' + tToken,
    //       'Content-Type': 'application/json',
    //     },
    //     maxBodyLength: Infinity,
    //   },
    // );
    // console.log(response);

    const accounts = await this.prisma.planFactAccount.findMany({
      select: {
        id: true,
        name: true,
      },
    });
    // console.log(accounts);
    return accounts;
  }

  private async getRealAccountNumbers() {
    const realAccounts = await this.prisma.planFactAccount.findMany({
      where: {
        isReal: true,
      },
      select: {
        accountNumber: true,
      },
    });
    return realAccounts.map((acc) => acc.accountNumber);
  }

  private buildOriginalOperationsWhere(
    {
      from,
      to,
      accountId,
      projectId,
      counterPartyId,
      expenseCategoryId,
      typeOfOperation,
      searchText,
    }: {
      from: string;
      to: string;
      accountId?: number;
      projectId?: number;
      counterPartyId?: number[];
      expenseCategoryId?: number[];
      typeOfOperation?: string;
      searchText?: string;
    },
    realAccountNumbers: string[],
  ) {
    const conditions: Record<string, unknown>[] = [];

    if (searchText) {
      conditions.push({
        OR: [
          {
            counterPartyTitle: {
              contains: searchText,
              mode: 'insensitive',
            },
          },
          {
            operationPositions: {
              some: {
                counterParty: {
                  title: {
                    contains: searchText,
                    mode: 'insensitive',
                  },
                },
              },
            },
          },
          {
            payPurpose: {
              contains: searchText,
              mode: 'insensitive',
            },
          },
          {
            operationId: {
              contains: searchText,
              mode: 'insensitive',
            },
          },
        ],
      });
    } else {
      conditions.push({
        operationDate: {
          gte: from,
          lte: to + 'T23:59:59.999Z',
        },
      });
      if (
        expenseCategoryId &&
        expenseCategoryId.length > 0 &&
        expenseCategoryId.includes(0)
      ) {
        conditions.push({
          NOT: {
            OR: [
              {
                payPurpose: {
                  contains: 'Возврат д/с с депозита "Овернайт"',
                },
              },
              {
                payPurpose: {
                  contains: 'Внутренний перевод на депозит "Овернайт"',
                },
              },
            ],
          },
        });
      }

      if (accountId) {
        conditions.push({
          accountId,
        });
      }

      if (typeOfOperation) {
        if (typeOfOperation === 'Transfer') {
          if (realAccountNumbers.length > 0) {
            conditions.push({
              counterPartyAccount: {
                in: realAccountNumbers,
              },
            });
          } else {
            conditions.push({
              id: -1,
            });
          }
        } else {
          conditions.push({
            typeOfOperation,
          });
          if (realAccountNumbers.length > 0) {
            conditions.push({
              NOT: {
                counterPartyAccount: {
                  in: realAccountNumbers,
                },
              },
            });
          }
        }
      }

      const positionConditions: Record<string, unknown>[] = [];

      if (projectId) {
        positionConditions.push({
          projectId,
        });
      }

      if (counterPartyId && counterPartyId.length > 0) {
        positionConditions.push({
          counterPartyId: {
            in: counterPartyId,
          },
        });
      }

      if (expenseCategoryId && expenseCategoryId.length > 0) {
        if (expenseCategoryId.includes(0)) {
          const categoryIds = expenseCategoryId.filter((id) => id !== 0);
          if (categoryIds.length > 0) {
            positionConditions.push({
              OR: [
                { expenseCategoryId: null },
                { expenseCategoryId: { in: categoryIds } },
              ],
            });
          } else {
            positionConditions.push({
              expenseCategoryId: null,
            });
          }
        } else {
          positionConditions.push({
            expenseCategoryId: {
              in: expenseCategoryId,
            },
          });
        }
      }

      if (positionConditions.length > 0) {
        const positionFilter =
          positionConditions.length === 1
            ? positionConditions[0]
            : { AND: positionConditions };
        conditions.push({
          operationPositions: {
            some: positionFilter,
          },
        });
      }
    }

    return conditions.length === 1 ? conditions[0] : { AND: conditions };
  }

  private addTransferFlags(
    operations: Array<
      OriginalOperationType & {
        counterPartyAccount?: string | null;
        payPurpose?: string | null;
      }
    >,
    realAccountNumbers: string[],
  ) {
    return operations.map((operation) => {
      const counterPartyAccount = operation.counterPartyAccount || undefined;
      const payPurpose = operation.payPurpose || '';
      const isTransferOperation =
        (counterPartyAccount &&
          realAccountNumbers.includes(counterPartyAccount)) ||
        payPurpose.includes('Возврат д/с с депозита "Овернайт"') ||
        payPurpose.includes('Внутренний перевод на депозит "Овернайт"');
      return {
        ...operation,
        isTransferOperation: !!isTransferOperation,
      };
    });
  }

  private applyDistributionFilter<T extends OriginalOperationType>(
    operations: Array<
      T & {
        operationPositions: Array<{ expenseCategoryId: number | null }>;
        category?: string | null;
      }
    >,
    distributionFilter?: string,
  ) {
    let filteredOperations = operations;

    if (distributionFilter === 'hasCat') {
      filteredOperations = operations.filter(
        (operation) =>
          operation.operationPositions.length > 0 &&
          operation.operationPositions.every(
            (position) => position.expenseCategoryId !== null,
          ),
      );
    } else if (distributionFilter === 'hasntCat') {
      filteredOperations = operations.filter((operation) =>
        operation.operationPositions.some(
          (position) => position.expenseCategoryId === null,
        ),
      );
    }

    if (distributionFilter === 'hasCat' || distributionFilter === 'hasntCat') {
      filteredOperations = filteredOperations.filter(
        (operation) =>
          operation.category !== 'selfTransferInner' &&
          operation.category !== 'selfTransferOuter',
      );
    }

    return filteredOperations;
  }

  private formatDateForExport(dateString: string) {
    const date = new Date(dateString);
    const timezoneOffset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() + timezoneOffset * 60000);
    const day = localDate.getDate().toString().padStart(2, '0');
    const month = (localDate.getMonth() + 1).toString().padStart(2, '0');
    const year = localDate.getFullYear();
    const hours = localDate.getHours().toString().padStart(2, '0');
    const minutes = localDate.getMinutes().toString().padStart(2, '0');

    return {
      date: `${day}.${month}.${year}`,
      time: `${hours}:${minutes}`,
    };
  }

  private replaceLegalEntities(input: string): string {
    const replacements: [RegExp, string][] = [
      [
        /ОБЩЕСТВО\s+С\s+ОГРАНИЧЕННОЙ\s+ОТВЕТСТВЕННОСТЬЮ|Общество\s+с\s+ограниченной\s+ответственностью/gi,
        'ООО',
      ],
      [
        /ИНДИВИДУАЛЬНЫЙ\s+ПРЕДПРИНИМАТЕЛЬ|Индивидуальный\s+предприниматель/gi,
        'ИП',
      ],
      [/АКЦИОНЕРНОЕ\s+ОБЩЕСТВО|Акционерное\s+общество/gi, 'АО'],
      [
        /ЗАКРЫТОЕ\s+АКЦИОНЕРНОЕ\s+ОБЩЕСТВО|Закрытое\s+акционерное\s+общество/gi,
        'ЗАО',
      ],
      [
        /ОТКРЫТОЕ\s+АКЦИОНЕРНОЕ\s+ОБЩЕСТВО|Открытое\s+акционерное\s+общество/gi,
        'ОАО',
      ],
    ];

    let result = input;
    for (const [pattern, replacement] of replacements) {
      result = result.replace(pattern, replacement);
    }

    return result.trim().replace(/\s+/g, ' ');
  }

  private getCategoryDisplayName(
    category: string,
    operationType: string,
  ): string {
    if (!category) return operationType === 'Debit' ? 'Выплата' : 'Поступление';

    const debitCategories: Record<string, string> = {
      cardOperation: 'Оплата картой',
      cashOut: 'Снятие наличных',
      fee: 'Услуги банка',
      penalty: 'Штрафы',
      contragentPeople: 'Исходящие платежи',
      selfIncomeOuter: 'Перевод себе в другой банк',
      selfTransferOuter: 'Перевод между своими счетами в T‑Бизнесе',
      salary: 'Выплаты',
      contragentOutcome: 'Перевод контрагенту',
      contragentRefund: 'Возврат контрагенту',
      budget: 'Платежи в бюджет',
      tax: 'Налоговые платежи',
      creditPaymentOuter: 'Погашение кредита',
      'sme-c2c': 'С карты на карту',
      otherOut: 'Другое',
      unspecifiedOut: 'Без категории',
    };

    const creditCategories: Record<string, string> = {
      incomePeople: 'Входящие платежи',
      selfTransferInner: 'Перевод между своими счетами в T‑Бизнесе',
      selfOutcomeOuter: 'Перевод себе из другого банка',
      contragentIncome: 'Пополнение от контрагента',
      acquiring: 'Эквайринг',
      acquiringPos: 'Торговый эквайринг',
      acquiringInternet: 'Интернет-эквайринг',
      incomeLoan: 'Получение кредита',
      refundIn: 'Возврат средств',
      cashIn: 'Взнос наличных',
      cashInRevenue: 'Взнос выручки из кассы',
      cashInOwn: 'Взнос собственных средств',
      income: 'Проценты на остаток по счету',
      depositPartWithdrawal: 'Частичное изъятие средств депозита',
      depositFullWithdrawal: 'Закрытие депозитного счета ЮЛ',
      creditPaymentInner: 'Погашение кредита',
      otherIn: 'Другое',
      unspecifiedIn: 'Без категории',
    };

    if (operationType === 'Debit') {
      return debitCategories[category] || category;
    }
    if (operationType === 'Credit') {
      return creditCategories[category] || category;
    }

    return category;
  }

  async getOriginalOperations({
    from,
    to,
    page,
    limit,
    accountId,
    projectId,
    distributionFilter,
    counterPartyId,
    expenseCategoryId,
    typeOfOperation,
    searchText,
  }: {
    from: string;
    to: string;
    page: number;
    limit: number;
    accountId?: number;
    projectId?: number;
    distributionFilter?: string;
    counterPartyId?: number[];
    expenseCategoryId?: number[];
    typeOfOperation?: string;
    searchText?: string;
  }) {
    const skip = (page - 1) * limit;
    const realAccountNumbers = await this.getRealAccountNumbers();
    const where = this.buildOriginalOperationsWhere(
      {
        from,
        to,
        accountId,
        projectId,
        counterPartyId,
        expenseCategoryId,
        typeOfOperation,
        searchText,
      },
      realAccountNumbers,
    );

    // Получаем все операции без пагинации для фильтрации
    const allOperations = await (
      this.prisma as unknown as ExtendedPrismaClient
    ).originalOperationFromTbank.findMany({
      where,
      orderBy: {
        operationDate: 'desc',
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountNumber: true,
            isReal: true,
          },
        },
        operationPositions: {
          include: {
            counterParty: {
              include: {
                incomeExpenseCategory: true,
                outcomeExpenseCategory: true,
                incomeProject: true,
                outcomeProject: true,
              },
            },
            expenseCategory: true,
            project: true,
          },
        },
      },
    });

    const operationsWithTransferFlag = this.addTransferFlags(
      allOperations,
      realAccountNumbers,
    );
    const filteredOperations = this.applyDistributionFilter(
      operationsWithTransferFlag,
      distributionFilter,
    );

    // Применяем пагинацию к отфильтрованным операциям
    const total = filteredOperations.length;
    const operations = filteredOperations.slice(skip, skip + limit);

    return {
      operations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async exportOriginalOperations({
    from,
    to,
    accountId,
    projectId,
    distributionFilter,
    counterPartyId,
    expenseCategoryId,
    typeOfOperation,
    searchText,
  }: {
    from: string;
    to: string;
    accountId?: number;
    projectId?: number;
    distributionFilter?: string;
    counterPartyId?: number[];
    expenseCategoryId?: number[];
    typeOfOperation?: string;
    searchText?: string;
  }) {
    const realAccountNumbers = await this.getRealAccountNumbers();
    const where = this.buildOriginalOperationsWhere(
      {
        from,
        to,
        accountId,
        projectId,
        counterPartyId,
        expenseCategoryId,
        typeOfOperation,
        searchText,
      },
      realAccountNumbers,
    );

    const allOperations = await (
      this.prisma as unknown as ExtendedPrismaClient
    ).originalOperationFromTbank.findMany({
      where,
      orderBy: {
        operationDate: 'desc',
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountNumber: true,
            isReal: true,
          },
        },
        operationPositions: {
          include: {
            counterParty: true,
            expenseCategory: true,
            project: true,
          },
        },
      },
    });

    const operationsWithTransferFlag = this.addTransferFlags(
      allOperations,
      realAccountNumbers,
    );
    const filteredOperations = this.applyDistributionFilter(
      operationsWithTransferFlag,
      distributionFilter,
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Операции');

    worksheet.columns = [
      { header: 'Дата', key: 'date', width: 20 },
      { header: 'Тип', key: 'type', width: 32 },
      { header: 'Категория', key: 'category', width: 20 },
      { header: 'Статья', key: 'expenseCategory', width: 32 },
      { header: 'Проект', key: 'project', width: 24 },
      { header: 'Счет', key: 'account', width: 24 },
      { header: 'Контрагент', key: 'counterParty', width: 32 },
      { header: 'Назначение', key: 'purpose', width: 60 },
      { header: 'Сумма', key: 'amount', width: 14 },
    ];

    for (const operation of filteredOperations) {
      const { date, time } = this.formatDateForExport(operation.operationDate);
      const typeLabel = this.getCategoryDisplayName(
        operation.category,
        operation.typeOfOperation,
      );
      const accountName = operation.account?.name || '';
      const operationPositions = operation.operationPositions || [];
      const counterPartyTitles = operationPositions
        .map((pos) => pos.counterParty?.title)
        .filter((title): title is string => Boolean(title))
        .map((title) => this.replaceLegalEntities(title));
      const uniqueCounterPartyTitles = Array.from(new Set(counterPartyTitles));
      const categoryNames = operationPositions
        .map((pos) => pos.expenseCategory?.name)
        .filter((name): name is string => Boolean(name));
      const uniqueCategoryNames = Array.from(new Set(categoryNames));
      const projectNames = operationPositions
        .map((pos) => pos.project?.name)
        .filter((name): name is string => Boolean(name));
      const uniqueProjectNames = Array.from(new Set(projectNames));
      const payPurpose = operation.payPurpose || '';
      const purposeValue =
        uniqueCategoryNames.length > 0
          ? `${uniqueCategoryNames.join(', ')}\n${payPurpose}`
          : payPurpose;

      worksheet.addRow({
        date: `${date} ${time}`,
        type: typeLabel,
        category: operation.category || '',
        expenseCategory: uniqueCategoryNames.join(', '),
        project: uniqueProjectNames.join(', ') || 'Общая деятельность',
        account: accountName,
        counterParty: uniqueCounterPartyTitles.join(', '),
        purpose: purposeValue,
        amount: operation.accountAmount,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  async getOriginalOperationsTotals({
    from,
    to,
    accountId,
    projectId,
    // counterPartyId,
    // expenseCategoryId,
    // typeOfOperation,
  }: {
    from: string;
    to: string;
    accountId?: number;
    projectId?: number;
    // counterPartyId?: number[];
    // expenseCategoryId?: number[];
    // typeOfOperation?: string;
  }) {
    const where: Record<string, unknown> = {
      operationDate: {
        gte: from,
        lte: to + 'T23:59:59.999Z',
      },
    };

    if (accountId) {
      where.accountId = accountId;
    }

    // if (typeOfOperation) {
    //   if (typeOfOperation === 'Transfer') {
    //     where.category = {
    //       in: ['selfTransferInner', 'selfTransferOuter'],
    //     };
    //   } else {
    //     where.typeOfOperation = typeOfOperation;
    //   }
    // }

    // Формируем условия для фильтрации по позициям операций
    const positionConditions: Record<string, unknown>[] = [];

    if (projectId) {
      positionConditions.push({
        projectId,
      });
    }

    // if (counterPartyId && counterPartyId.length > 0) {
    //   positionConditions.push({
    //     counterPartyId: {
    //       in: counterPartyId,
    //     },
    //   });
    // }

    // if (expenseCategoryId && expenseCategoryId.length > 0) {
    //   positionConditions.push({
    //     expenseCategoryId: {
    //       in: expenseCategoryId,
    //     },
    //   });
    // }

    // Если есть условия по позициям, применяем их
    if (positionConditions.length > 0) {
      if (positionConditions.length === 1) {
        where.operationPositions = {
          some: positionConditions[0],
        };
      } else {
        // Если несколько условий, объединяем через AND
        where.operationPositions = {
          some: {
            AND: positionConditions,
          },
        };
      }
    }

    // Получаем все операции для подсчета тоталов
    const allOperations = await this.prisma.originalOperationFromTbank.findMany(
      {
        where,
        include: {
          operationPositions: {
            include: {
              counterParty: {
                include: {
                  incomeExpenseCategory: true,
                  outcomeExpenseCategory: true,
                },
              },
              expenseCategory: true,
            },
          },
        },
      },
    );

    // Подсчитываем тоталы по контрагентам и категориям
    const counterPartyTotalsMap = new Map<
      number,
      {
        title: string;
        debit: number;
        credit: number;
        transfer: number;
        incomeExpenseCategory?: { id: number; name: string } | null;
        outcomeExpenseCategory?: { id: number; name: string } | null;
        mainParentCategory?: string | null;
      }
    >();
    const expenseCategoryTotalsMap = new Map<
      number,
      { title: string; debit: number; credit: number; transfer: number }
    >();

    // Отдельная запись для нераспределенных позиций
    const unallocatedTotal = {
      title: 'Нераспределенные',
      debit: 0,
      credit: 0,
      transfer: 0,
    };

    // Тоталы для переводов между своими счетами
    const selfTransferTotals = {
      title: 'Перемещения(не учитываются)',
      debit: 0,
      credit: 0,
      transfer: 0,
    };

    // Тоталы для transfer операций (не попадают в другие тоталы)
    let selfTransferInnerTotal = 0;
    let selfTransferOuterTotal = 0;

    // Находим все аккаунты с isReal=true и получаем массив accountNumber
    const realAccounts = await this.prisma.planFactAccount.findMany({
      where: {
        isReal: true,
      },
      select: {
        accountNumber: true,
      },
    });
    const realAccountNumbers = realAccounts.map((acc) => acc.accountNumber);

    // Проходим по всем операциям и их позициям
    for (const operation of allOperations) {
      const relevantPositions = projectId
        ? operation.operationPositions.filter(
            (position) => position.projectId === projectId,
          )
        : operation.operationPositions;

      if (relevantPositions.length === 0) {
        continue;
      }

      // Собираем тоталы transfer операций отдельно
      // Проверяем, если counterPartyAccount равен одному из реальных аккаунтов
      const isSelfTransferByAccount =
        operation.counterPartyAccount &&
        realAccountNumbers.includes(operation.counterPartyAccount);

      let isTransferOperation = false;

      if (isSelfTransferByAccount) {
        const transferAmount = relevantPositions.reduce(
          (sum, position) => sum + position.amount,
          0,
        );
        if (transferAmount === 0) {
          continue;
        }

        // Распределяем по typeOfOperation: Debit -> selfTransferOuter, Credit -> selfTransferInner
        if (operation.typeOfOperation === 'Debit') {
          selfTransferOuterTotal += transferAmount;
          selfTransferTotals.debit += transferAmount;
        } else if (operation.typeOfOperation === 'Credit') {
          selfTransferInnerTotal += transferAmount;
          selfTransferTotals.credit += transferAmount;
        }
        // isTransferOperation = true;
      }

      // Пропускаем transfer операции - они не должны попадать в другие тоталы
      if (isTransferOperation) {
        continue;
      }

      // if (
      //   operation.payPurpose.includes('Возврат д/с с депозита "Овернайт"') ||
      //   operation.payPurpose.includes(
      //     'Внутренний перевод на депозит "Овернайт"',
      //   )
      // ) {
      //   continue;
      // }

      for (const position of relevantPositions) {
        // Подсчет по контрагентам с разделением на debit и credit
        if (position.counterPartyId && position.counterParty) {
          const existing = counterPartyTotalsMap.get(position.counterPartyId);
          if (existing) {
            if (operation.typeOfOperation === 'Debit') {
              existing.debit += position.amount;
            } else if (operation.typeOfOperation === 'Credit') {
              existing.credit += position.amount;
            }
          } else {
            const debit =
              operation.typeOfOperation === 'Debit' ? position.amount : 0;
            const credit =
              operation.typeOfOperation === 'Credit' ? position.amount : 0;
            counterPartyTotalsMap.set(position.counterPartyId, {
              title: position.counterParty.title,
              debit,
              credit,
              transfer: 0,
              incomeExpenseCategory: position.counterParty.incomeExpenseCategory
                ? {
                    id: position.counterParty.incomeExpenseCategory.id,
                    name: position.counterParty.incomeExpenseCategory.name,
                  }
                : null,
              outcomeExpenseCategory: position.counterParty
                .outcomeExpenseCategory
                ? {
                    id: position.counterParty.outcomeExpenseCategory.id,
                    name: position.counterParty.outcomeExpenseCategory.name,
                  }
                : null,
            });
          }
        }

        // Подсчет по категориям с разделением на debit и credit
        if (position.expenseCategoryId && position.expenseCategory) {
          const existing = expenseCategoryTotalsMap.get(
            position.expenseCategoryId,
          );
          if (existing) {
            if (operation.typeOfOperation === 'Debit') {
              existing.debit += position.amount;
            } else if (operation.typeOfOperation === 'Credit') {
              existing.credit += position.amount;
            }
          } else {
            const debit =
              operation.typeOfOperation === 'Debit' ? position.amount : 0;
            const credit =
              operation.typeOfOperation === 'Credit' ? position.amount : 0;
            expenseCategoryTotalsMap.set(position.expenseCategoryId, {
              title: position.expenseCategory.name,
              debit,
              credit,
              transfer: 0,
            });
          }
        } else {
          // Позиции без категории идут в "Нераспределенные"
          if (operation.typeOfOperation === 'Debit') {
            unallocatedTotal.debit += position.amount;
          } else if (operation.typeOfOperation === 'Credit') {
            unallocatedTotal.credit += position.amount;
          }
        }
      }
    }

    // Преобразуем Map в массивы, округляем значения до сотых и сортируем по значению от большего к меньшему
    const counterPartyTotals = Array.from(counterPartyTotalsMap.entries())
      .map(([counterPartyId, item]) => ({
        counterPartyId,
        title: item.title,
        debit: Number.parseFloat(item.debit.toFixed(2)),
        credit: Number.parseFloat(item.credit.toFixed(2)),
        transfer: Number.parseFloat(item.transfer.toFixed(2)),
        ...(item.incomeExpenseCategory && {
          incomeExpenseCategory: item.incomeExpenseCategory,
        }),
        ...(item.outcomeExpenseCategory && {
          outcomeExpenseCategory: item.outcomeExpenseCategory,
        }),
      }))
      .sort((a, b) => {
        // Сортируем по сумме debit + credit от большего к меньшему
        const totalA = a.debit + a.credit;
        const totalB = b.debit + b.credit;
        return totalB - totalA;
      });
    const expenseCategoryTotals: Array<{
      expenseCategoryId: number | null;
      title: string;
      debit: number;
      credit: number;
      transfer: number;
    }> = Array.from(expenseCategoryTotalsMap.entries())
      .map(([expenseCategoryId, item]) => ({
        expenseCategoryId,
        title: item.title,
        debit: Number.parseFloat(item.debit.toFixed(2)),
        credit: Number.parseFloat(item.credit.toFixed(2)),
        transfer: Number.parseFloat(item.transfer.toFixed(2)),
      }))
      .sort((a, b) => {
        // Сортируем по сумме debit + credit от большего к меньшему
        const totalA = a.debit + a.credit;
        const totalB = b.debit + b.credit;
        return totalB - totalA;
      });

    // Добавляем "Нераспределенные" в конец массива, если есть суммы
    if (
      unallocatedTotal.debit !== 0 ||
      unallocatedTotal.credit !== 0 ||
      unallocatedTotal.transfer !== 0
    ) {
      expenseCategoryTotals.push({
        expenseCategoryId: null,
        title: unallocatedTotal.title,
        debit: Number.parseFloat(unallocatedTotal.debit.toFixed(2)),
        credit: Number.parseFloat(unallocatedTotal.credit.toFixed(2)),
        transfer: Number.parseFloat(unallocatedTotal.transfer.toFixed(2)),
      });
    }
    // if (
    //   selfTransferTotals.debit !== 0 ||
    //   selfTransferTotals.credit !== 0 ||
    //   selfTransferTotals.transfer !== 0
    // ) {
    //   expenseCategoryTotals.push({
    //     expenseCategoryId: null,
    //     title: selfTransferTotals.title,
    //     debit: Number.parseFloat(selfTransferTotals.debit.toFixed(2)),
    //     credit: Number.parseFloat(selfTransferTotals.credit.toFixed(2)),
    //     transfer: Number.parseFloat(selfTransferTotals.transfer.toFixed(2)),
    //   });
    // }

    // Вычисляем mainTotals из expenseCategoryTotals, исключая перемещения
    const mainTotals = expenseCategoryTotals.reduce(
      (acc, category) => {
        // Пропускаем категорию "Перемещения" при подсчете основных итогов
        if (category.title !== 'Перемещения(не учитываются)') {
          acc.debit += category.debit;
          acc.credit += category.credit;
        }
        return acc;
      },
      { debit: 0, credit: 0 },
    );

    // Вычисляем чистую прибыль и рентабельность
    const netProfit = mainTotals.credit - mainTotals.debit;
    const profitability =
      mainTotals.credit !== 0 ? (netProfit / mainTotals.credit) * 100 : 0;

    return {
      counterPartyTotals,
      expenseCategoryTotals,
      transfersTotals: {
        selfTransferInner: Number.parseFloat(selfTransferInnerTotal.toFixed(2)),
        selfTransferOuter: Number.parseFloat(selfTransferOuterTotal.toFixed(2)),
      },
      mainTotals: {
        debit: Number.parseFloat(mainTotals.debit.toFixed(2)),
        credit: Number.parseFloat(mainTotals.credit.toFixed(2)),
        transfer: Number.parseFloat(selfTransferTotals.transfer.toFixed(2)),
        netProfit: Number.parseFloat(netProfit.toFixed(2)),
        profitability: Number.parseFloat(profitability.toFixed(2)),
        dividends: Number.parseFloat(
          (
            expenseCategoryTotals.find((cat) => cat.title === 'Дивиденды')
              ?.debit || 0
          ).toFixed(2),
        ),
      },
    };
  }

  async updateOriginalOperationPositions(
    operationId: string,
    positionsData: Array<{
      id?: number;
      counterPartyId?: number;
      expenseCategoryId?: number;
      projectId?: number | null;
      amount: number;
      period?: string;
    }>,
  ) {
    // Находим оригинальную операцию
    const originalOperation = await (
      this.prisma as unknown as ExtendedPrismaClient
    ).originalOperationFromTbank.findUnique({
      where: { operationId },
      include: {
        operationPositions: true,
      },
    });

    if (!originalOperation) {
      throw new BadRequestException('Оригинальная операция не найдена');
    }

    // Проверяем, что сумма всех позиций равна accountAmount операции
    const totalAmount = positionsData.reduce((sum, pos) => sum + pos.amount, 0);
    if (totalAmount !== originalOperation.accountAmount) {
      throw new BadRequestException(
        `Сумма всех позиций (${totalAmount}) должна быть равна сумме операции (${originalOperation.accountAmount})`,
      );
    }

    const projectIds = Array.from(
      new Set(
        positionsData
          .map((pos) => pos.projectId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    if (projectIds.length > 0) {
      const existingProjects = await this.prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true },
      });
      const existingProjectIds = new Set(
        existingProjects.map((project) => project.id),
      );
      const missing = projectIds.filter((id) => !existingProjectIds.has(id));
      if (missing.length > 0) {
        throw new NotFoundException(
          `Проекты не найдены: ${missing.join(', ')}`,
        );
      }
    }

    // Удаляем все существующие позиции
    await this.prisma.operationPosition.deleteMany({
      where: {
        originalOperationId: originalOperation.id,
      },
    });

    // Создаем новые позиции
    const fallbackPeriod = originalOperation.operationDate?.slice(0, 7);
    const createdPositions = await Promise.all(
      positionsData.map((positionData) =>
        this.prisma.operationPosition.create({
          data: {
            amount: positionData.amount,
            period: positionData.period || fallbackPeriod,
            originalOperationId: originalOperation.id,
            counterPartyId: positionData.counterPartyId,
            expenseCategoryId: positionData.expenseCategoryId,
            projectId: positionData.projectId ?? null,
          },
          include: {
            counterParty: true,
            expenseCategory: true,
            project: true,
          },
        }),
      ),
    );

    return {
      success: true,
      operationPositions: createdPositions,
    };
  }

  async removeExpenseCategoryFromPosition(positionId: number) {
    // Проверяем существование позиции
    const position = await this.prisma.operationPosition.findUnique({
      where: { id: positionId },
      include: {
        counterParty: true,
        expenseCategory: true,
      },
    });

    if (!position) {
      throw new NotFoundException(`Позиция с ID ${positionId} не найдена`);
    }

    // Удаляем expenseCategoryId
    const updatedPosition = await this.prisma.operationPosition.update({
      where: { id: positionId },
      data: {
        expenseCategoryId: null,
      },
      include: {
        counterParty: true,
        expenseCategory: true,
      },
    });

    return {
      success: true,
      operationPosition: updatedPosition,
    };
  }

  async updateProjectForPosition(positionId: number, projectId: number | null) {
    const position = await this.prisma.operationPosition.findUnique({
      where: { id: positionId },
    });

    if (!position) {
      throw new NotFoundException(`Позиция с ID ${positionId} не найдена`);
    }

    if (projectId !== null) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException(`Проект с ID ${projectId} не найден`);
      }
    }

    return this.prisma.operationPosition.update({
      where: { id: positionId },
      data: { projectId },
      include: { project: true },
    });
  }

  async getProjects() {
    return this.prisma.project.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async assignExpenseCategoriesToCounterParty(
    counterPartyId: number,
    categoriesData: {
      incomeExpenseCategoryId?: number | null;
      outcomeExpenseCategoryId?: number | null;
    },
  ) {
    // Проверяем существование контрагента
    const counterParty = await this.prisma.counterParty.findUnique({
      where: { id: counterPartyId },
      include: {
        incomeExpenseCategory: true,
        outcomeExpenseCategory: true,
      },
    });

    if (!counterParty) {
      throw new NotFoundException(
        `Контрагент с ID ${counterPartyId} не найден`,
      );
    }

    // Проверяем существование категорий если они указаны
    if (categoriesData.incomeExpenseCategoryId != null) {
      const incomeCategory = await this.prisma.expenseCategory.findUnique({
        where: { id: categoriesData.incomeExpenseCategoryId },
      });
      if (!incomeCategory) {
        throw new NotFoundException(
          `Категория расходов с ID ${categoriesData.incomeExpenseCategoryId} не найдена`,
        );
      }
    }

    if (categoriesData.outcomeExpenseCategoryId != null) {
      const outcomeCategory = await this.prisma.expenseCategory.findUnique({
        where: { id: categoriesData.outcomeExpenseCategoryId },
      });
      if (!outcomeCategory) {
        throw new NotFoundException(
          `Категория расходов с ID ${categoriesData.outcomeExpenseCategoryId} не найдена`,
        );
      }
    }

    // Обновляем контрагента с новыми категориями
    const updatedCounterParty = await this.prisma.counterParty.update({
      where: { id: counterPartyId },
      data: {
        incomeExpenseCategoryId: categoriesData.incomeExpenseCategoryId,
        outcomeExpenseCategoryId: categoriesData.outcomeExpenseCategoryId,
      },
      include: {
        incomeExpenseCategory: true,
        outcomeExpenseCategory: true,
      },
    });

    // Находим все операции этого контрагента
    const positions = await this.prisma.operationPosition.findMany({
      where: {
        counterPartyId: counterPartyId,
      },
      include: {
        originalOperation: true,
      },
    });

    console.log(`=== ОБНОВЛЕНИЕ КОНТРАГЕНТА ${counterPartyId} ===`);
    console.log(`Входные данные:`, {
      incomeExpenseCategoryId: categoriesData.incomeExpenseCategoryId,
      outcomeExpenseCategoryId: categoriesData.outcomeExpenseCategoryId,
    });
    console.log(`Найдено позиций: ${positions.length}`);

    // Группируем позиции по типам операций для статистики
    const creditPositions = positions.filter(
      (p) => p.originalOperation?.typeOfOperation === 'Credit',
    );
    const debitPositions = positions.filter(
      (p) => p.originalOperation?.typeOfOperation === 'Debit',
    );
    const unknownPositions = positions.filter(
      (p) =>
        !['Credit', 'Debit'].includes(
          p.originalOperation?.typeOfOperation || '',
        ),
    );

    console.log(`Статистика позиций:`, {
      Credit: creditPositions.length,
      Debit: debitPositions.length,
      Unknown: unknownPositions.length,
    });

    let updatedPositionsCount = 0;

    // Обновляем позиции операций в зависимости от типа операции
    for (const position of positions) {
      let newExpenseCategoryId: number | null = null;

      if (position.originalOperation?.typeOfOperation === 'Credit') {
        // Входящая операция - используем входящую категорию (или null если не передана)
        newExpenseCategoryId = categoriesData.incomeExpenseCategoryId || null;
      } else if (position.originalOperation?.typeOfOperation === 'Debit') {
        // Исходящая операция - используем исходящую категорию (или null если не передана)
        newExpenseCategoryId = categoriesData.outcomeExpenseCategoryId || null;
      }

      // Обновляем позицию всегда (даже если категория null)
      await this.prisma.operationPosition.update({
        where: { id: position.id },
        data: { expenseCategoryId: newExpenseCategoryId },
      });
      updatedPositionsCount++;
    }

    console.log(`Результат обновления:`, {
      totalUpdated: updatedPositionsCount,
      creditUpdated: creditPositions.length,
      debitUpdated: debitPositions.length,
      unknownUpdated: unknownPositions.length,
    });
    console.log(`=== КОНЕЦ ОБНОВЛЕНИЯ КОНТРАГЕНТА ${counterPartyId} ===`);

    return {
      success: true,
      counterParty: updatedCounterParty,
      updatedPositionsCount,
      message: `Обновлено ${updatedPositionsCount} позиций операций для контрагента "${counterParty.title}"`,
    };
  }

  async assignExpenseCategoriesToCounterPartyByAccount(
    counterPartyAccount: string,
    categoriesData: {
      incomeExpenseCategoryId?: number | null;
      outcomeExpenseCategoryId?: number | null;
    },
  ) {
    // Находим контрагента по номеру счета
    const counterParty = await this.prisma.counterParty.findFirst({
      where: {
        account: counterPartyAccount,
      },
      include: {
        incomeExpenseCategory: true,
        outcomeExpenseCategory: true,
      },
    });

    if (!counterParty) {
      throw new NotFoundException(
        `Контрагент с номером счета "${counterPartyAccount}" не найден`,
      );
    }

    console.log(
      `=== ОБНОВЛЕНИЕ КОНТРАГЕНТА ПО СЧЕТУ ${counterPartyAccount} ===`,
    );
    console.log(
      `Найден контрагент: ID=${counterParty.id}, Title="${counterParty.title}"`,
    );

    // Используем существующий метод с найденным ID
    return this.assignExpenseCategoriesToCounterParty(
      counterParty.id,
      categoriesData,
    );
  }

  async assignProjectsToCounterParty(
    counterPartyId: number,
    projectsData: {
      incomeProjectId?: number | null;
      outcomeProjectId?: number | null;
    },
  ) {
    const counterParty = await this.prisma.counterParty.findUnique({
      where: { id: counterPartyId },
      include: {
        incomeProject: true,
        outcomeProject: true,
      },
    });

    if (!counterParty) {
      throw new NotFoundException(
        `Контрагент с ID ${counterPartyId} не найден`,
      );
    }

    if (projectsData.incomeProjectId != null) {
      const incomeProject = await this.prisma.project.findUnique({
        where: { id: projectsData.incomeProjectId },
      });
      if (!incomeProject) {
        throw new NotFoundException(
          `Проект с ID ${projectsData.incomeProjectId} не найден`,
        );
      }
    }

    if (projectsData.outcomeProjectId != null) {
      const outcomeProject = await this.prisma.project.findUnique({
        where: { id: projectsData.outcomeProjectId },
      });
      if (!outcomeProject) {
        throw new NotFoundException(
          `Проект с ID ${projectsData.outcomeProjectId} не найден`,
        );
      }
    }

    const updateData: {
      incomeProjectId?: number | null;
      outcomeProjectId?: number | null;
    } = {};
    if (projectsData.incomeProjectId !== undefined) {
      updateData.incomeProjectId = projectsData.incomeProjectId;
    }
    if (projectsData.outcomeProjectId !== undefined) {
      updateData.outcomeProjectId = projectsData.outcomeProjectId;
    }

    const updatedCounterParty = await this.prisma.counterParty.update({
      where: { id: counterPartyId },
      data: updateData,
      include: {
        incomeProject: true,
        outcomeProject: true,
      },
    });

    const positions = await this.prisma.operationPosition.findMany({
      where: {
        counterPartyId: counterPartyId,
      },
      include: {
        originalOperation: true,
        operation: true,
      },
    });

    let updatedPositionsCount = 0;

    for (const position of positions) {
      const typeOfOperation =
        position.originalOperation?.typeOfOperation ||
        position.operation?.typeOfOperation;

      let newProjectId: number | null | undefined;
      if (
        typeOfOperation === 'Credit' &&
        projectsData.incomeProjectId !== undefined
      ) {
        newProjectId = projectsData.incomeProjectId;
      } else if (
        typeOfOperation === 'Debit' &&
        projectsData.outcomeProjectId !== undefined
      ) {
        newProjectId = projectsData.outcomeProjectId;
      }

      if (newProjectId === undefined) {
        continue;
      }

      await this.prisma.operationPosition.update({
        where: { id: position.id },
        data: { projectId: newProjectId },
      });
      updatedPositionsCount++;
    }

    return {
      success: true,
      counterParty: updatedCounterParty,
      updatedPositionsCount,
      message: `Обновлено ${updatedPositionsCount} позиций операций для контрагента "${counterParty.title}"`,
    };
  }

  async assignProjectsToCounterPartyByAccount(
    counterPartyAccount: string,
    projectsData: {
      incomeProjectId?: number | null;
      outcomeProjectId?: number | null;
    },
  ) {
    const counterParty = await this.prisma.counterParty.findFirst({
      where: {
        account: counterPartyAccount,
      },
      include: {
        incomeProject: true,
        outcomeProject: true,
      },
    });

    if (!counterParty) {
      throw new NotFoundException(
        `Контрагент с номером счета "${counterPartyAccount}" не найден`,
      );
    }

    return this.assignProjectsToCounterParty(counterParty.id, projectsData);
  }

  // Методы для синхронизации операций Т-Банка с категориями
  async getOrCreateCounterPartyWithCategories(counterPartyData: {
    account: string;
    inn: string;
    kpp: string;
    name: string;
    bankName: string;
    bankBic: string;
  }) {
    const existingCounterParty = await this.prisma.counterParty.findFirst({
      where: { account: counterPartyData.account },
      include: {
        incomeExpenseCategory: true,
        outcomeExpenseCategory: true,
        incomeProject: true,
        outcomeProject: true,
      },
    });

    if (existingCounterParty) {
      return existingCounterParty;
    }

    const counterParty = await this.prisma.counterParty.create({
      data: {
        title: counterPartyData.name || 'Неизвестный контрагент',
        type: 'Получатель',
        inn: counterPartyData.inn || '',
        kpp: counterPartyData.kpp || '',
        account: counterPartyData.account || '',
        bankBic: counterPartyData.bankBic || '',
        bankName: counterPartyData.bankName || '',
        contrAgentGroup: 'Контрагенты без группы',
      },
      include: {
        incomeExpenseCategory: true,
        outcomeExpenseCategory: true,
        incomeProject: true,
        outcomeProject: true,
      },
    });

    return counterParty;
  }

  async fetchOperationsFromTbankWithCategories(
    accountNumber: string,
    from: string,
    to: string,
    limit: number = 1000,
    categories?: string[],
    inns?: string[],
  ) {
    const allOperations: OperationFromApi[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    try {
      while (hasMore) {
        const params: Record<string, string | number | boolean | string[]> = {
          accountNumber,
          operationStatus: 'Transaction',
          from: new Date(from).toISOString(),
          to: new Date(to + 'T23:59:59.999Z').toISOString(),
          withBalances: cursor ? false : true,
          limit: Math.min(limit, 5000),
        };

        if (categories && categories.length > 0) {
          params.categories = categories;
        }
        if (inns && inns.length > 0) {
          params.inns = inns;
        }

        if (cursor) {
          params.cursor = cursor;
        }

        const response = await axios.get(
          'https://business.tbank.ru/openapi/api/v1/statement',
          {
            proxy: false,
            headers: {
              Authorization: 'Bearer ' + tToken,
              'Content-Type': 'application/json',
            },
            params,
            maxBodyLength: Infinity,
          },
        );

        const operations = response.data.operations || [];
        allOperations.push(...operations);

        cursor = response.data.nextCursor;
        hasMore = !!cursor && operations.length > 0;

        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        console.log(
          `Получено ${operations.length} операций, всего: ${allOperations.length}`,
        );
      }

      return allOperations;
    } catch (error) {
      console.error(
        `Ошибка при получении операций для счета ${accountNumber}:`,
        error,
      );
      throw error;
    }
  }

  async fetchStatementBalancesByPeriod(period: string) {
    if (!tToken) {
      throw new Error('TB_TOKEN не установлен в переменных окружения');
    }

    const [year, month] = period.split('-').map(Number);
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new BadRequestException(
        'Период должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }

    const fromDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const toDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const accounts = [
      { name: 'ИзиНеон(7213)', accountNumber: '40802810800000977213' },
      { name: 'ИзиБук(0999)', accountNumber: '40802810900002610999' },
    ];

    const results = await Promise.all(
      accounts.map(async (account) => {
        const response = await axios.get(
          'https://business.tbank.ru/openapi/api/v1/statement',
          {
            proxy: false,
            // httpAgent: tbankProxyAgent,
            // httpsAgent: tbankProxyAgent,
            headers: {
              Authorization: 'Bearer ' + tToken,
              'Content-Type': 'application/json',
            },
            params: {
              accountNumber: account.accountNumber,
              operationStatus: 'Transaction',
              from: fromDate.toISOString(),
              to: toDate.toISOString(),
              withBalances: true,
              limit: 1,
            },
            maxBodyLength: Infinity,
          },
        );

        console.log('T-Bank statement balances:', {
          account: account.name,
          accountNumber: account.accountNumber,
          period,
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          response: response.data,
        });

        return {
          account: account.name,
          accountNumber: account.accountNumber,
          data: response.data,
        };
      }),
    );

    return {
      period,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      results,
    };
  }

  async saveOriginalOperationsWithCategories(
    operations: OperationFromApi[],
    accountId: number,
  ) {
    let savedCount = 0;
    let lastOperationDate = '';

    for (const op of operations) {
      try {
        // Создаем или находим контрагента с категориями
        const counterParty = await this.getOrCreateCounterPartyWithCategories({
          account: op.counterParty.account || '',
          inn: op.counterParty.inn || '',
          kpp: op.counterParty.kpp || '',
          name: op.counterParty.name || '',
          bankName: op.counterParty.bankName || '',
          bankBic: op.counterParty.bankBic || '',
        });

        // Всегда делаем upsert для операции
        const originalOperation = await (
          this.prisma as unknown as ExtendedPrismaClient
        ).originalOperationFromTbank.upsert({
          where: { operationId: op.operationId },
          update: {
            operationDate: op.operationDate,
            typeOfOperation: op.typeOfOperation || 'Unknown',
            category: op.category || '',
            description: op.description || '',
            payPurpose: op.payPurpose || '',
            accountAmount: op.accountAmount,
            counterPartyAccount: op.counterParty.account || '',
            counterPartyInn: op.counterParty.inn || '',
            counterPartyKpp: op.counterParty.kpp || '',
            counterPartyBic: op.counterParty.bankBic || '',
            counterPartyBankName: op.counterParty.bankName || '',
            counterPartyTitle: op.counterParty.name || '',
            expenseCategoryId: op.expenseCategoryId,
            expenseCategoryName: op.expenseCategoryName,
            accountId: accountId,
          },
          create: {
            operationId: op.operationId,
            operationDate: op.operationDate,
            typeOfOperation: op.typeOfOperation || 'Unknown',
            category: op.category || '',
            description: op.description || '',
            payPurpose: op.payPurpose || '',
            accountAmount: op.accountAmount,
            counterPartyAccount: op.counterParty.account || '',
            counterPartyInn: op.counterParty.inn || '',
            counterPartyKpp: op.counterParty.kpp || '',
            counterPartyBic: op.counterParty.bankBic || '',
            counterPartyBankName: op.counterParty.bankName || '',
            counterPartyTitle: op.counterParty.name || '',
            expenseCategoryId: op.expenseCategoryId,
            expenseCategoryName: op.expenseCategoryName,
            accountId: accountId,
          },
        });

        // Проверяем, есть ли уже позиции у операции
        const existingPositions = await this.prisma.operationPosition.findMany({
          where: {
            originalOperationId: originalOperation.id,
          },
        });

        if (existingPositions.length > 0) {
          console.log(
            `Операция ${op.operationId} уже имеет позиции, пропускаем создание позиций`,
          );
          savedCount++;
          continue;
        }

        // Определяем категорию на основе типа операции и контрагента
        let expenseCategoryId: number | null = null;
        let projectId: number | null = null;

        if (
          op.typeOfOperation === 'Credit' &&
          counterParty.incomeExpenseCategory
        ) {
          // Входящая операция - используем входящую категорию контрагента
          expenseCategoryId = counterParty.incomeExpenseCategory.id;
          console.log(
            `Операция ${op.operationId}: присвоена входящая категория "${counterParty.incomeExpenseCategory.name}" для контрагента "${counterParty.title}"`,
          );
        } else if (
          op.typeOfOperation === 'Debit' &&
          counterParty.outcomeExpenseCategory
        ) {
          // Исходящая операция - используем исходящую категорию контрагента
          expenseCategoryId = counterParty.outcomeExpenseCategory.id;
          console.log(
            `Операция ${op.operationId}: присвоена исходящая категория "${counterParty.outcomeExpenseCategory.name}" для контрагента "${counterParty.title}"`,
          );
        } else {
          console.log(
            `Операция ${op.operationId}: у контрагента "${counterParty.title}" нет соответствующей категории для типа операции "${op.typeOfOperation}"`,
          );
        }

        if (op.typeOfOperation === 'Credit' && counterParty.incomeProject) {
          projectId = counterParty.incomeProject.id;
        } else if (
          op.typeOfOperation === 'Debit' &&
          counterParty.outcomeProject
        ) {
          projectId = counterParty.outcomeProject.id;
        }

        // Создаем позицию (только если её еще нет)
        await this.prisma.operationPosition.create({
          data: {
            amount: op.accountAmount,
            period: op.operationDate?.slice(0, 7),
            originalOperationId: originalOperation.id,
            counterPartyId: counterParty.id,
            expenseCategoryId: expenseCategoryId,
            projectId: projectId,
          },
        });

        savedCount++;
        // Обновляем дату последней операции (сортируем по дате)
        if (op.operationDate > lastOperationDate) {
          lastOperationDate = op.operationDate;
        }
      } catch (error) {
        console.error(
          `Ошибка при сохранении операции ${op.operationId}:`,
          error,
        );
      }
    }

    // Обновляем статус синхронизации
    await this.updateSyncStatus(
      accountId,
      lastOperationDate,
      savedCount,
      'success',
    );

    return { savedCount, lastOperationDate };
  }

  async updateSyncStatus(
    accountId: number,
    lastOperationDate: string,
    totalOperations: number,
    status: 'success' | 'error' | 'in_progress',
    errorMessage?: string,
  ) {
    try {
      await (
        this.prisma as unknown as ExtendedPrismaClient
      ).tbankSyncStatus.upsert({
        where: { accountId },
        update: {
          lastSyncDate: new Date(),
          lastOperationDate: lastOperationDate.slice(0, 10), // YYYY-MM-DD
          totalOperations: {
            increment: totalOperations,
          },
          syncStatus: status,
          errorMessage: errorMessage || null,
        },
        create: {
          accountId,
          lastSyncDate: new Date(),
          lastOperationDate: lastOperationDate.slice(0, 10), // YYYY-MM-DD
          totalOperations,
          syncStatus: status,
          errorMessage: errorMessage || null,
        },
      });
    } catch (error) {
      console.error(
        `Ошибка при обновлении статуса синхронизации для аккаунта ${accountId}:`,
        error,
      );
    }
  }

  async syncTbankOperations(from?: string, to?: string) {
    console.log('Starting T-Bank operations sync with categories...');

    try {
      // Параметры по умолчанию - сегодняшний день
      const today = new Date();
      const fromDate = from || today.toISOString().split('T')[0];
      const toDate = to || today.toISOString().split('T')[0];

      console.log(`Синхронизация операций с ${fromDate} по ${toDate}`);

      if (!tToken) {
        throw new Error('TB_TOKEN не установлен в переменных окружения');
      }

      // Получаем все аккаунты с доступом к API
      const accounts = await this.prisma.planFactAccount.findMany({
        where: {
          isReal: true,
        },
      });

      console.log(`Найдено ${accounts.length} аккаунтов с API доступом`);

      let totalSaved = 0;
      for (const account of accounts) {
        console.log(
          `Обрабатываем аккаунт: ${account.name} (${account.accountNumber})`,
        );

        try {
          // Устанавливаем статус "в процессе"
          await this.updateSyncStatus(account.id, '', 0, 'in_progress');

          const operations = await this.fetchOperationsFromTbankWithCategories(
            account.accountNumber,
            fromDate,
            toDate,
            1000,
          );

          console.log(
            `Получено ${operations.length} операций для аккаунта ${account.name}`,
          );

          if (operations.length > 0) {
            const result = await this.saveOriginalOperationsWithCategories(
              operations,
              account.id,
            );
            console.log(
              `Сохранено ${result.savedCount} операций для аккаунта ${account.name}. Последняя операция: ${result.lastOperationDate}`,
            );
            totalSaved += result.savedCount;
          } else {
            // Обновляем статус даже если операций нет
            await this.updateSyncStatus(account.id, '', 0, 'success');
            console.log(`Операций не найдено для аккаунта ${account.name}`);
          }
        } catch (error) {
          console.error(
            `Ошибка при обработке аккаунта ${account.name}:`,
            error,
          );
          // Устанавливаем статус ошибки
          await this.updateSyncStatus(
            account.id,
            '',
            0,
            'error',
            error instanceof Error ? error.message : 'Неизвестная ошибка',
          );
        }
      }

      console.log(
        `Синхронизация завершена. Всего сохранено: ${totalSaved} операций`,
      );
      return {
        success: true,
        totalSaved,
        message: `Синхронизация завершена. Сохранено: ${totalSaved} операций`,
      };
    } catch (error) {
      console.error('Ошибка выполнения синхронизации:', error);
      throw error;
    }
  }
}
