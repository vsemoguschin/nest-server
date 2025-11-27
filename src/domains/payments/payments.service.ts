import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UserDto } from '../users/dto/user.dto';
import axios from 'axios';
import { createHash } from 'crypto';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import { CreateOfferLinkDto } from './dto/create-offer-link.dto';

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
        userId: createPaymentDto.userId,
        period: createPaymentDto.date.slice(0, 7),
        workSpaceId: existingDeal.workSpaceId,
        groupId: existingDeal.groupId,
      },
    });
    // console.log(newPayment);

    // Формируем комментарий для аудита
    const auditComment = `Добавил платеж(${newPayment.method}) на сумму ${newPayment.price} руб.`;

    // Создаем запись в аудите
    await this.prisma.dealAudit.create({
      data: {
        dealId: createPaymentDto.dealId,
        userId: user.id,
        action: 'Создание платежа',
        comment: auditComment,
      },
    });
    return { ...newPayment, message: 'Платеж создан' };
  }

  async createOfferLink(
    createOfferLinkDto: CreateOfferLinkDto,
    jwtToken: string = '',
  ) {
    const { Name } = createOfferLinkDto;
    const Amount = createOfferLinkDto.Amount * 100;
    const Description =
      Name === 'Изготовление неоновой вывески'
        ? 'Оплата неоновой вывески'
        : 'Оплата фотокниги';

    // Создаем предзапись с офертой (без оплаты)
    // В этом случае создается только запись в БД payment-service, ссылка в Tinkoff НЕ создается
    // Email и Phone не требуются - клиент заполнит email на странице оферты
    const paymentServiceUrl =
      process.env.PAYMENT_SERVICE_URL || 'http://localhost:5001';
    try {
      const { data } = await axios.post(
        `${paymentServiceUrl}/api/payments/draft`,
        {
          amount: Amount,
          name: Name,
          description: Description,
          terminal: createOfferLinkDto.terminal,
        },
        {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
          },
        },
      );

      // Возвращаем только публичную ссылку на страницу оферты, без ссылки на оплату
      // Ссылка на оплату будет создана позже после принятия оферты клиентом
      return {
        link: '', // Нет прямой ссылки на оплату
        publicLink: data.publicLink,
        PaymentId: '', // Будет заполнен после создания платежа
      };
    } catch (error) {
      console.error('Ошибка при создании предзаписи:', error);
      if (error.response) {
        console.error('Ответ сервера:', error.response.data);
        console.error('Статус:', error.response.status);
      }
      throw error;
    }
  }

  async createLink(
    createPaymentLinkDto: CreatePaymentLinkDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _user: UserDto | null = null,
    jwtToken: string = '',
  ) {
    const { Name, Phone, Email } = createPaymentLinkDto;
    const Amount = createPaymentLinkDto.Amount * 100;
    const Description =
      Name === 'Изготовление неоновой вывески'
        ? 'Оплата неоновой вывески'
        : 'Оплата фотокниги';

    // Обычная логика создания ссылки на оплату через Tinkoff
    function generateToken(Data): string {
      const hash = createHash('sha256')
        .update(Data.join(''), 'utf8')
        .digest('hex');
      return hash;
    }
    const OrderId = new Date().getTime();
    // console.log(OrderId);

    let TerminalKey = '';
    let password = '';
    if (createPaymentLinkDto.terminal === 'Терминал ИзиБук') {
      TerminalKey = process.env.TB_TERMINAL_BOOK || '';
      password = process.env.TB_TERMINAL_PASSWORD_BOOK || '';
    } else if (createPaymentLinkDto.terminal === 'Терминал Изинеон СБП') {
      TerminalKey = process.env.TB_TERMINAL_SPB || '';
      password = process.env.TB_TERMINAL_PASSWORD_SPB || '';
    } else if (createPaymentLinkDto.terminal === 'Терминал ИзиБук СБП') {
      TerminalKey = process.env.TB_TERMINAL_BOOK_SPB || '';
      password = process.env.TB_TERMINAL_PASSWORD_BOOK_SPB || '';
    } else {
      TerminalKey = process.env.TB_TERMINAL || '';
      password = process.env.TB_TERMINAL_PASSWORD || '';
    }
    // if (
    //   user.role.shortName !== 'G' &&
    //   createPaymentLinkDto.terminal === 'Терминал ИзиБук СБП'
    // ) {
    //   throw new ForbiddenException('У вас нет доступа к этому терминалу');
    // }
    const RedirectDueDate = (() => {
      const dueDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const pad = (value: number) => value.toString().padStart(2, '0');
      const year = dueDate.getFullYear();
      const month = pad(dueDate.getMonth() + 1);
      const day = pad(dueDate.getDate());
      const hours = pad(dueDate.getHours());
      const minutes = pad(dueDate.getMinutes());
      const seconds = pad(dueDate.getSeconds());
      const timezoneOffset = -dueDate.getTimezoneOffset();
      const sign = timezoneOffset >= 0 ? '+' : '-';
      const offsetHours = pad(Math.floor(Math.abs(timezoneOffset) / 60));
      const offsetMinutes = pad(Math.abs(timezoneOffset) % 60);
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
    })();
    // Генерация токена
    const Token = generateToken([
      Amount,
      Description,
      OrderId,
      password,
      RedirectDueDate,
      TerminalKey,
    ]);
    // console.log([Amount, Description, OrderId, password, TerminalKey].join(''));

    const body = {
      TerminalKey, //
      Amount,
      OrderId,
      Description,
      Token,
      RedirectDueDate,
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

    // Извлекаем токен из PaymentURL (например, Sw8PE55H из https://pay.tbank.ru/Sw8PE55H)
    const paymentUrl: string = data.PaymentURL;
    const urlObj = new URL(paymentUrl);
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    const token = pathSegments[pathSegments.length - 1];

    // Отправляем данные в микросервис для сохранения
    const paymentServiceUrl =
      process.env.PAYMENT_SERVICE_URL || 'http://localhost:5001';
    try {
      await axios.post(
        `${paymentServiceUrl}/api/payments/save`,
        {
          token,
          paymentUrl,
          paymentId: data.PaymentId,
          amount: Amount,
          name: Name,
          description: Description,
          email: Email,
          phone: Phone,
          terminal: createPaymentLinkDto.terminal,
        },
        {
          headers: {
            Authorization: `Bearer ${jwtToken}`, // Передаем реальный JWT токен пользователя
          },
        },
      );
    } catch (error) {
      // Логируем ошибку, но не прерываем процесс
      console.error('Ошибка при сохранении в микросервис:', error);
      if (error.response) {
        console.error('Ответ сервера:', error.response.data);
        console.error('Статус:', error.response.status);
      }
    }

    // Для обычной ссылки на оплату возвращаем только ссылку от банка
    // publicLink не возвращается - клиент переходит напрямую на оплату
    return {
      link: data.PaymentURL,
      PaymentId: data.PaymentId,
    };
  }

  async checkPaymentByLink(link: string) {
    // console.log(link);
    const linkEnd = link.split('/').reverse()[0];

    const result = {
      isConfirmed: false,
      message: 'Оплата не подтверждена',
      price: 0,
      paymentId: '',
    };

    try {
      const { data } = await axios.get<{
        status?: { value: string };
        merchant?: { successUrl?: string };
      }>(`https://payapi.tbank.ru/api/v2/pf/sessions/${linkEnd}`);
      // console.log(linkEnd,data);
      if (data.status?.value === 'SUCCESS' && data.merchant?.successUrl) {
        const successUrl = new URL(data.merchant.successUrl);
        const amountParam = successUrl.searchParams.get('Amount');
        const paymentId = successUrl.searchParams.get('PaymentId') ?? '';
        // console.log(data.status);
        if (amountParam) {
          const amount = Number.parseInt(amountParam, 10);
          if (!Number.isNaN(amount)) {
            result.price = amount / 100;
            result.isConfirmed = true;
            result.message = 'Оплата подтверждена';
            result.paymentId = paymentId;
          }
        }
      }

      return result;
    } catch {
      // console.log(error);
      return result;
      throw new NotFoundException(`Ошибка при проверке оплаты`);
    }
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
    // console.log(terminal);
    if (terminal === 'Терминал ИзиБук') {
      TerminalKey = process.env.TB_TERMINAL_BOOK || '';
      password = process.env.TB_TERMINAL_PASSWORD_BOOK || '';
    } else if (terminal === 'Терминал Изинеон СБП') {
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

      // console.log(data);

      return res;
    } catch (error) {
      console.log(error);
      throw new NotFoundException(`Ошибка при проверке оплаты`);
    }
  }

  async delete(id: number, user: UserDto) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException(`Платеж с id ${id} не найден.`);
    }
    // Формируем комментарий для аудита
    const auditComment = `Удалил платеж (${payment.method}) на сумму ${payment.price} руб.`;

    // Создаем запись в аудите
    await this.prisma.dealAudit.create({
      data: {
        dealId: payment.dealId,
        userId: user.id,
        action: 'Создание платежа',
        comment: auditComment,
      },
    });
    return await this.prisma.payment.delete({ where: { id } });
  }

  async getList(
    user: UserDto,
    from: string,
    to: string,
    take: number,
    page: number,
    groupId?: number,
    managersIds?: number[],
  ) {
    const sanitizedTake = Math.max(1, take);
    const sanitizedPage = Math.max(1, page);
    const skip = (sanitizedPage - 1) * sanitizedTake;

    const gSearch = ['ADMIN', 'G', 'KD'].includes(user.role.shortName)
      ? { groupId: { gt: 0 } }
      : ['DO'].includes(user.role.shortName)
        ? { workSpaceId: user.workSpaceId }
        : { groupId: user.groupId };

    const where: Prisma.PaymentWhereInput = {
      date: {
        gte: from,
        lte: to,
      },
      deal: {
        reservation: false,
        deletedAt: null,
        ...(groupId !== undefined && { groupId: groupId }),
      },
    };

    if (managersIds?.length) {
      where.userId = { in: managersIds };
    }

    const finalWhere = groupId !== undefined ? where : { ...where, ...gSearch };

    const [payments, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where: finalWhere,
        skip,
        take: sanitizedTake,
        include: {
          deal: {
            select: {
              title: true,
              saleDate: true,
              reservation: true,
            },
          },
          user: {
            select: {
              fullName: true,
            },
          },
        },
        orderBy: {
          date: 'desc',
        },
      }),
      this.prisma.payment.aggregate({
        where: finalWhere,
        _sum: {
          price: true,
        },
      }),
    ]);

    // console.log(payments.filter((p) =>p.deal.saleDate.startsWith('2025-11')).reduce((a, b) => a + b.price, 0));
    // console.log(payments.filter((p) =>p.deal.saleDate.startsWith('2025-10')).reduce((a, b) => a + b.price, 0));
    // console.log(payments.filter((p) =>p.deal.saleDate.startsWith('2025-09')).reduce((a, b) => a + b.price, 0));
    // console.log('Платежи не подходящие под условия (не 2025-09, 2025-10, 2025-11):');
    // console.log(payments.filter((p) => !p.deal.saleDate.startsWith('2025-11') && !p.deal.saleDate.startsWith('2025-10') && !p.deal.saleDate.startsWith('2025-09')));

    return {
      totalPaymentPrice: Number(total._sum.price ?? 0),
      items: payments.map((payment) => ({
        id: payment.id,
        dealId: payment.dealId,
        method: payment.method,
        price: payment.price,
        dealTitle: payment.deal?.title ?? '',
        dealSaleDate: payment.deal?.saleDate ?? '',
        userFullName: payment.user?.fullName ?? '',
        userId: payment.userId,
        date: payment.date,
        isConfirmed: payment.isConfirmed,
        reservation: payment.deal.reservation,
      })),
    };
  }
}
