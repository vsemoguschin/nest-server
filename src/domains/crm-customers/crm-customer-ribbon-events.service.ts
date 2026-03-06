import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { BlueSalesCustomerPageService } from '../../integrations/bluesales/bluesales-customer-page.service';
import {
  BlueSalesRibbonEventsParser,
  CrmCustomerRibbonEventsResponse,
} from '../../integrations/bluesales/bluesales-ribbon-events.parser';

@Injectable()
export class CrmCustomerRibbonEventsService {
  private readonly logger = new Logger(CrmCustomerRibbonEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blueSalesCustomerPageService: BlueSalesCustomerPageService,
    private readonly blueSalesRibbonEventsParser: BlueSalesRibbonEventsParser,
  ) {}

  private logInfo(event: string, payload: Record<string, unknown>) {
    this.logger.log(
      JSON.stringify({
        scope: 'crm-customer-ribbon-events',
        level: 'info',
        event,
        ...payload,
      }),
    );
  }

  private logWarn(event: string, payload: Record<string, unknown>) {
    this.logger.warn(
      JSON.stringify({
        scope: 'crm-customer-ribbon-events',
        level: 'warn',
        event,
        ...payload,
      }),
    );
  }

  async getRibbonEvents(
    customerId: number,
    requestedCountRaw?: unknown,
  ): Promise<CrmCustomerRibbonEventsResponse> {
    const requestedCount = this.normalizeCount(requestedCountRaw);
    const customer = await this.prisma.crmCustomer.findFirst({
      where: { id: customerId },
      select: {
        id: true,
        externalId: true,
        account: {
          select: {
            code: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('CRM-клиент не найден');
    }

    const accountCode = customer.account?.code?.trim().toLowerCase();
    if (!accountCode) {
      throw new BadRequestException('У клиента не указан CRM-аккаунт');
    }

    const externalId = customer.externalId?.trim();
    if (!externalId) {
      throw new BadRequestException('У клиента не указан externalId BlueSales');
    }

    if (!this.blueSalesCustomerPageService.hasCredentials(accountCode)) {
      this.logWarn('credentials.skipped', {
        customerId,
        externalId,
        accountCode,
        requestedCount,
      });

      return {
        items: [],
        requestedCount,
        nextCount: null,
        hasMore: false,
      };
    }

    const html = await this.blueSalesCustomerPageService.fetchCustomerPageHtml(
      accountCode,
      externalId,
      requestedCount,
    );

    const parsed = this.blueSalesRibbonEventsParser.parse(html, requestedCount);

    if (parsed.items.length === 0) {
      this.logWarn('parser.empty', {
        customerId,
        externalId,
        accountCode,
        requestedCount,
        parsedItemsCount: parsed.items.length,
        hasMore: parsed.hasMore,
        nextCount: parsed.nextCount,
      });
    } else {
      this.logInfo('parser.result', {
        customerId,
        externalId,
        accountCode,
        requestedCount,
        parsedItemsCount: parsed.items.length,
        hasMore: parsed.hasMore,
        nextCount: parsed.nextCount,
      });
    }

    if (
      parsed.hasMore &&
      parsed.nextCount !== null &&
      parsed.items.length < Math.min(requestedCount, 30)
    ) {
      this.logWarn('pagination.inconsistent', {
        customerId,
        externalId,
        accountCode,
        requestedCount,
        parsedItemsCount: parsed.items.length,
        hasMore: parsed.hasMore,
        nextCount: parsed.nextCount,
      });
    }

    return parsed;
  }

  private normalizeCount(rawValue: unknown) {
    const rawString =
      typeof rawValue === 'string'
        ? rawValue
        : typeof rawValue === 'number'
          ? String(rawValue)
          : '';

    const parsed = Number.parseInt(rawString || '30', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('Некорректный параметр count');
    }

    if (parsed > 300) {
      throw new BadGatewayException(
        'Слишком большой count для ленты событий BlueSales',
      );
    }

    return parsed;
  }
}
