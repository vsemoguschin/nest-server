import { Injectable, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlanFactAccountCreateDto } from './dto/planfact-account-create.dto';
import { DashboardsService } from '../dashboards/dashboards.service';
import { UserDto } from '../users/dto/user.dto';
const tToken = process.env.TB_TOKEN;

export interface Operation {
  operationDate: string;
  accountNumber: string;
  typeOfOperation: string;
  category: string;
  accountAmount: number;
  description: string;
  payPurpose: string;
  counterParty: string;
}

export interface OperationsResponse {
  operations: Operation[];
  contragents: string[];
}

@Injectable()
export class PlanfactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardsService: DashboardsService,
  ) {}

  private mapOperation(op: any): Operation {
    let operationType = op.category;
    if (op.category === 'selfTransferInner') {
      operationType = 'Перемещение';
    }
    if (['incomePeople', 'income'].includes(op.category)) {
      operationType = 'Поступление';
    }
    if (
      [
        'salary',
        'fee',
        'selfTransferOuter',
        'cardOperation',
        'contragentPeople',
      ].includes(op.category)
    ) {
      operationType = 'Выплата';
    }

    const accountNumberSlice = op.accountNumber?.slice(-4);
    const accountLabel =
      accountNumberSlice === '7213'
        ? 'Основной счет 7213'
        : accountNumberSlice === '4658'
          ? 'Кредитный счет 4658'
          : op.accountNumber;

    return {
      operationDate: op.operationDate,
      accountNumber: accountLabel,
      typeOfOperation: operationType,
      category: op.category,
      accountAmount: op.accountAmount,
      description: op.description,
      payPurpose: op.payPurpose,
      counterParty: op.counterParty?.name || '',
    };
  }
  async getOperationsFromRange(
    range: { from: string; to: string },
    limit: number,
  ) {
    try {
      const bankAccounts = ['40802810800000977213', '40802810900002414658']; // Список банковских счетов

      // Функция для получения операций по одному счету
      const fetchOperationsForAccount = async (accountNumber: string) => {
        const response = await axios.get(
          'https://business.tbank.ru/openapi/api/v1/statement',
          {
            headers: {
              Authorization: 'Bearer ' + tToken,
              'Content-Type': 'application/json',
            },
            params: {
              accountNumber,
              operationStatus: 'All',
              from: new Date(range.from),
              to: new Date(range.to),
              withBalances: true,
              limit,
            },
            maxBodyLength: Infinity,
          },
        );

        // console.log(
        //   response.data.operations
        //     .slice(-5)
        //     .filter((o) => o.operationAmount === 10),
        // );

        return response.data.operations.map((op: any) => {
          if (op.counterParty?.name) {
            contragentsSet.add(op.counterParty.name);
          }
          return this.mapOperation(op);
        });
      };

      // Множество для уникальных контрагентов
      const contragentsSet = new Set<string>();

      // Получаем операции для всех счетов параллельно
      const operationsArrays = await Promise.all(
        bankAccounts.map((accountNumber) =>
          fetchOperationsForAccount(accountNumber),
        ),
      );

      // Объединяем все операции в один массив
      const allOperations = operationsArrays.flat();

      // Сортируем операции по operationDate (в порядке возрастания)
      allOperations.sort(
        (a, b) =>
          new Date(a.operationDate).getTime() -
          new Date(b.operationDate).getTime(),
      );

      return {
        operations: allOperations,
        contragents: Array.from(contragentsSet), // Уникальные контрагенты
        bankAccounts: [
          'Основной счет ' + bankAccounts[0].slice(-4),
          'Счет для кредитов ' + bankAccounts[1].slice(-4),
        ], // Список банковских счетов
      };
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
    return await this.prisma.transactionCategories.findMany({
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

  async createAccount(PlanFactAccountCreateDto: PlanFactAccountCreateDto) {
    return await this.prisma.planFactAccounts.create({
      data: PlanFactAccountCreateDto,
    });
  }

  async getBankAccounts() {
    const bankAccounts = ['40802810800000977213', '40802810900002414658']; // Список банковских счетов

    const response = await axios.get(
      'https://business.tbank.ru/openapi/api/v4/bank-accounts',
      {
        headers: {
          Authorization: 'Bearer ' + tToken,
          'Content-Type': 'application/json',
        },
        maxBodyLength: Infinity,
      },
    );
    console.log(response);

    return await this.prisma.planFactAccounts.findMany();
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
      ];
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
              value: commercialROPSalaries,
              role: 'РОПы',
              more: data.ropData,
            },
          ],
        },
        adExpenses: adExpensesBySource,
      },
    };
  }

  async getPLDatas2(period: string) {
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

    const dateFrom = new Date(period + '-01').toISOString().slice(0, 10);
    const [year, month] = period.split('-').map(Number);
    const dateTo = new Date(year, month, 1).toISOString().slice(0, 10);

    const data = await this.getOperationsFromRange(
      { from: dateFrom, to: dateTo },
      5000,
    );
    const operations = data.operations.filter(
      (o) => o.typeOfOperation === 'Выплата',
    );

    // Получение всех пользователей для productionSalaries
    const prodUsers = await this.prisma.user.findMany({
      where: {
        role: {
          shortName: {
            in: ['MASTER'],
            // in: ['DP', 'RP', 'LOGIST', 'MASTER', 'FRZ', 'PACKER', 'LAM'],
          },
        },
      },
      select: {
        fullName: true,
        role: {
          select: {
            fullName: true,
          },
        },
      },
    });

    // Подсчет зарплат по ролям для productionSalaries
    const productionSalaries = prodUsers
      .reduce(
        (acc, user) => {
          const userOps = operations.filter((o) => {
            const name = user.fullName.toLowerCase().split(' ');
            const contrAgent = o.counterParty.toLowerCase().split(' ');
            return name.every((s) => contrAgent.includes(s));
          });
          // console.log(userOps);
          const pays = userOps.reduce((sum, op) => sum + op.accountAmount, 0);

          const role = user.role.fullName;
          const existingRole = acc.find((item) => item.role === role);
          if (existingRole) {
            existingRole.value += pays;
            existingRole.operations.push(...userOps);
          } else if (pays > 0) {
            acc.push({
              role,
              value: pays,
              operations: [...userOps],
            });
          }

          return acc;
        },
        [] as { role: string; value: number; operations: any[] }[],
      )
      .sort((a, b) => b.value - a.value);

    // Получение всех пользователей для commercialSalaries
    const commUsers = await this.prisma.user.findMany({
      where: {
        role: {
          shortName: {
            in: [
              'MOP',
              'KD',
              'DO',
              'ROP',
              'ROV',
              'MOV',
              'ROD',
              'DIZ',
              'MTZ',
              'MARKETER',
              'BUKH',
            ],
          },
        },
      },
      select: {
        fullName: true,
        role: {
          select: {
            fullName: true,
          },
        },
      },
    });

    // Подсчет зарплат по ролям для commercialSalaries
    const commercialSalaries = commUsers
      .reduce(
        (acc, user) => {
          const userOps = operations.filter((o) => {
            const name = user.fullName.toLowerCase().split(' ');
            const contrAgent = o.counterParty.toLowerCase().split(' ');
            return name.every((s) => contrAgent.includes(s));
          });
          const pays = userOps.reduce((sum, op) => sum + op.accountAmount, 0);

          const role = user.role.fullName;
          const existingRole = acc.find((item) => item.role === role);
          if (existingRole) {
            existingRole.value += pays;
            existingRole.operations.push(...userOps);
          } else if (pays > 0) {
            acc.push({
              role,
              value: pays,
              operations: [...userOps],
            });
          }

          return acc;
        },
        [] as { role: string; value: number; operations: any[] }[],
      )
      .sort((a, b) => b.value - a.value);

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
          productionSalaries,
        },
        commercial: {
          commercialSalaries,
        },
        adExpenses: adExpensesBySource,
      },
    };
  }
}
