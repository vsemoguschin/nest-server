import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UserDto } from '../users/dto/user.dto';
import axios from 'axios';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPaymentDto: CreatePaymentDto, user: UserDto) {
    const existingDeal = await this.prisma.deal.findUnique({
      where: {
        id: createPaymentDto.dealId,
      },
    });

    if (!existingDeal) {
      throw new NotFoundException(
        `Сделка с id ${createPaymentDto.dealId} не найден.`,
      );
    }

    const newPayment = await this.prisma.payment.create({
      data: {
        ...createPaymentDto,
        userId: user.id,
        period: createPaymentDto.date.slice(0, 7),
        workSpaceId: existingDeal.workSpaceId,
      },
    });
    return newPayment;
  }

  async delete(id: number) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException(`Платеж с id ${id} не найден.`);
    }
    return await this.prisma.payment.delete({ where: { id } });
  }

  async getOperationsFromRange(
    range: { from: string; to: string },
    user: UserDto,
  ) {
    const response = await axios.get(
      'https://business.tbank.ru/openapi/api/v1/statement',
      {
        headers: {
          Authorization: 'Bearer ' + tToken,
          'Content-Type': 'application/json',
        },
        params: {
          accountNumber: '40802810900002414658',
          from: new Date(range.from),
          to: new Date(range.to),
          // categories: 'contragentPeople',
          // withBalances: true,
        },
        maxBodyLength: Infinity,
      },
    );

    console.log('Response:', response.data);
    return response.data;
  }
}

const tToken = process.env.TB_TOKEN;

const accounts = [
  {
    accountNumber: '40802810800000977213',
    name: 'Рублевый счет',
    currency: '643',
    bankBik: '044525974',
    accountType: 'Current',
    activationDate: '2019-04-03',
    balance: {
      otb: 5762806.01,
      authorized: 0,
      pendingPayments: 0,
      pendingRequisitions: 0,
    },
  },
  {
    accountNumber: '40802810900002414658',
    name: 'Easyneon',
    currency: '643',
    bankBik: '044525974',
    accountType: 'Current',
    activationDate: '2021-07-09',
    balance: {
      otb: 566355.17,
      authorized: 0,
      pendingPayments: 0,
      pendingRequisitions: 0,
    },
  },
  {
    accountNumber: '40802810900002610999',
    name: 'ИЗИПОДПИСЬ',
    currency: '643',
    bankBik: '044525974',
    accountType: 'Current',
    activationDate: '2021-09-22',
    balance: {
      otb: 368.69,
      authorized: 0,
      pendingPayments: 0,
      pendingRequisitions: 0,
    },
  },
  {
    accountNumber: '42109810100000117539',
    name: 'Овернайт',
    currency: '643',
    bankBik: '044525974',
    accountType: 'Overnight',
    activationDate: '2024-04-08',
    balance: {
      otb: 1755703.08,
      authorized: 0,
      pendingPayments: 0,
      pendingRequisitions: 0,
    },
  },
];

// выписка
const getCompanyPays = async () => {
  const inn = '598103304535';
  const kpp = '0';
  try {
    const response = await axios.get(
      'https://business.tbank.ru/openapi/api/v1/statement',
      {
        headers: {
          Authorization: 'Bearer ' + tToken,
          'Content-Type': 'application/json',
        },
        params: {
          accountNumber: '40802810900002414658',
          from: '2025-04-01T21:30:00Z',
        },
      },
    );

    console.log('Response:', response.data);
    return response.data;
  } catch (error) {
    console.error(
      'Error:',
      error.response ? error.response.data : error.message,
    );
    throw error;
  }
};

const getCompanyInfo = async () => {
  const inn = '598103304535';
  const kpp = '0';
  try {
    const data = JSON.stringify({
      invoiceNumber: '12234545454',
      accountNumber: '40802810900002414658',
      dueDate: '2025-02-22',
      invoiceDate: '2025-01-23',
      payer: {
        name: 'ООО «Название вашей компании»',
        inn: '598103304535',
        kpp: '0',
      },
      items: [
        {
          name: 'Вывеска',
          price: 1000,
          unit: 'Шт',
          vat: 'None',
          amount: 10,
        },
      ],
      contacts: [
        {
          email: 'example@mail.com',
        },
      ],
      contactPhone: '+74996051110',
      comment: 'Комментарий, например, информанция для контрагента.',
      // categories: 'contragentPeople',
      withBalances: true,
    });
    const response = await axios.post(
      'https://business.tbank.ru/openapi/api/v1/invoice/send',
      {
        headers: {
          Authorization: 'Bearer ' + tToken,
          'Content-Type': 'application/json',
        },
        data,
      },
    );

    // console.log('Response:', response.data);
    return response.data;
  } catch (error) {
    console.error(
      'Error:',
      error.response ? error.response.data : error.message,
    );
    throw error;
  }
};

// getCompanyInfo();
console.log(new Date('2025-01-02'));
 