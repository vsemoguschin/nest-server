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
    // Проверяем существование счета
    const account = await this.prisma.planFactAccount.findUnique({
      where: { id: dto.accountId },
    });
    if (!account) {
      throw new NotFoundException(`Счет с ID ${dto.accountId} не найден`);
    }

    // Проверяем существование категории, если указана
    if (dto.expenseCategoryId) {
      const category = await this.prisma.expenseCategory.findUnique({
        where: { id: dto.expenseCategoryId },
      });
      if (!category) {
        throw new NotFoundException(
          `Категория с ID ${dto.expenseCategoryId} не найдена`,
        );
      }
    }

    // Проверяем существование контрагента, если указан
    if (dto.counterPartyId) {
      const counterParty = await this.prisma.counterParty.findUnique({
        where: { id: dto.counterPartyId },
      });
      if (!counterParty) {
        throw new NotFoundException(
          `Контрагент с ID ${dto.counterPartyId} не найден`,
        );
      }
    }

    // Создаем операцию
    return this.prisma.operation.create({
      data: {
        operationId: uuidv4(),
        operationDate: dto.operationDate,
        operationDateTime: new Date(dto.operationDate),
        operationType: dto.operationType,
        description: dto.description || '',
        payPurpose: dto.payPurpose || '',
        accountAmount: dto.accountAmount,
        isCreated: true,
        expenseCategoryId: dto.expenseCategoryId,
        counterPartyId: dto.counterPartyId,
        accountId: dto.accountId,
      },
    });
  }

  async updateOperation(operationId: string, dto: UpdateOperationDto) {
    const operation = await this.prisma.operation.findUnique({
      where: { operationId },
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

    if (dto.expenseCategoryId) {
      const category = await this.prisma.expenseCategory.findUnique({
        where: { id: dto.expenseCategoryId },
      });
      if (!category) {
        throw new NotFoundException(
          `Категория с ID ${dto.expenseCategoryId} не найдена`,
        );
      }
    }

    if (dto.counterPartyId) {
      const counterParty = await this.prisma.counterParty.findUnique({
        where: { id: dto.counterPartyId },
      });
      if (!counterParty) {
        throw new NotFoundException(
          `Контрагент с ID ${dto.counterPartyId} не найден`,
        );
      }
    }

    return this.prisma.operation.update({
      where: { operationId },
      data: {
        operationDate: dto.operationDate,
        operationType: dto.operationType,
        description: dto.description || '',
        payPurpose: dto.payPurpose || '',
        accountAmount: dto.accountAmount,
        expenseCategoryId: dto.expenseCategoryId === 0 ? null : dto.expenseCategoryId,
        counterPartyId: dto.counterPartyId,
        accountId: dto.accountId,
      },
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
        const fetchOperationsForAccount = async (accountNumber: string) => {
          // const agent = new SocksProxyAgent('socks5h://localhost:8080');

          try {
            const response = await axios.get(
              'https://business.tbank.ru/openapi/api/v1/statement',
              {
                // httpsAgent: agent, // Используем SOCKS-прокси
                // proxy: false, // Отключаем системный прокси
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
                    accountAmount: op.accountAmount,
                    accountId: account.id,
                    counterPartyId: counterParty.id,
                  },
                  include: {
                    counterParty: true,
                    expenseCategory: true,
                    account: true,
                  },
                });
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
                counterParty: true,
                expenseCategory: true,
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
        const operations = await this.prisma.operation.findMany({
          where: {
            id: account.id,
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

  async getCounterParties() {
    return this.prisma.counterParty.findMany();
  }

  async getExpenseCategories(operationType?: string) {
    const types = operationType === 'Поступление'
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

  async assignExpenseCategory(operationId: string, expenseCategoryId: number) {
    // Проверяем существование категории и что она листовая
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id: expenseCategoryId },
      // include: { children: { select: { id: true } } },
    });

    if (!category) {
      throw new NotFoundException('Категория не найдена');
    }

    // Проверяем операцию
    const operation = await this.prisma.operation.findUnique({
      where: { operationId },
      include: {
        expenseCategory: true,
      },
    });

    if (!operation) {
      throw new NotFoundException('Операция не найдена');
    }
    // Обновляем существующую операцию
    const updatedOperation = await this.prisma.operation.update({
      where: { operationId },
      data: { expenseCategoryId },
      include: {
        expenseCategory: true,
        counterParty: true,
      },
    });

    return updatedOperation;
  }

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
              acc.push({ label: category, value: totalPrice });
            }
          });
          return acc;
        },
        [] as { label: string; value: number }[],
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
    console.log(commercialMOPSalaries);

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

      return [
        {
          role: 'Упаковщики',
          value: packersSalaries.reduce((a, b) => a + b.cost, 0),
        },
        {
          role: 'Сборщики',
          value: mastersSalaries.reduce((a, b) => a + b.cost, 0),
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
        allDealsPrice,
        sendDeals,
        revenue,
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

  // async getPLDatas2(period: string) {
  //   const deals = await this.prisma.deal.findMany({
  //     where: {
  //       saleDate: {
  //         startsWith: period,
  //       },
  //       reservation: false,
  //       status: { not: 'Возврат' },
  //     },
  //     include: {
  //       dops: true,
  //     },
  //   });
  //   const dealsDops = deals.flatMap((d) => d.dops);
  //   const allDealsPrice =
  //     deals.reduce((a, b) => a + b.price, 0) +
  //     dealsDops.reduce((a, b) => a + b.price, 0);

  //   const payments = await this.prisma.payment.findMany({
  //     where: {
  //       date: {
  //         startsWith: period,
  //       },
  //       deal: {
  //         saleDate: {
  //           startsWith: period,
  //         },
  //         reservation: false,
  //         status: { not: 'Возврат' },
  //       },
  //     },
  //   });
  //   const revenue = payments.reduce((a, b) => a + b.price, 0);

  //   const sendDeliveries = await this.prisma.delivery.findMany({
  //     where: {
  //       date: {
  //         startsWith: period,
  //       },
  //       status: 'Отправлена',
  //     },
  //     include: {
  //       deal: {
  //         include: {
  //           dops: true,
  //         },
  //       },
  //     },
  //   });
  //   const deliveredDeliveries = await this.prisma.delivery.findMany({
  //     where: {
  //       deliveredDate: {
  //         startsWith: period,
  //       },
  //       status: 'Вручена',
  //     },
  //     include: {
  //       deal: {
  //         include: {
  //           dops: true,
  //         },
  //       },
  //     },
  //   });
  //   const sendDeals =
  //     sendDeliveries.reduce(
  //       (a, b) =>
  //         a + b.deal.price + b.deal.dops.reduce((a, b) => a + b.price, 0),
  //       0,
  //     ) +
  //     deliveredDeliveries.reduce(
  //       (a, b) =>
  //         a + b.deal.price + b.deal.dops.reduce((a, b) => a + b.price, 0),
  //       0,
  //     );

  //   const supplies = await this.prisma.supplie.findMany({
  //     where: {
  //       date: {
  //         startsWith: period,
  //       },
  //     },
  //     include: {
  //       positions: true,
  //     },
  //   });

  //   // Подсчет сумм по категориям для supplies
  //   const suppliesByCategory = supplies
  //     .reduce(
  //       (acc, supplie) => {
  //         supplie.positions.forEach((position) => {
  //           const category = position.category || 'Без категории';
  //           const totalPrice = position.priceForItem * position.quantity;
  //           const existingCategory = acc.find(
  //             (item) => item.label === category,
  //           );
  //           if (existingCategory) {
  //             existingCategory.value += totalPrice;
  //           } else {
  //             acc.push({ label: category, value: totalPrice });
  //           }
  //         });
  //         return acc;
  //       },
  //       [] as { label: string; value: number }[],
  //     )
  //     .sort((a, b) => b.value - a.value);
  //   // console.log(suppliesByCategory);

  //   const dateFrom = new Date(period + '-01').toISOString().slice(0, 10);
  //   const [year, month] = period.split('-').map(Number);
  //   const dateTo = new Date(year, month, 1).toISOString().slice(0, 10);

  //   const data = await this.getOperationsFromRange(
  //     { from: dateFrom, to: dateTo },
  //     5000,
  //   );
  //   const operations = data.operations.filter(
  //     (o) => o.typeOfOperation === 'Выплата',
  //   );

  //   // Получение всех пользователей для productionSalaries
  //   const prodUsers = await this.prisma.user.findMany({
  //     where: {
  //       role: {
  //         shortName: {
  //           in: ['MASTER'],
  //           // in: ['DP', 'RP', 'LOGIST', 'MASTER', 'FRZ', 'PACKER', 'LAM'],
  //         },
  //       },
  //     },
  //     select: {
  //       fullName: true,
  //       role: {
  //         select: {
  //           fullName: true,
  //         },
  //       },
  //     },
  //   });

  //   // Подсчет зарплат по ролям для productionSalaries
  //   const productionSalaries = prodUsers
  //     .reduce(
  //       (acc, user) => {
  //         const userOps = operations.filter((o) => {
  //           const name = user.fullName.toLowerCase().split(' ');
  //           const contrAgent = o.counterParty.toLowerCase().split(' ');
  //           return name.every((s) => contrAgent.includes(s));
  //         });
  //         // console.log(userOps);
  //         const pays = userOps.reduce((sum, op) => sum + op.accountAmount, 0);

  //         const role = user.role.fullName;
  //         const existingRole = acc.find((item) => item.role === role);
  //         if (existingRole) {
  //           existingRole.value += pays;
  //           existingRole.operations.push(...userOps);
  //         } else if (pays > 0) {
  //           acc.push({
  //             role,
  //             value: pays,
  //             operations: [...userOps],
  //           });
  //         }

  //         return acc;
  //       },
  //       [] as { role: string; value: number; operations: any[] }[],
  //     )
  //     .sort((a, b) => b.value - a.value);

  //   // Получение всех пользователей для commercialSalaries
  //   const commUsers = await this.prisma.user.findMany({
  //     where: {
  //       role: {
  //         shortName: {
  //           in: [
  //             'MOP',
  //             'KD',
  //             'DO',
  //             'ROP',
  //             'ROV',
  //             'MOV',
  //             'ROD',
  //             'DIZ',
  //             'MTZ',
  //             'MARKETER',
  //             'BUKH',
  //           ],
  //         },
  //       },
  //     },
  //     select: {
  //       fullName: true,
  //       role: {
  //         select: {
  //           fullName: true,
  //         },
  //       },
  //     },
  //   });

  //   // Подсчет зарплат по ролям для commercialSalaries
  //   const commercialSalaries = commUsers
  //     .reduce(
  //       (acc, user) => {
  //         const userOps = operations.filter((o) => {
  //           const name = user.fullName.toLowerCase().split(' ');
  //           const contrAgent = o.counterParty.toLowerCase().split(' ');
  //           return name.every((s) => contrAgent.includes(s));
  //         });
  //         const pays = userOps.reduce((sum, op) => sum + op.accountAmount, 0);

  //         const role = user.role.fullName;
  //         const existingRole = acc.find((item) => item.role === role);
  //         if (existingRole) {
  //           existingRole.value += pays;
  //           existingRole.operations.push(...userOps);
  //         } else if (pays > 0) {
  //           acc.push({
  //             role,
  //             value: pays,
  //             operations: [...userOps],
  //           });
  //         }

  //         return acc;
  //       },
  //       [] as { role: string; value: number; operations: any[] }[],
  //     )
  //     .sort((a, b) => b.value - a.value);

  //   // Получение расходов на рекламу
  //   const adExpenses = await this.prisma.adExpense.findMany({
  //     where: {
  //       date: {
  //         startsWith: period,
  //       },
  //     },
  //     include: {
  //       adSource: {
  //         select: {
  //           title: true,
  //         },
  //       },
  //     },
  //   });

  //   // Группировка adExpenses по AdSource.title
  //   const adExpensesBySource = adExpenses
  //     .reduce(
  //       (acc, expense) => {
  //         const source = expense.adSource.title;
  //         const existingSource = acc.find((item) => item.source === source);
  //         if (existingSource) {
  //           existingSource.value += expense.price;
  //         } else {
  //           acc.push({
  //             source,
  //             value: expense.price,
  //           });
  //         }
  //         return acc;
  //       },
  //       [] as { source: string; value: number }[],
  //     )
  //     .sort((a, b) => b.value - a.value);

  //   return {
  //     // Доходы
  //     income: {
  //       allDealsPrice,
  //       sendDeals,
  //       revenue,
  //     },
  //     // Расходы
  //     expenses: {
  //       production: {
  //         supplies: suppliesByCategory,
  //         productionSalaries,
  //       },
  //       commercial: {
  //         commercialSalaries,
  //       },
  //       adExpenses: adExpensesBySource,
  //     },
  //   };
  // }
}
