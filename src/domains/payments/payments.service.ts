import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UserDto } from '../users/dto/user.dto';
import axios from 'axios';
import { createHash } from 'crypto';

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
      // categories: 'contragentPeople',
      withBalances: true,
    });
    const response = await axios.get(
      'https://business.tbank.ru/openapi/api/v1/counterparty/contracts',
      {
        headers: {
          Authorization: 'Bearer ' + tToken,
          'Content-Type': 'application/json',
        },
        params: {
          limit: 100,
          offset: 100,
          ogrn: 318595800030530,
        },
      },
    );

    console.log('Response:', response.data.companyCard);
    return response.data;
  } catch (error) {
    console.error(
      'Error:',
      error.response ? error.response.data : error.message,
    );
    throw error;
  }
};

function generateToken(Data): string {
  console.log(Data.join(''));
  // 5. Применяем SHA-256
  const hash = createHash('sha256').update(Data.join(''), 'utf8').digest('hex');

  return hash;
}

const TerminalKey = process.env.TB_TERMINAL;
const password = process.env.TB_TERMINAL_PASSWORD!;
const createLink = async () => {
  const Amount = '1000';
  const OrderId = 'ыизеуые';
  const Description = 'Hello';

  // Генерация токена
  const token = generateToken([
    Amount,
    Description,
    OrderId,
    password,
    TerminalKey, //
  ]);

  // Обновление тела запроса с новым токеном
  const Token = token;
  // return
  try {
    const response = await axios.post('https://securepay.tinkoff.ru/v2/Init', {
      // headers: {
      //   'Content-Type': 'application/json',
      // },
      TerminalKey, //
      Amount,
      OrderId,
      Description,
      Token,
      Receipt: {
        Email: 'a@test.ru',
        Phone: '+79622433486',
        Taxation: 'osn',
        Items: [
          {
            Name: 'Наименование товара 1',
            Price: '1000',
            Quantity: 1,
            Amount: '1000',
            PaymentMethod: 'full_payment',
            PaymentObject: 'service',
            Tax: 'vat5',
            Ean13: '30 31 30 32 39 30 30 30 30 63 03 33 43 35',
          },
        ],
      },
    });

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

// createLink();

// getCompanyInfo();
// console.log(new Date('2025-01-02'));

const operation = {
  operationDate: '2025-04-01T05:16:52Z', //Дата операции. В зависимости от статуса операции равна дате проведения по балансу или дате авторизации.
  operationId: '32005e8d-5b2c-00f5-ab39-7ab40b53d7a8',
  operationStatus: 'Transaction', // [Authorization, Transaction] Статус операции: авторизация или подтвержденная транзакция.
  accountNumber: '40802810800000977213',
  bic: '044525974',
  typeOfOperation: 'Credit', //Тип операции: Сredit — поступления, Debit — списания.
  category: 'incomePeople',
  trxnPostDate: '2025-04-01T05:16:56Z', //Дата транзакции.
  authorizationDate: '2025-04-01T05:16:36Z', //Дата авторизации.
  drawDate: '2025-04-01T05:16:52Z', // Дата списано.
  chargeDate: '2025-04-01T05:16:52Z', // Дата поступило.
  docDate: '2025-03-31T21:00:00Z', //Дата создания документа.
  documentNumber: '151819', //Номер платежного документа.
  payVo: 'bank-order', // Вид операции
  vo: '17', //Вид операции (номер)
  priority: 5, //Очередность платежа.
  operationAmount: 3916, // Сумма в валюте операции.
  operationCurrencyDigitalCode: '643', //Числовой код валюты операции
  accountAmount: 3916, // Сумма в валюте счета.
  accountCurrencyDigitalCode: '643', // Числовой код валюты счета.
  rubleAmount: 3916, //Сумма в рублях по курсу ЦБ на дату операции.
  description: 'Пополнение по операции СБП 6119007349. Терминал Easyneon-SBP', //Описание операции.
  payPurpose: 'Пополнение по операции СБП 6119007349. Терминал Easyneon-SBP', //Назначение платежа.
  payer: {
    //Информация о плательщике.
    acct: '30233810400007059951', //Номер счета плательщика.
    inn: '7710140679', //ИНН плательщика.
    kpp: '771301001', //КПП плательщика.
    name: 'АО "ТБанк"', //Наименование плательщика.
    bicRu: '044525974', //БИК банка плательщика.
    bankName: 'АО "ТБанк"', // Название банка плательщика.
    corAcct: '30101810145250000974', //Корреспондентский счет плательщика.
  },
  receiver: {
    acct: '40802810800000977213',
    inn: '598103304535',
    kpp: '0',
    name: 'Индивидуальный предприниматель МАЗУНИН МАКСИМ ЕВГЕНЬЕВИЧ',
    bicRu: '044525974',
    bankName: 'АО "ТБанк"',
    corAcct: '30101810145250000974',
  },
  counterParty: {
    //Информация о контрагенте.
    account: '30233810400007059951',
    inn: '7710140679',
    kpp: '771301001',
    name: 'АО "ТБанк"',
    bankName: 'АО "ТБанк"',
    bankBic: '044525974',
    corrAccount: '30101810145250000974',
  },
  authCode: '332954', //Код авторизации.
  rrn: '0009QxSNG9bt', //RRN (Reference Retrieval Number) — уникальный идентификатор банковской транзакции.
  acquirerId: '010455', //ID эквайера.
};
// `Response: {
//   Success: true,
//   ErrorCode: '0',
//   TerminalKey: '1669889928470',
//   Status: 'NEW',
//   PaymentId: '6205565038',
//   OrderId: 'sdaeAw',
//   Amount: 1000,
//   PaymentURL: 'https://securepayments.tinkoff.ru/fpUDQzRu'
// }```;
// Response: {
//   Success: true,
//   ErrorCode: '0',
//   TerminalKey: '1669889928470',
//   Status: 'NEW',
//   PaymentId: '6205795736',
//   OrderId: 'ыизеуые',
//   Amount: 1000,
//   PaymentURL: 'https://securepayments.tinkoff.ru/pqroh8XU'
// }
