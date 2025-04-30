import { Injectable, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlanFactAccountCreateDto } from './dto/planfact-account-create.dto';
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
  constructor(private readonly prisma: PrismaService) {}

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
    return await this.prisma.planFactAccounts.findMany();
  }
}
