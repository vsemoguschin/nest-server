import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlanFactAccountCreateDto } from './dto/planfact-account-create.dto';
import { DashboardsService } from '../dashboards/dashboards.service';
import { UserDto } from '../users/dto/user.dto';
import { CreateOperationDto } from './dto/create-operation.dto';
import { UpdateOperationDto } from './dto/update-operation.dto';
import { CreateExpenseCategoryDto } from './dto/expense-category-create.dto';
import { CreateCounterPartyDto } from './dto/counterparty-create.dto';
import { subMonths, format } from 'date-fns';

function getLastMonths(dateStr: string, m: number): string[] {
  // Парсим входную строку в объект Date (предполагаем формат YYYY-MM)
  const [year, month] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1); // Месяцы в JS начинаются с 0

  // Создаем массив для хранения результатов
  const result: string[] = [];

  // Добавляем даты за последние 6 месяцев
  for (let i = 0; i < m; i++) {
    const pastDate = subMonths(date, i); // Вычитаем i месяцев
    const formattedDate = format(pastDate, 'yyyy-MM'); // Форматируем в YYYY-MM
    result.push(formattedDate);
  }

  // return result.sort((a, b) => a.localeCompare(b));
  return result.sort((a, b) => a.localeCompare(b));
}

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

export interface OperationPositionType {
  id: number;
  counterPartyId: number | null;
  expenseCategoryId: number | null;
  amount: number;
  counterParty?: CounterPartyType;
  expenseCategory?: ExpenseCategoryType;
}

export interface OriginalOperationType {
  id: number;
  operationId: string;
  operationDate: string;
  accountAmount: number;
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
        await prisma.operationPosition.createMany({
          data: dto.operationPositions.map((pos) => ({
            amount: pos.amount,
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
                counterPartyId: position.counterPartyId || null,
                expenseCategoryId: position.expenseCategoryId || null,
              },
            });
          } else {
            // Создаем новую позицию
            await prisma.operationPosition.create({
              data: {
                amount: position.amount,
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

  async getOperationsFromRange(
    range: { from: string; to: string },
    limit: number,
    accountId: number,
  ) {
    try {
      const account = await this.prisma.planFactAccount.findUnique({
        where: {
          id: accountId,
        },
      });

      // если у аккаунта есть апи
      if (account && account.isReal) {
        // console.log('acc');
        const fetchOperationsForAccount = async (accountNumber: string) => {
          // const agent = new SocksProxyAgent('socks5h://localhost:8080');

          try {
            const response = await axios.get(
              'https://business.tbank.ru/openapi/api/v1/statement',
              {
                // httpsAgent: agent, // Используем SOCKS-прокси
                proxy: false, // Отключаем системный прокси
                headers: {
                  Authorization: 'Bearer ' + tToken,
                  'Content-Type': 'application/json',
                },
                params: {
                  accountNumber,
                  operationStatus: 'Transaction',
                  from: new Date(range.from),
                  to: range.to + 'T23:59:59.999Z',
                  withBalances: true,
                  limit: limit,
                },
                maxBodyLength: Infinity,
              },
            );
            // console.log(response);

            await Promise.all(
              response.data.operations.map(async (op: OperationFromApi) => {
                // Проверяем и создаем CounterParty, если не существует
                // console.log(op);
                const counterParty = await this.getOrCreateCounterParty(
                  op.counterParty,
                );

                console.log(op.counterParty);

                let operationType = op.category;
                // console.log(op);
                if (op.category === 'selfTransferInner') {
                  operationType = 'Перемещение';
                }
                if (
                  ['incomePeople', 'income', 'creditPaymentInner'].includes(
                    op.category,
                  )
                ) {
                  operationType = 'Поступление';
                }
                if (
                  [
                    'salary', //выплаты
                    'fee', //услуги банка
                    'selfTransferOuter', //перевод между своими счетами в T‑Бизнесе
                    'cardOperation', //оплата картой
                    'contragentPeople', //исходящие платежи
                    'contragentOutcome', //перевод контрагенту
                    'creditPaymentOuter', //погашение кредита
                    'tax', //налоговые платежи.
                  ].includes(op.category)
                ) {
                  operationType = 'Выплата';
                }

                // Создаем операцию в базе, если не существует

                const operation = await this.prisma.operation.upsert({
                  where: { operationId: op.operationId },
                  update: {},
                  create: {
                    operationId: op.operationId,
                    operationDate: op.operationDate.slice(0, 10),
                    operationDateTime: op.operationDate,
                    typeOfOperation: op.typeOfOperation || 'Unknown',
                    operationType,
                    category: op.category || '',
                    description: op.description || '',
                    payPurpose: op.payPurpose || '',
                    // accountAmount: op.accountAmount,
                    accountId: account.id,
                    // counterPartyId: counterParty.id,
                  },
                  include: {
                    operationPositions: {
                      include: { counterParty: true },
                    },
                  },
                });

                if (!operation.operationPositions.length) {
                  await this.prisma.operationPosition.create({
                    data: {
                      operationId: operation.id,
                      amount: op.accountAmount,
                      counterPartyId: counterParty.id,
                    },
                  });
                }

                if (
                  operation.operationType === 'Поступление' &&
                  operation.payPurpose.startsWith('Пополнение по операции СБП')
                ) {
                  const { operationPositions } = operation;
                  const operationPositionsIds = operationPositions.map(
                    (p) => p.id,
                  );
                  await this.prisma.operationPosition.updateMany({
                    where: {
                      id: {
                        in: operationPositionsIds,
                      },
                    },
                    data: {
                      expenseCategoryId: 2, //Продажа через СБП
                    },
                  });
                }

                if (
                  operation.operationType === 'Поступление' &&
                  operation.operationPositions.find(
                    (p) => p.counterPartyId === 495,
                  )
                ) {
                  const { operationPositions } = operation;
                  const operationPositionsIds = operationPositions.map(
                    (p) => p.id,
                  );
                  await this.prisma.operationPosition.updateMany({
                    where: {
                      id: {
                        in: operationPositionsIds,
                      },
                    },
                    data: {
                      expenseCategoryId: 3, //Продажа "Долями"
                    },
                  });
                }

                if (
                  operation.operationType === 'Поступление' &&
                  operation.operationPositions.find(
                    (p) => p.counterPartyId === 526,
                  )
                ) {
                  const { operationPositions } = operation;
                  const operationPositionsIds = operationPositions.map(
                    (p) => p.id,
                  );
                  await this.prisma.operationPosition.updateMany({
                    where: {
                      id: {
                        in: operationPositionsIds,
                      },
                    },
                    data: {
                      expenseCategoryId: 10, //наложка от сдека
                    },
                  });
                }

                // console.log(operation);
                return operation;
              }),
            );
            // console.log(operations);
            return await this.prisma.operation.findMany({
              where: {
                operationDate: {
                  gte: range.from,
                  lte: range.to,
                },
                accountId: account.id,
                deletedAt: null,
              },
              include: {
                // counterParty: true,
                // expenseCategory: true,
                operationPositions: {
                  include: {
                    counterParty: true,
                    expenseCategory: true,
                  },
                },
                account: true,
              },
            });
          } catch (error) {
            // console.log(error);
            throw new Error(`API request failed: ${error.message}`);
          }
        };

        // Множество для уникальных контрагентов
        const contragentsSet = new Set<string>();

        // console.log(account);
        const allOperations = await fetchOperationsForAccount(
          account.accountNumber,
        );

        // Сортируем операции по operationDate (в порядке возрастания)
        allOperations.sort(
          (a, b) =>
            new Date(a.operationDate).getTime() -
            new Date(b.operationDate).getTime(),
        );

        return {
          operations: allOperations,
          contragents: Array.from(contragentsSet), // Уникальные контрагенты
        };
      } else if (account) {
        // console.log('db');
        const operations = await this.prisma.operation.findMany({
          where: {
            accountId: account.id,
            operationDate: {
              gte: range.from,
              lte: range.to,
            },
            deletedAt: null,
          },
        });
        return {
          operations,
          contragents: [],
        };
      }
      // Функция для получения операций по одному счету
    } catch (error) {
      console.error('Ошибка при выполнении запроса:', error);

      if (axios.isAxiosError(error)) {
        console.error('Axios Error Response:', error.response?.data);
        throw new NotFoundException(
          `Ошибка API: ${error.response?.data?.errorMessage}`,
        );
      } else {
        throw new NotFoundException('Неизвестная ошибка');
      }
    }
  }

  async getCategories() {
    return await this.prisma.expenseCategory.findMany({
      where: {
        parentId: null,
      },
      include: {
        children: {
          include: {
            children: {
              include: {
                children: {
                  include: {
                    children: true,
                  },
                },
              },
            },
          },
        },
      },
    });
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

  async getCounterParties() {
    return this.prisma.counterParty.findMany();
  }

  async getCounterPartiesFilters({
    from,
    to,
    accountId,
  }: {
    from: string;
    to: string;
    accountId: number;
  }) {
    // Получаем все операции по датам и accountId
    const operations = await this.prisma.originalOperationFromTbank.findMany({
      where: {
        operationDate: {
          gte: from,
          lte: to + 'T23:59:59.999Z',
        },
        accountId: accountId,
      },
      select: {
        counterPartyAccount: true,
      },
    });

    // Собираем уникальные accountNumber
    const uniqueAccountNumbers = Array.from(
      new Set(
        operations
          .map((op) => op.counterPartyAccount)
          .filter((account) => account && account.trim() !== ''),
      ),
    );

    // Находим контрагентов по accountNumber
    const counterParties = await this.prisma.counterParty.findMany({
      where: {
        account: {
          in: uniqueAccountNumbers,
        },
      },
      select: {
        id: true,
        title: true,
      },
      orderBy: {
        title: 'asc',
      },
    });

    // Возвращаем массив {id, name}
    return counterParties.map((cp) => ({
      id: cp.id,
      name: cp.title,
    }));
  }

  async getExpenseCategoriesFilters({
    from,
    to,
    accountId,
  }: {
    from: string;
    to: string;
    accountId: number;
  }) {
    // Получаем все операции по датам и accountId с позициями
    const operations = await this.prisma.originalOperationFromTbank.findMany({
      where: {
        operationDate: {
          gte: from,
          lte: to + 'T23:59:59.999Z',
        },
        accountId: accountId,
      },
      select: {
        operationPositions: {
          select: {
            expenseCategoryId: true,
          },
        },
      },
    });

    // Собираем уникальные expenseCategoryId из всех позиций
    const uniqueCategoryIds = Array.from(
      new Set(
        operations
          .flatMap((op) => op.operationPositions)
          .map((pos) => pos.expenseCategoryId)
          .filter((id): id is number => id !== null && id !== undefined),
      ),
    );

    if (uniqueCategoryIds.length === 0) {
      return [];
    }

    // Находим категории по expenseCategoryId
    const expenseCategories = await this.prisma.expenseCategory.findMany({
      where: {
        id: {
          in: uniqueCategoryIds,
        },
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Возвращаем массив {id, name}
    return expenseCategories.map((cat) => ({
      id: cat.id,
      name: cat.name,
    }));
  }

  async createExpenseCategory(dto: CreateExpenseCategoryDto) {
    // Проверяем, существует ли родительская категория, если указан parentId
    console.log(dto);
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

  async getExpenseCategories(operationType?: string) {
    const types = operationType
      ? operationType === 'Credit'
        ? ['Доходы', 'Активы', 'Обязательства', 'Капитал']
        : ['Расходы', 'Активы', 'Обязательства', 'Капитал']
      : [];

    const categories = await this.prisma.expenseCategory.findMany({
      where: {
        type: { in: types },
        parent: null,
      },
      include: {
        children: {
          include: {
            children: {
              include: {
                children: true,
              },
            },
          },
        },
      },
      // orderBy: {
      //   type: 'desc',
      // },
    });

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

  async getExpenseCategoriesByType(type: string) {
    const categories = await this.prisma.expenseCategory.findMany({
      where: {
        type,
        parent: null,
      },
      include: {
        children: {
          include: {
            children: {
              include: {
                children: true,
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

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

    const accounts = await this.prisma.planFactAccount.findMany();
    // console.log(accounts);
    return accounts;
  }

  async getPLDatas(period: string, user: UserDto) {
    const periods = getLastMonths(period, 4);

    type resType = {
      periods: string[];
      income: {
        allDealsPrice: {
          period: string;
          value: number;
          changePercent: number;
        }[];
        sendDeals: {
          period: string;
          value: number;
          changePercent: number;
        }[];
        revenue: {
          period: string;
          value: number;
          changePercent: number;
        }[];
      };
      expenses: {
        production: {
          supplies: {
            data: {
              category: string;
              data: { period: string; value: number; changePercent: number }[];
            }[];
            totals: { value: number; changePercent: number }[];
          };
          productionSalaries: {
            data: {
              role: string;
              data: { period: string; value: number; changePercent: number }[];
            }[];
            totals: { value: number; changePercent: number }[];
          };
        };
        commercial: {
          adExpenses: {
            data: {
              title: string;
              data: { period: string; value: number; changePercent: number }[];
            }[];
            totals: { value: number; changePercent: number }[];
          };
          commercialSalaries: {
            data: {
              role: string;
              data: { period: string; value: number; changePercent: number }[];
            }[];
            totals: { value: number; changePercent: number }[];
          };
        };
        totals: {
          data: {
            title: string;
            data: { value: number; changePercent: number }[];
          }[];
          totals: { value: number; changePercent: number }[];
        };
      };
    };

    const res: resType = {
      periods,
      income: {
        allDealsPrice: [],
        sendDeals: [],
        revenue: [],
      },
      expenses: {
        production: {
          supplies: {
            data: [],
            totals: [],
          },
          productionSalaries: {
            data: [],
            totals: [],
          },
        },
        commercial: {
          adExpenses: {
            data: [],
            totals: [],
          },
          commercialSalaries: {
            data: [],
            totals: [],
          },
        },
        totals: {
          data: [],
          totals: [],
        },
      },
    };

    const income = await periods.reduce(
      async (
        accPromise: Promise<
          {
            period: string;
            allDealsPrice: {
              value: number;
              changePercent: number;
            };
            revenue: { value: number; changePercent: number };
            sendDeals: { value: number; changePercent: number };
          }[]
        >,
        p,
        index,
      ) => {
        const acc = await accPromise;

        const deals = await this.prisma.deal.findMany({
          where: {
            saleDate: {
              startsWith: p,
            },
            reservation: false,
            status: { not: 'Возврат' },
          },
          include: {
            dops: true,
          },
        });
        const dealsDops = deals.flatMap((d) => d.dops);
        const allDealsPrice =
          deals.reduce((a, b) => a + b.price, 0) +
          dealsDops.reduce((a, b) => a + b.price, 0);

        const payments = await this.prisma.payment.findMany({
          where: {
            date: {
              startsWith: p,
            },
            deal: {
              reservation: false,
              status: { not: 'Возврат' },
            },
          },
        });
        const revenue = payments.reduce((a, b) => a + b.price, 0);

        const sendDeliveries = await this.prisma.delivery.findMany({
          where: {
            date: {
              startsWith: p,
            },
            status: 'Отправлена',
            deal: {
              status: { not: 'Возврат' },
              reservation: false,
            },
          },
          include: {
            deal: {
              include: {
                dops: true,
              },
            },
          },
        });
        const deliveredDeliveries = await this.prisma.delivery.findMany({
          where: {
            deliveredDate: {
              startsWith: p,
            },
            status: 'Вручена',
            deal: {
              status: { not: 'Возврат' },
              reservation: false,
            },
          },
          include: {
            deal: {
              include: {
                dops: true,
              },
            },
          },
        });
        const sendDeals =
          sendDeliveries.reduce(
            (a, b) =>
              a + b.deal.price + b.deal.dops.reduce((a, b) => a + b.price, 0),
            0,
          ) +
          deliveredDeliveries.reduce(
            (a, b) =>
              a + b.deal.price + b.deal.dops.reduce((a, b) => a + b.price, 0),
            0,
          );

        const prev = acc[index - 1];
        const result = {
          period: p,
          allDealsPrice: {
            value: allDealsPrice,
            changePercent:
              index === 0
                ? 0
                : +(
                    ((allDealsPrice - prev.allDealsPrice.value) /
                      (prev.allDealsPrice.value || 1)) *
                    100
                  ).toFixed(2),
          },
          revenue: {
            value: revenue,
            changePercent:
              index === 0
                ? 0
                : +(
                    ((revenue - prev.revenue.value) /
                      (prev.revenue.value || 1)) *
                    100
                  ).toFixed(2),
          },
          sendDeals: {
            value: sendDeals,
            changePercent:
              index === 0
                ? 0
                : +(
                    ((sendDeals - prev.sendDeals.value) /
                      (prev.sendDeals.value || 1)) *
                    100
                  ).toFixed(2),
          },
        };

        acc.push(result);
        return acc;
      },
      Promise.resolve([]),
    );

    // Присваивание в нужный формат
    res.income = {
      allDealsPrice: income.map((r) => ({
        period: r.period,
        value: r.allDealsPrice.value,
        changePercent: r.allDealsPrice.changePercent,
      })),
      sendDeals: income.map((r) => ({
        period: r.period,
        value: r.sendDeals.value,
        changePercent: r.sendDeals.changePercent,
      })),
      revenue: income.map((r) => ({
        period: r.period,
        value: r.revenue.value,
        changePercent: r.revenue.changePercent,
      })),
    };

    const supplieCategories = await this.prisma.suppliePosition.findMany({
      select: {
        category: true,
      },
      distinct: ['category'],
    });

    const supplies = await Promise.all(
      supplieCategories.map(async (sup) => {
        const data = await Promise.all(
          periods.map(async (p, index) => {
            const supplies = await this.prisma.supplie.findMany({
              where: {
                date: {
                  startsWith: p,
                },
                positions: {
                  some: {
                    category: sup.category,
                  },
                },
              },
              include: {
                positions: true,
              },
            });

            const value = supplies
              .flatMap((s) => s.positions)
              .filter((p) => p.category === sup.category)
              .reduce((a, b) => a + b.priceForItem * b.quantity, 0);

            const sendDeals = res.income.sendDeals[index].value;

            return {
              period: p,
              value,
              changePercent: sendDeals
                ? +((value / sendDeals) * 100).toFixed(2)
                : 0,
            };
          }),
        );
        return {
          category: sup.category || 'Без категории',
          data,
        };
      }),
    );

    // Сортировка по значению value последнего периода по убыванию
    res.expenses.production.supplies.data = supplies.sort((a, b) => {
      const lastA = a.data[a.data.length - 1]?.value || 0;
      const lastB = b.data[b.data.length - 1]?.value || 0;
      return lastB - lastA;
    });

    const getTotals = (
      model: {
        data: {
          // period: string;
          value: number;
          changePercent: number;
        }[];
      }[],
    ) => {
      // console.log(model);
      return periods.map((p, i) => {
        const sendDeals = res.income.sendDeals[i].value;
        const value = model.reduce((a, b) => a + b.data[i].value, 0);
        // const value = model[i].data.reduce((a, b) => a + b.value, 0);

        return {
          value,
          changePercent: sendDeals ? +((value / sendDeals) * 100) : 0,
        };
      });
    };

    res.expenses.production.supplies.totals = getTotals(supplies);

    const prodRoles = [
      'Упаковщики',
      'Фрезеровщики',
      'Сборщики',
      'Ремонты',
      'Другое',
      // 'Директор производства?',
      // 'Монтажники?',
      // 'Аренда?',
      // 'Содержание офиса?',
    ];

    const prodSalaries = await Promise.all(
      prodRoles.map(async (role) => {
        if (role === 'Фрезеровщики') {
          const data = await Promise.all(
            periods.map(async (p, index) => {
              const frezerReports = await this.prisma.frezerReport.findMany({
                where: {
                  date: {
                    startsWith: p, // Исправлено с period на p
                  },
                },
              });

              const sendDeals = res.income.sendDeals[index].value;
              const value = frezerReports.reduce(
                (a, b) => a + b.cost - b.penaltyCost,
                0,
              );

              return {
                period: p,
                value,
                changePercent: sendDeals
                  ? +((value / sendDeals) * 100).toFixed(2)
                  : 0,
              };
            }),
          );
          return {
            role,
            data,
          };
        }
        if (role === 'Сборщики') {
          const data = await Promise.all(
            periods.map(async (p, index) => {
              const masterReports = await this.prisma.masterReport.findMany({
                where: {
                  date: {
                    startsWith: p, // Исправлено с period на p
                  },
                },
              });
              const sendDeals = res.income.sendDeals[index].value;
              const value = masterReports.reduce(
                (a, b) => a + b.cost - b.penaltyCost,
                0,
              );
              return {
                period: p,
                value,
                changePercent: sendDeals
                  ? +((value / sendDeals) * 100).toFixed(2)
                  : 0,
              };
            }),
          );
          return {
            role,
            data,
          };
        }
        if (role === 'Упаковщики') {
          const data = await Promise.all(
            periods.map(async (p, index) => {
              const packerReports = await this.prisma.packerReport.findMany({
                where: {
                  date: {
                    startsWith: p, // Исправлено с period на p
                  },
                },
              });
              const sendDeals = res.income.sendDeals[index].value;
              const value = packerReports.reduce(
                (a, b) => a + b.cost - b.penaltyCost,
                0,
              );
              return {
                period: p,
                value,
                changePercent: sendDeals
                  ? +((value / sendDeals) * 100).toFixed(2)
                  : 0,
              };
            }),
          );
          return {
            role,
            data,
          };
        }
        if (role === 'Ремонты') {
          const data = await Promise.all(
            periods.map(async (p, index) => {
              const repairReports =
                await this.prisma.masterRepairReport.findMany({
                  where: {
                    date: {
                      startsWith: p, // Исправлено с period на p
                    },
                  },
                });
              const sendDeals = res.income.sendDeals[index].value;
              const value = repairReports.reduce(
                (a, b) => a + b.cost - b.penaltyCost,
                0,
              );
              return {
                period: p,
                value,
                changePercent: sendDeals
                  ? +((value / sendDeals) * 100).toFixed(2)
                  : 0,
              };
            }),
          );
          return {
            role,
            data,
          };
        }
        if (role === 'Другое') {
          const data = await Promise.all(
            periods.map(async (p, index) => {
              const otherReports = await this.prisma.otherReport.findMany({
                where: {
                  date: {
                    startsWith: p, // Исправлено с period на p
                  },
                },
              });
              const sendDeals = res.income.sendDeals[index].value;
              const value = otherReports.reduce(
                (a, b) => a + b.cost - b.penaltyCost,
                0,
              );
              return {
                period: p,
                value,
                changePercent: sendDeals
                  ? +((value / sendDeals) * 100).toFixed(2)
                  : 0,
              };
            }),
          );
          return {
            role,
            data,
          };
        }
      }),
    );

    // Сортировка по значению value последнего периода по убыванию
    const sortedProdSalaries = prodSalaries
      .filter((item): item is NonNullable<typeof item> => item !== undefined)
      .sort((a, b) => {
        const lastA = a.data[a.data.length - 1]?.value || 0;
        const lastB = b.data[b.data.length - 1]?.value || 0;
        return lastB - lastA;
      });

    // Подсчет totals для каждого периода
    const prodSalariesTotals = periods.map((p, index) => {
      const sendDeals = res.income.sendDeals[index].value;
      const value = sortedProdSalaries.reduce((sum, role) => {
        const periodData = role.data.find((d) => d.period === p);
        return sum + (periodData?.value || 0);
      }, 0);
      return {
        value,
        changePercent: sendDeals ? +((value / sendDeals) * 100).toFixed(2) : 0,
      };
    });

    res.expenses.production.productionSalaries = {
      data: sortedProdSalaries,
      totals: prodSalariesTotals,
    };

    const adSources = await this.prisma.adSource.findMany({
      select: {
        title: true,
      },
      distinct: ['title'],
    });

    const adExpenses = await Promise.all(
      adSources.map(async (ads) => {
        const data = await Promise.all(
          periods.map(async (p, index) => {
            const adExpenses = await this.prisma.adExpense.findMany({
              where: {
                date: {
                  startsWith: p,
                },
                adSource: {
                  title: ads.title,
                },
              },
              include: {
                adSource: {
                  select: {
                    title: true,
                  },
                },
              },
            });
            const sendDeals = res.income.sendDeals[index].value;
            const value = adExpenses.reduce((a, b) => a + b.price, 0);

            return {
              period: p,
              value,
              changePercent: sendDeals
                ? +((value / sendDeals) * 100).toFixed(2)
                : 0,
            };
          }),
        );
        return {
          title: ads.title,
          data,
        };
      }),
    );

    res.expenses.commercial.adExpenses.data = adExpenses.sort((a, b) => {
      const lastA = a.data[a.data.length - 1]?.value || 0;
      const lastB = b.data[b.data.length - 1]?.value || 0;
      return lastB - lastA;
    });

    res.expenses.commercial.adExpenses.totals = getTotals(adExpenses);

    const mopSalaries = await Promise.all(
      periods.map(async (p, index) => {
        const data = await this.dashboardsService.getComercialData(user, p);

        const value = data.users
          .map((u) => {
            const { totalSalary, salaryCorrections } = u;
            const salaryCorrectionMinus = salaryCorrections
              .filter((c) => c.type === 'Вычет')
              .reduce((a, b) => a + b.price, 0);
            const salaryCorrectionPlus = salaryCorrections
              .filter((s) => s.type === 'Прибавка')
              .reduce((a, b) => a + b.price, 0);
            const salary =
              totalSalary + salaryCorrectionPlus - salaryCorrectionMinus;
            // prevPeriodsDealsPays +
            // prevPeriodsDopsPays;
            return {
              role: u.role === 'Директор отдела продаж' ? 'РОПы' : u.role,
              manager: u.fullName,
              salary: +salary.toFixed(2),
            };
          })
          .filter((u) => u.salary > 0 && u.role === 'Менеджер отдела продаж')
          .reduce(
            (acc, { role, manager, salary }) => {
              const existingRole = acc.find((item) => item.role === role);
              if (existingRole) {
                existingRole.value += salary;
                existingRole.salaries.push({ role, manager, salary });
              } else {
                acc.push({
                  role,
                  value: salary,
                  salaries: [{ role, manager, salary }],
                });
              }
              return acc;
            },
            [] as {
              role: string;
              value: number;
              salaries: { role: string; manager: string; salary: number }[];
            }[],
          )
          .reduce((a, b) => a + b.value, 0);
        const sendDeals = res.income.sendDeals[index].value;

        return {
          value,
          period: p,
          changePercent: sendDeals
            ? +((value / sendDeals) * 100).toFixed(2)
            : 0,
        };
      }),
    );
    const ropSalaries = await Promise.all(
      periods.map(async (p, index) => {
        const data = await this.dashboardsService.getComercialData(user, p);

        const value = data.ropData.reduce((a, b) => a + b.salaryThisPeriod, 0);
        const sendDeals = res.income.sendDeals[index].value;

        return {
          value,
          period: p,
          changePercent: sendDeals
            ? +((value / sendDeals) * 100).toFixed(2)
            : 0,
        };
      }),
    );
    const disSalaries = await Promise.all(
      periods.map(async (p, index) => {
        const designers = await this.prisma.user.findMany({
          where: {
            role: {
              shortName: 'DIZ',
            },
          },
          include: {
            salaryPays: {
              where: {
                period: p,
              },
            },
          },
        });
        const value = designers.reduce(
          (a, b) => a + b.salaryPays.reduce((a, b) => a + b.price, 0),
          0,
        );
        const sendDeals = res.income.sendDeals[index].value;
        return {
          period: p,
          value,
          changePercent: sendDeals
            ? +((value / sendDeals) * 100).toFixed(2)
            : 0,
          // more: designers
          //   .map((d) => ({
          //     role: 'Дизайнер',
          //     manager: d.fullName,
          //     salary: +d.salaryPays.reduce((a, b) => a + b.price, 0).toFixed(2),
          //   }))
          //   .filter((d) => d.salary > 0),
        };
      }),
    );
    const movSalaries = await Promise.all(
      periods.map(async (p, index) => {
        const movs = await this.prisma.user.findMany({
          where: {
            role: {
              shortName: 'MOV',
            },
          },
          include: {
            salaryPays: {
              where: {
                period,
              },
            },
          },
        });
        const value = movs.reduce(
          (a, b) => a + b.salaryPays.reduce((a, b) => a + b.price, 0),
          0,
        );
        const sendDeals = res.income.sendDeals[index].value;
        return {
          period: p,
          value,
          changePercent: sendDeals
            ? +((value / sendDeals) * 100).toFixed(2)
            : 0,
          // more: movs
          //   .map((d) => ({
          //     role: 'Менеджеры отдела ведения',
          //     manager: d.fullName,
          //     salary: +d.salaryPays.reduce((a, b) => a + b.price, 0).toFixed(2),
          //   }))
          //   .filter((d) => d.salary > 0),
        };
      }),
    );
    const kdSalaries = await Promise.all(
      periods.map(async (p, index) => {
        const sendDeals = res.income.sendDeals[index].value;

        return {
          period: p,
          value: 100_000,
          changePercent: sendDeals
            ? +((100_000 / sendDeals) * 100).toFixed(2)
            : 0,
        };
      }),
    );
    const comSalariesData = [
      {
        role: 'Коммерческий директор?',
        data: kdSalaries,
      },
      {
        role: 'РОПы',
        data: ropSalaries,
      },
      {
        role: 'Менеджеры отдела продаж',
        data: mopSalaries,
      },
      {
        role: 'Менеджеры отдела ведения',
        data: movSalaries,
      },
      {
        role: 'Дизайнеры',
        data: disSalaries,
      },
    ];

    res.expenses.commercial.commercialSalaries.data = comSalariesData.sort(
      (a, b) => {
        const lastA = a.data[a.data.length - 1]?.value || 0;
        const lastB = b.data[b.data.length - 1]?.value || 0;
        return lastB - lastA;
      },
    );

    res.expenses.commercial.commercialSalaries.totals =
      getTotals(comSalariesData);

    const mainTotals = [
      {
        title: 'Расходы на поставки',
        data: res.expenses.production.supplies.totals.map((item, index) => {
          const sendDeals = res.income.sendDeals[index].value;
          return {
            value: item.value,
            changePercent: sendDeals
              ? +((item.value / sendDeals) * 100).toFixed(2)
              : 0,
          };
        }),
      },
      {
        title: 'Зарплаты производства',
        data: res.expenses.production.productionSalaries.totals.map(
          (item, index) => {
            const sendDeals = res.income.sendDeals[index].value;
            return {
              value: item.value,
              changePercent: sendDeals
                ? +((item.value / sendDeals) * 100).toFixed(2)
                : 0,
            };
          },
        ),
      },
      {
        title: 'Расходы на рекламу',
        data: res.expenses.commercial.adExpenses.totals.map((item, index) => {
          const sendDeals = res.income.sendDeals[index].value;
          return {
            value: item.value,
            changePercent: sendDeals
              ? +((item.value / sendDeals) * 100).toFixed(2)
              : 0,
          };
        }),
      },
      {
        title: 'Зарплаты коммерческого отдела',
        data: res.expenses.commercial.commercialSalaries.totals.map(
          (item, index) => {
            const sendDeals = res.income.sendDeals[index].value;
            return {
              value: item.value,
              changePercent: sendDeals
                ? +((item.value / sendDeals) * 100).toFixed(2)
                : 0,
            };
          },
        ),
      },
    ];

    res.expenses.totals.data = mainTotals.sort((a, b) => {
      const lastA = a.data[a.data.length - 1].value || 0;
      const lastB = b.data[b.data.length - 1].value || 0;
      return lastB - lastA;
    });

    res.expenses.totals.totals = getTotals(mainTotals);

    return res;
  }

  async getPLDatas2(period: string, user: UserDto) {
    // const periods = getLastMonths(period, 4);

    const deals = await this.prisma.deal.findMany({
      where: {
        saleDate: {
          startsWith: period,
        },
        reservation: false,
        status: { not: 'Возврат' },
      },
      include: {
        dops: true,
      },
    });
    const dealsDops = deals.flatMap((d) => d.dops);
    const allDealsPrice =
      deals.reduce((a, b) => a + b.price, 0) +
      dealsDops.reduce((a, b) => a + b.price, 0);

    const payments = await this.prisma.payment.findMany({
      where: {
        date: {
          startsWith: period,
        },
        deal: {
          saleDate: {
            startsWith: period,
          },
          reservation: false,
          status: { not: 'Возврат' },
        },
      },
    });
    const revenue = payments.reduce((a, b) => a + b.price, 0);

    const sendDeliveries = await this.prisma.delivery.findMany({
      where: {
        date: {
          startsWith: period,
        },
        status: 'Отправлена',
        deal: {
          status: { not: 'Возврат' },
          reservation: false,
        },
      },
      include: {
        deal: {
          include: {
            dops: true,
          },
        },
      },
    });
    const deliveredDeliveries = await this.prisma.delivery.findMany({
      where: {
        deliveredDate: {
          startsWith: period,
        },
        status: 'Вручена',
        deal: {
          status: { not: 'Возврат' },
          reservation: false,
        },
      },
      include: {
        deal: {
          include: {
            dops: true,
          },
        },
      },
    });
    const sendDeals =
      sendDeliveries.reduce(
        (a, b) =>
          a + b.deal.price + b.deal.dops.reduce((a, b) => a + b.price, 0),
        0,
      ) +
      deliveredDeliveries.reduce(
        (a, b) =>
          a + b.deal.price + b.deal.dops.reduce((a, b) => a + b.price, 0),
        0,
      );

    const getPerc = (val: number) => {
      return +((val / sendDeals) * 100).toFixed(2);
    };

    const supplies = await this.prisma.supplie.findMany({
      where: {
        date: {
          startsWith: period,
        },
      },
      include: {
        positions: true,
      },
    });

    // Подсчет сумм по категориям для supplies
    const suppliesByCategory = supplies
      .reduce(
        (acc, supplie) => {
          supplie.positions.forEach((position) => {
            const category = position.category || 'Без категории';
            const totalPrice = position.priceForItem * position.quantity;
            const existingCategory = acc.find(
              (item) => item.label === category,
            );
            if (existingCategory) {
              existingCategory.value += totalPrice;
            } else {
              acc.push({
                label: category,
                value: totalPrice,
                perc: getPerc(totalPrice),
              });
            }
          });
          return acc;
        },
        [] as { label: string; value: number; perc: number }[],
      )
      .sort((a, b) => b.value - a.value);
    // console.log(suppliesByCategory);

    // Получение расходов на рекламу
    const adExpenses = await this.prisma.adExpense.findMany({
      where: {
        date: {
          startsWith: period,
        },
      },
      include: {
        adSource: {
          select: {
            title: true,
          },
        },
      },
    });

    // Группировка adExpenses по AdSource.title
    const adExpensesBySource = adExpenses
      .reduce(
        (acc, expense) => {
          const source = expense.adSource.title;
          const existingSource = acc.find((item) => item.source === source);
          if (existingSource) {
            existingSource.value += expense.price;
          } else {
            acc.push({
              source,
              value: expense.price,
            });
          }
          return acc;
        },
        [] as { source: string; value: number }[],
      )
      .sort((a, b) => b.value - a.value);

    //Зарплаты комерческого отдела
    const data = await this.dashboardsService.getComercialData(user, period);

    const commercialMOPSalaries = data.users
      .map((u) => {
        const {
          totalSalary,
          salaryCorrections,
          // prevPeriodsDealsPays,
          // prevPeriodsDopsPays,
        } = u;
        const salaryCorrectionMinus = salaryCorrections
          .filter((c) => c.type === 'Вычет')
          .reduce((a, b) => a + b.price, 0);
        const salaryCorrectionPlus = salaryCorrections
          .filter((s) => s.type === 'Прибавка')
          .reduce((a, b) => a + b.price, 0);
        const salary =
          totalSalary + salaryCorrectionPlus - salaryCorrectionMinus;
        // prevPeriodsDealsPays +
        // prevPeriodsDopsPays;
        return {
          role: u.role === 'Директор отдела продаж' ? 'РОПы' : u.role,
          manager: u.fullName,
          salary: +salary.toFixed(2),
        };
      })
      .filter((u) => u.salary > 0 && u.role === 'Менеджер отдела продаж')
      .reduce(
        (acc, { role, manager, salary }) => {
          const existingRole = acc.find((item) => item.role === role);
          if (existingRole) {
            existingRole.value += salary;
            existingRole.salaries.push({ role, manager, salary });
          } else {
            acc.push({
              role,
              value: salary,
              salaries: [{ role, manager, salary }],
            });
          }
          return acc;
        },
        [] as {
          role: string;
          value: number;
          salaries: { role: string; manager: string; salary: number }[];
        }[],
      );
    // console.log(commercialMOPSalaries);

    const commercialROPSalaries = data.ropData.reduce(
      (a, b) => a + b.salaryThisPeriod,
      0,
    );

    const productionSalaries = async () => {
      const packersSalaries = await this.prisma.packerReport.findMany({
        where: {
          date: {
            startsWith: period,
          },
        },
      });
      const mastersSalaries = await this.prisma.masterReport.findMany({
        where: {
          date: {
            startsWith: period,
          },
        },
      });
      const mastersRepairs = await this.prisma.masterRepairReport.findMany({
        where: {
          date: {
            startsWith: period,
          },
        },
      });
      const otherReports = await this.prisma.otherReport.findMany({
        where: {
          date: {
            startsWith: period,
          },
        },
      });

      const frezerReports = await this.prisma.frezerReport.findMany({
        where: {
          date: {
            startsWith: period,
          },
        },
      });

      return [
        {
          role: 'Упаковщики',
          value: packersSalaries.reduce(
            (a, b) => a + (b.cost - b.penaltyCost),
            0,
          ),
        },
        {
          role: 'Фрезеровщики',
          value: frezerReports.reduce(
            (a, b) => a + (b.cost - b.penaltyCost),
            0,
          ),
        },
        {
          role: 'Сборщики',
          value: mastersSalaries.reduce(
            (a, b) => a + (b.cost - b.penaltyCost),
            0,
          ),
        },
        {
          role: 'Ремонты',
          value: mastersRepairs.reduce((a, b) => a + b.cost, 0),
        },
        {
          role: 'Другое',
          value: otherReports.reduce((a, b) => a + b.cost, 0),
        },
        {
          role: 'Директор производства?',
          value: 0,
        },
        {
          role: 'Монтажники?',
          value: 0,
        },
        {
          role: 'Аренда?',
          value: 0,
        },
        {
          role: 'Содержание офиса?',
          value: 0,
        },
      ];
    };

    //зарплаты дизайнеров
    const getDesignSalaries = async () => {
      const designers = await this.prisma.user.findMany({
        where: {
          role: {
            shortName: 'DIZ',
          },
        },
        include: {
          salaryPays: {
            where: {
              period,
            },
          },
        },
      });
      return {
        role: 'Дизайнеры',
        value: designers.reduce(
          (a, b) => a + b.salaryPays.reduce((a, b) => a + b.price, 0),
          0,
        ),
        more: designers
          .map((d) => ({
            role: 'Дизайнер',
            manager: d.fullName,
            salary: +d.salaryPays.reduce((a, b) => a + b.price, 0).toFixed(2),
          }))
          .filter((d) => d.salary > 0),
      };
    };

    //Зарплаты ведения
    const getMOVSalaries = async () => {
      const movs = await this.prisma.user.findMany({
        where: {
          role: {
            shortName: 'MOV',
          },
        },
        include: {
          salaryPays: {
            where: {
              period,
            },
          },
        },
      });
      return {
        role: 'Менеджеры отдела ведения',
        value: movs.reduce(
          (a, b) => a + b.salaryPays.reduce((a, b) => a + b.price, 0),
          0,
        ),
        more: movs
          .map((d) => ({
            role: 'Менеджеры отдела ведения',
            manager: d.fullName,
            salary: +d.salaryPays.reduce((a, b) => a + b.price, 0).toFixed(2),
          }))
          .filter((d) => d.salary > 0),
      };
    };

    return {
      // Доходы
      income: {
        allDealsPrice, //сумма оформленных
        sendDeals, //сумма отправленных и доставленных
        revenue, //выручка
      },
      // Расходы
      expenses: {
        production: {
          supplies: suppliesByCategory,
          productionSalaries: await productionSalaries(),
        },
        commercial: {
          commercialSalaries: [
            ...commercialMOPSalaries,
            {
              value: +commercialROPSalaries.toFixed(2),
              role: 'РОПы',
              more: data.ropData,
            },
            {
              value: 100_000,
              role: 'Коммерческий директор?',
            },
            {
              value: 0,
              role: 'Отдел маркетинга?',
            },
            await getMOVSalaries(),
          ],
        },
        design: {
          designSalaries: [
            {
              value: 70000,
              role: 'Руководитель отдела дизайна',
            },
            await getDesignSalaries(),
          ],
        },
        hr: {
          hrSalaries: [
            {
              role: 'Зарплата HR?',
              value: 0,
            },
          ],
          hrServices: [
            {
              value: 0,
              role: 'Сервисы для найма?',
            },
          ],
        },
        adExpenses: adExpensesBySource,
        others: [
          {
            value: 0,
            role: 'Другое?',
          },
        ],
        bookkeeper: [
          {
            value: 0,
            role: 'Бухгалтер?',
          },
        ],
      },
    };
  }

  async getOriginalOperations({
    from,
    to,
    page,
    limit,
    accountId,
    distributionFilter,
    counterPartyId,
    expenseCategoryId,
    typeOfOperation,
  }: {
    from: string;
    to: string;
    page: number;
    limit: number;
    accountId?: number;
    distributionFilter?: string;
    counterPartyId?: number[];
    expenseCategoryId?: number[];
    typeOfOperation?: string;
  }) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      operationDate: {
        gte: from,
        lte: to + 'T23:59:59.999Z',
      },
    };

    if (accountId) {
      where.accountId = accountId;
    }

    if (typeOfOperation) {
      if (typeOfOperation === 'Transfer') {
        where.category = {
          in: ['selfTransferInner', 'selfTransferOuter'],
        };
      } else {
        where.typeOfOperation = typeOfOperation;
        // Исключаем transfer операции для Credit и Debit
        if (typeOfOperation === 'Credit') {
          where.category = {
            not: 'selfTransferInner',
          };
        } else if (typeOfOperation === 'Debit') {
          where.category = {
            not: 'selfTransferOuter',
          };
        }
      }
    }

    // Формируем условия для фильтрации по позициям операций
    const positionConditions: Record<string, unknown>[] = [];

    if (counterPartyId && counterPartyId.length > 0) {
      positionConditions.push({
        counterPartyId: {
          in: counterPartyId,
        },
      });
    }

    if (expenseCategoryId && expenseCategoryId.length > 0) {
      // Если expenseCategoryId содержит 0, ищем позиции с null
      if (expenseCategoryId.includes(0)) {
        const categoryIds = expenseCategoryId.filter((id) => id !== 0);
        if (categoryIds.length > 0) {
          // Если есть другие ID кроме 0, используем OR для null или других ID
          positionConditions.push({
            OR: [
              { expenseCategoryId: null },
              { expenseCategoryId: { in: categoryIds } },
            ],
          });
        } else {
          // Если только 0, ищем только null
          positionConditions.push({
            expenseCategoryId: null,
          });
        }
      } else {
        // Обычная логика - фильтр по ID
        positionConditions.push({
          expenseCategoryId: {
            in: expenseCategoryId,
          },
        });
      }
    }

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
            counterParty: true,
            expenseCategory: true,
          },
        },
      },
    });

    // Применяем фильтр по наличию статей
    let filteredOperations = allOperations;

    if (distributionFilter === 'hasCat') {
      // Операции у которых ВСЕ позиции имеют статьи
      filteredOperations = allOperations.filter(
        (operation) =>
          operation.operationPositions.length > 0 &&
          operation.operationPositions.every(
            (position) => position.expenseCategoryId !== null,
          ),
      );
    } else if (distributionFilter === 'hasntCat') {
      // Операции у которых ХОТЯ БЫ ОДНА позиция без статьи
      filteredOperations = allOperations.filter((operation) =>
        operation.operationPositions.some(
          (position) => position.expenseCategoryId === null,
        ),
      );
    }
    // Если distributionFilter === 'all' или не передан - показываем все операции

    // Исключаем операции с категориями selfTransferInner и selfTransferOuter только для фильтров hasCat и hasntCat
    if (distributionFilter === 'hasCat' || distributionFilter === 'hasntCat') {
      filteredOperations = filteredOperations.filter(
        (operation) =>
          operation.category !== 'selfTransferInner' &&
          operation.category !== 'selfTransferOuter',
      );
    }

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

  async getOriginalOperationsTotals({
    from,
    to,
    accountId,
    counterPartyId,
    expenseCategoryId,
    typeOfOperation,
  }: {
    from: string;
    to: string;
    accountId?: number;
    counterPartyId?: number[];
    expenseCategoryId?: number[];
    typeOfOperation?: string;
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

    if (typeOfOperation) {
      if (typeOfOperation === 'Transfer') {
        where.category = {
          in: ['selfTransferInner', 'selfTransferOuter'],
        };
      } else {
        where.typeOfOperation = typeOfOperation;
      }
    }

    // Формируем условия для фильтрации по позициям операций
    const positionConditions: Record<string, unknown>[] = [];

    if (counterPartyId && counterPartyId.length > 0) {
      positionConditions.push({
        counterPartyId: {
          in: counterPartyId,
        },
      });
    }

    if (expenseCategoryId && expenseCategoryId.length > 0) {
      positionConditions.push({
        expenseCategoryId: {
          in: expenseCategoryId,
        },
      });
    }

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

    // Проходим по всем операциям и их позициям
    for (const operation of allOperations) {
      // Проверка на transfer операции
      const isTransfer =
        operation.category === 'selfTransferInner' ||
        operation.category === 'selfTransferOuter';

      for (const position of operation.operationPositions) {
        // Подсчет по контрагентам с разделением на debit и credit
        if (position.counterPartyId && position.counterParty) {
          const existing = counterPartyTotalsMap.get(position.counterPartyId);
          if (existing) {
            if (isTransfer) {
              existing.transfer += position.amount;
            } else {
              if (operation.typeOfOperation === 'Debit') {
                existing.debit += position.amount;
              } else if (operation.typeOfOperation === 'Credit') {
                existing.credit += position.amount;
              }
            }
          } else {
            const debit =
              !isTransfer && operation.typeOfOperation === 'Debit'
                ? position.amount
                : 0;
            const credit =
              !isTransfer && operation.typeOfOperation === 'Credit'
                ? position.amount
                : 0;
            const transfer = isTransfer ? position.amount : 0;
            counterPartyTotalsMap.set(position.counterPartyId, {
              title: position.counterParty.title,
              debit,
              credit,
              transfer,
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
            if (isTransfer) {
              existing.transfer += position.amount;
            } else {
              if (operation.typeOfOperation === 'Debit') {
                existing.debit += position.amount;
              } else if (operation.typeOfOperation === 'Credit') {
                existing.credit += position.amount;
              }
            }
          } else {
            const debit =
              !isTransfer && operation.typeOfOperation === 'Debit'
                ? position.amount
                : 0;
            const credit =
              !isTransfer && operation.typeOfOperation === 'Credit'
                ? position.amount
                : 0;
            const transfer = isTransfer ? position.amount : 0;
            expenseCategoryTotalsMap.set(position.expenseCategoryId, {
              title: position.expenseCategory.name,
              debit,
              credit,
              transfer,
            });
          }
        } else {
          // Позиции без категории идут в "Нераспределенные"
          if (isTransfer) {
            unallocatedTotal.transfer += position.amount;
          } else {
            if (operation.typeOfOperation === 'Debit') {
              unallocatedTotal.debit += position.amount;
            } else if (operation.typeOfOperation === 'Credit') {
              unallocatedTotal.credit += position.amount;
            }
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

    return {
      counterPartyTotals,
      expenseCategoryTotals,
    };
  }

  async updateOriginalOperationPositions(
    operationId: string,
    positionsData: Array<{
      id?: number;
      counterPartyId?: number;
      expenseCategoryId?: number;
      amount: number;
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

    // Удаляем все существующие позиции
    await this.prisma.operationPosition.deleteMany({
      where: {
        originalOperationId: originalOperation.id,
      },
    });

    // Создаем новые позиции
    const createdPositions = await Promise.all(
      positionsData.map((positionData) =>
        this.prisma.operationPosition.create({
          data: {
            amount: positionData.amount,
            originalOperationId: originalOperation.id,
            counterPartyId: positionData.counterPartyId,
            expenseCategoryId: positionData.expenseCategoryId,
          },
          include: {
            counterParty: true,
            expenseCategory: true,
          },
        }),
      ),
    );

    return {
      success: true,
      operationPositions: createdPositions,
    };
  }

  async assignExpenseCategoriesToCounterParty(
    counterPartyId: number,
    categoriesData: {
      incomeExpenseCategoryId?: number;
      outcomeExpenseCategoryId?: number;
    },
  ) {
    console.log(counterPartyId);
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
    if (categoriesData.incomeExpenseCategoryId) {
      const incomeCategory = await this.prisma.expenseCategory.findUnique({
        where: { id: categoriesData.incomeExpenseCategoryId },
      });
      if (!incomeCategory) {
        throw new NotFoundException(
          `Категория расходов с ID ${categoriesData.incomeExpenseCategoryId} не найдена`,
        );
      }
    }

    if (categoriesData.outcomeExpenseCategoryId) {
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
      incomeExpenseCategoryId?: number;
      outcomeExpenseCategoryId?: number;
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

        // Создаем позицию (только если её еще нет)
        await this.prisma.operationPosition.create({
          data: {
            amount: op.accountAmount,
            originalOperationId: originalOperation.id,
            counterPartyId: counterParty.id,
            expenseCategoryId: expenseCategoryId,
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
