import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UserDto } from '../users/dto/user.dto';
import axios from 'axios';
import { createHash } from 'crypto';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';

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
    return {...newPayment, message: 'Платеж создан'};
  }

  async createLink(createPaymentLinkDto: CreatePaymentLinkDto) {
    function generateToken(Data): string {
      const hash = createHash('sha256')
        .update(Data.join(''), 'utf8')
        .digest('hex');
      return hash;
    }

    const { Name, Phone, Email } = createPaymentLinkDto;
    const Amount = createPaymentLinkDto.Amount * 100;
    const Description = 'Оплата неоновой вывески';
    const OrderId = new Date().getTime();
    // console.log(OrderId);

    let TerminalKey = '';
    let password = '';

    if (createPaymentLinkDto.terminal === 'Терминал Изинеон СБП') {
      TerminalKey = process.env.TB_TERMINAL_SPB || '';
      password = process.env.TB_TERMINAL_PASSWORD_SPB || '';
    } else {
      TerminalKey = process.env.TB_TERMINAL || '';
      password = process.env.TB_TERMINAL_PASSWORD || '';
    }

    // Генерация токена
    const Token = generateToken([
      Amount,
      Description,
      OrderId,
      password,
      TerminalKey,
    ]);
    // console.log([Amount, Description, OrderId, password, TerminalKey].join(''));

    const body = {
      TerminalKey, //
      Amount,
      OrderId,
      Description,
      Token,
      Receipt: {
        Email,
        Phone,
        Taxation: 'usn_income',
        Items: [
          {
            Name,
            Price: Amount,
            Quantity: 1,
            Amount,
            PaymentMethod: 'full_payment',
            PaymentObject: 'service',
            Tax: 'vat5',
            // Ean13: '30 31 30 32 39 30 30 30 30 63 03 33 43 35',
          },
        ],
      },
    };

    const { data } = await axios.post(
      'https://securepay.tinkoff.ru/v2/Init',
      body,
    );

    console.log(data);

    return { link: data.PaymentURL, PaymentId: data.PaymentId };
  }

  async checkPayment(paymentId: string, terminal: string) {
    function generateToken(Data): string {
      const hash = createHash('sha256')
        .update(Data.join(''), 'utf8')
        .digest('hex');
      return hash;
    }
    let TerminalKey = '';
    let password = '';

    if (terminal === 'Терминал Изинеон СБП') {
      TerminalKey = process.env.TB_TERMINAL_SPB || '';
      password = process.env.TB_TERMINAL_PASSWORD_SPB || '';
    } else {
      TerminalKey = process.env.TB_TERMINAL || '';
      password = process.env.TB_TERMINAL_PASSWORD || '';
    }

    // Генерация токена
    const Token = generateToken([password, paymentId, TerminalKey]);
    try {
      const { data } = await axios.post(
        'https://securepay.tinkoff.ru/v2/GetState',
        { TerminalKey, PaymentId: paymentId, Token },
      );
      const res = {
        isConfirmed: false,
        message: 'Оплата не подтверждена',
        price: 0,
      };

      if (data.Status == 'CONFIRMED') {
        res.isConfirmed = true;
        res.price = data.Amount / 100;
        res.message = 'Оплата подтверждена';
      } 

      if (data.Success === false) {
        res.message = data.Message;
      }

      console.log(data);

      return res;
    } catch (error) {
      console.log(error);
      throw new NotFoundException(`Ошибка при проверке оплаты`);
    }
  }

  async delete(id: number) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException(`Платеж с id ${id} не найден.`);
    }
    return await this.prisma.payment.delete({ where: { id } });
  }
}

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
