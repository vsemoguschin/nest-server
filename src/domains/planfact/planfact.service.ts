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
import { SocksProxyAgent } from 'socks-proxy-agent';
import { CounterParty } from '@prisma/client';
import { CreateOperationDto } from './dto/create-operation.dto';
import { v4 as uuidv4 } from 'uuid';
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
  }): Promise<CounterParty> {
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
          const agent = new SocksProxyAgent('socks5h://localhost:8080');

          try {
            const response = await axios.get(
              'https://business.tbank.ru/openapi/api/v1/statement',
              {
                httpsAgent: agent, // Используем SOCKS-прокси
                proxy: false, // Отключаем системный прокси
                headers: {
                  Authorization: 'Bearer ' + tToken,
                  'Content-Type': 'application/json',
                },
                params: {
                  accountNumber,
                  operationStatus: 'Transaction',
                  from: new Date(range.from),
                  to: new Date(range.to),
                  withBalances: true,
                  limit: limit,
                },
                maxBodyLength: Infinity,
              },
            );

            // console.log(response.data.operations);

            const operations = await Promise.all(
              response.data.operations.map(async (op: OperationFromApi) => {
                // Проверяем и создаем CounterParty, если не существует
                // console.log(op);
                const counterParty = await this.getOrCreateCounterParty(
                  op.counterParty,
                );

                // console.log(op.accountAmount, op.counterParty, counterParty);

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

                // if(operation) 
                console.log(operation);

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
            console.log(error);
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
    const types =
      operationType === 'Поступление'
        ? ['Доходы', 'Активы', 'Обязательства', 'Капитал']
        : ['Расходы', 'Активы', 'Обязательства', 'Капитал'];

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
    const bankAccounts = ['40802810800000977213', '40802810900002414658']; // Список банковских счетов

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
    const periods = getLastMonths(period, 4);

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
          prevPeriodsDealsPays,
          prevPeriodsDopsPays,
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
}
