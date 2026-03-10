import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';

type BlueSalesApiCustomer = {
  id: number | string;
  fullName?: string | null;
  photoUrl?: string | null;
  country?: { id: number | string; name: string | null } | null;
  city?: { id: number | string; name: string | null } | null;
  birthday?: string | null;
  sex?: string | null;
  vk?:
    | {
        id: string | number;
        name: string | null;
        messagesGroupId?: string | number | null;
        groupId?: string | number | null;
      }
    | null;
  ok?: unknown;
  facebook?: unknown;
  instagram?: unknown;
  whatsApp?: unknown;
  telegram?: unknown;
  avito?:
    | { id: string | number; name: string | null; chatId: string | null }
    | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  otherContacts?: string | null;
  crmStatus?:
    | {
        id: number | string;
        name: string | null;
        color: string | null;
        type?: number | string | null;
      }
    | null;
  crmStatusChangedDate?: string | null;
  tags?:
    | {
        id: number | string;
        name: string | null;
        color: string | null;
        textColor: string | null;
      }[]
    | null;
  firstContactDate?: string | null;
  lastContactDate?: string | null;
  nextContactDate?: string | null;
  source?: { id: number | string; name: string | null } | null;
  salesChannel?:
    | { id: number | string; code?: number | string | null; name: string | null }
    | null;
  manager?: {
    id: number | string;
    fullName: string | null;
    email: string | null;
    login: string | null;
    phone: string | null;
    vk: string | null;
    lastLoginDate: string | null;
    lastActivityDate: string | null;
    isActive: boolean | null;
    permissionsSettings?: unknown;
    permissions?: unknown;
  } | null;
  shortNotes?: string | null;
  comments?: string | null;
  customFields?: unknown[] | null;
};

type BlueSalesSingleCustomerResponse = {
  customer: BlueSalesApiCustomer;
  count: number;
  notReturnedCount: number;
};

type CrmCustomerBlueSalesDetails = {
  id: number;
  externalId: string;
  fullName: string;
  photoUrl: string;
  firstContactDate: string;
  lastContactDate: string;
  nextContactDate: string;
  cityName: string;
  crmStatusName: string;
  crmStatusColor: string;
  crmTags: Array<{
    id: number;
    name: string;
    color: string;
    textColor: string;
  }>;
  sourceName: string;
  salesChannelName: string;
  managerName: string;
  vkExternalId: string;
  accountId: number | null;
  countryId: number | null;
  cityId: number | null;
  crmStatusId: number | null;
  sourceId: number | null;
  salesChannelId: number | null;
  managerId: number | null;
  tagIds: number[];
  accountName: string;
  accountCode: string;
  birthday: string;
  sex: string;
  phone: string;
  email: string;
  address: string;
  otherContacts: string;
  shortNotes: string;
  comments: string;
  countryName: string;
  vkName: string;
  vkMessagesGroupId: string;
  avitoExternalId: string;
  avitoName: string;
  avitoChatId: string;
};

@Injectable()
export class CrmCustomerBlueSalesService {
  private readonly logger = new Logger(CrmCustomerBlueSalesService.name);
  private readonly url: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.url =
      this.config.get<string>('BLUESALES_URL') ||
      'https://bluesales.ru/app/Customers/WebServer.aspx';
  }

  private toIntOrDefault(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.trunc(parsed);
  }

  private normalizeApiResponse(data: unknown) {
    const payload = data as Record<string, any>;
    const customersRaw =
      (Array.isArray(payload?.customers) ? payload.customers : null) ||
      (Array.isArray(payload?.items) ? payload.items : null) ||
      (Array.isArray(payload?.result?.customers) ? payload.result.customers : null) ||
      (Array.isArray(payload?.result?.items) ? payload.result.items : null) ||
      [];

    const count = this.toIntOrDefault(
      payload?.count ??
        payload?.totalCount ??
        payload?.result?.count ??
        customersRaw.length,
      customersRaw.length,
    );

    const notReturnedCount = this.toIntOrDefault(
      payload?.notReturnedCount ??
        payload?.remainingCount ??
        payload?.result?.notReturnedCount ??
        Math.max(count - customersRaw.length, 0),
      0,
    );

    return {
      count,
      notReturnedCount,
      customers: customersRaw as BlueSalesApiCustomer[],
    };
  }

  private normalizeAccountCode(accountCode: string) {
    return accountCode.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  }

  private resolveCredentials(accountCode: string) {
    const suffix = this.normalizeAccountCode(accountCode);
    const login = (
      this.config.get<string>(`BLUESALES_LOGIN_${suffix}`) ||
      this.config.get<string>('BLUESALES_LOGIN') ||
      ''
    ).trim();
    const password = (
      this.config.get<string>(`BLUESALES_PASSWORD_${suffix}`) ||
      this.config.get<string>('BLUESALES_PASSWORD') ||
      ''
    ).trim();

    if (!login || !password) {
      return null;
    }

    return { login, password };
  }

  private toStringOrEmpty(value: unknown) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private toNullableInt(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  private mapCustomerDetails(
    crmCustomer: {
      id: number;
      externalId: string | null;
      accountId: number | null;
      countryId: number | null;
      cityId: number | null;
      crmStatusId: number | null;
      sourceId: number | null;
      salesChannelId: number | null;
      managerId: number | null;
      account: { code: string | null; name: string | null } | null;
    },
    blueSalesCustomer: BlueSalesApiCustomer,
  ): CrmCustomerBlueSalesDetails {
    const crmTags = (blueSalesCustomer.tags || []).map((tag) => ({
      id: this.toNullableInt(tag?.id) ?? 0,
      name: this.toStringOrEmpty(tag?.name),
      color: this.toStringOrEmpty(tag?.color),
      textColor: this.toStringOrEmpty(tag?.textColor),
    }));

    return {
      id: crmCustomer.id,
      externalId: this.toStringOrEmpty(crmCustomer.externalId),
      fullName: this.toStringOrEmpty(blueSalesCustomer.fullName),
      photoUrl: this.toStringOrEmpty(blueSalesCustomer.photoUrl),
      firstContactDate: this.toStringOrEmpty(blueSalesCustomer.firstContactDate),
      lastContactDate: this.toStringOrEmpty(blueSalesCustomer.lastContactDate),
      nextContactDate: this.toStringOrEmpty(blueSalesCustomer.nextContactDate),
      cityName: this.toStringOrEmpty(blueSalesCustomer.city?.name),
      crmStatusName: this.toStringOrEmpty(blueSalesCustomer.crmStatus?.name),
      crmStatusColor: this.toStringOrEmpty(blueSalesCustomer.crmStatus?.color),
      crmTags,
      sourceName: this.toStringOrEmpty(blueSalesCustomer.source?.name),
      salesChannelName: this.toStringOrEmpty(blueSalesCustomer.salesChannel?.name),
      managerName: this.toStringOrEmpty(blueSalesCustomer.manager?.fullName),
      vkExternalId: this.toStringOrEmpty(blueSalesCustomer.vk?.id),
      accountId: crmCustomer.accountId ?? null,
      crmStatusId:
        this.toNullableInt(blueSalesCustomer.crmStatus?.id) ??
        crmCustomer.crmStatusId ??
        null,
      sourceId:
        this.toNullableInt(blueSalesCustomer.source?.id) ??
        crmCustomer.sourceId ??
        null,
      salesChannelId:
        this.toNullableInt(blueSalesCustomer.salesChannel?.id) ??
        crmCustomer.salesChannelId ??
        null,
      managerId:
        this.toNullableInt(blueSalesCustomer.manager?.id) ??
        crmCustomer.managerId ??
        null,
      countryId:
        this.toNullableInt(blueSalesCustomer.country?.id) ??
        crmCustomer.countryId ??
        null,
      cityId:
        this.toNullableInt(blueSalesCustomer.city?.id) ??
        crmCustomer.cityId ??
        null,
      tagIds: crmTags.map((tag) => tag.id).filter((id) => id > 0),
      accountName: this.toStringOrEmpty(crmCustomer.account?.name),
      accountCode: this.toStringOrEmpty(crmCustomer.account?.code),
      birthday: this.toStringOrEmpty(blueSalesCustomer.birthday),
      sex: this.toStringOrEmpty(blueSalesCustomer.sex),
      phone: this.toStringOrEmpty(blueSalesCustomer.phone),
      email: this.toStringOrEmpty(blueSalesCustomer.email),
      address: this.toStringOrEmpty(blueSalesCustomer.address),
      otherContacts: this.toStringOrEmpty(blueSalesCustomer.otherContacts),
      shortNotes: this.toStringOrEmpty(blueSalesCustomer.shortNotes),
      comments: this.toStringOrEmpty(blueSalesCustomer.comments),
      countryName: this.toStringOrEmpty(blueSalesCustomer.country?.name),
      vkName: this.toStringOrEmpty(blueSalesCustomer.vk?.name),
      vkMessagesGroupId: this.toStringOrEmpty(
        blueSalesCustomer.vk?.messagesGroupId ??
          blueSalesCustomer.vk?.groupId,
      ),
      avitoExternalId: this.toStringOrEmpty(blueSalesCustomer.avito?.id),
      avitoName: this.toStringOrEmpty(blueSalesCustomer.avito?.name),
      avitoChatId: this.toStringOrEmpty(blueSalesCustomer.avito?.chatId),
    };
  }

  async getCustomerByCrmId(
    customerId: number,
  ): Promise<CrmCustomerBlueSalesDetails> {
    const customer = await this.prisma.crmCustomer.findFirst({
      where: { id: customerId },
      select: {
        id: true,
        externalId: true,
        accountId: true,
        countryId: true,
        cityId: true,
        crmStatusId: true,
        sourceId: true,
        salesChannelId: true,
        managerId: true,
        account: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('CRM-клиент не найден');
    }

    const externalId = String(customer.externalId || '').trim();
    if (!externalId) {
      throw new BadRequestException('У клиента не указан externalId BlueSales');
    }

    const accountCode = String(customer.account?.code || '').trim().toLowerCase();
    if (!accountCode) {
      throw new BadRequestException('У клиента не указан CRM-аккаунт');
    }

    const credentials = this.resolveCredentials(accountCode);
    if (!credentials) {
      throw new BadGatewayException(
        `Не заданы credentials BlueSales для account=${accountCode}`,
      );
    }

    const params = {
      login: credentials.login,
      password: credentials.password,
      command: 'customers.get',
    };

    const payload = {
      firstContactDateFrom: null,
      firstContactDateTill: null,
      ids: externalId,
      pageSize: '1',
      startRowNumber: '0',
      vkIds: null,
    };

    const response = await axios.post(this.url, payload, {
      params,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      timeout: 60_000,
    });

    const normalized = this.normalizeApiResponse(response.data);
    const matchedCustomer =
      normalized.customers.find((item) => String(item.id ?? '').trim() === externalId) ||
      normalized.customers[0] ||
      null;

    this.logger.log(
      JSON.stringify({
        scope: 'crm-customer-bluesales',
        level: 'info',
        event: 'customer.loaded',
        customerId,
        externalId,
        accountCode,
        count: normalized.count,
        notReturnedCount: normalized.notReturnedCount,
        receivedCustomers: normalized.customers.length,
      }),
    );

    if (!matchedCustomer) {
      throw new NotFoundException('Клиент не найден в BlueSales');
    }

    return this.mapCustomerDetails(customer, matchedCustomer);
  }
}
