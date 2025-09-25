import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';

type ApiCustomer = {
  id: number;
  fullName: string;
  photoUrl: string;
  country: { id: number; name: string } | null;
  city: { id: number; name: string } | null;
  birthday: string;
  sex: string;
  vk: { id: string; name: string; messagesGroupId: string } | null;
  ok: any;
  facebook: any;
  instagram: any;
  whatsApp: any;
  telegram: any;
  avito: { id: string; name: string; chatId: string } | null;
  phone: string;
  email: string;
  address: string;
  otherContacts: string;
  crmStatus: { id: number; name: string; color: string; type: number } | null;
  tags: { id: number; name: string; color: string; textColor: string }[];
  firstContactDate: string;
  lastContactDate: string;
  nextContactDate: string;
  source: { id: number; name: string } | null;
  salesChannel: { id: number; code: number; name: string } | null;
  manager: {
    id: number;
    fullName: string;
    email: string;
    login: string;
    phone: string;
    vk: string | null;
    lastLoginDate: string;
    lastActivityDate: string;
    isActive: boolean;
    permissionsSettings: any;
  } | null;
  shortNotes: string;
  comments: string;
  customFields: any[];
};

@Injectable()
export class BluesalesImportService {
  private readonly logger = new Logger(BluesalesImportService.name);

  private readonly url = process.env.BLUESALES_URL || 'https://bluesales.ru/app/Customers/WebServer.aspx';
  private readonly login = process.env.BLUESALES_LOGIN || 'zapas';
  private readonly password = process.env.BLUESALES_PASSWORD || 'D6B6E49BBD840126F8D074C1CDBBD218';
  private readonly pageSize = parseInt(process.env.BLUESALES_PAGE_SIZE || '500', 10);
  private readonly throttleMs = parseInt(process.env.BLUESALES_THROTTLE_MS || '500', 10);

  constructor(private readonly prisma: PrismaService) {}

  private ymdInMoscow(d: Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  private addDaysYmd(ymd: string, days: number) {
    const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    const y2 = dt.getUTCFullYear();
    const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d2 = String(dt.getUTCDate()).padStart(2, '0');
    return `${y2}-${m2}-${d2}`;
  }

  // Convert 'DD.MM.YYYY' -> 'YYYY-MM-DD'; leave 'YYYY-MM-DD' as is; otherwise return '' on falsy
  private normalizeDotDateToIso(s?: string | null): string {
    if (!s) return '';
    const str = String(s).trim();
    // already ISO-like
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    // dot format
    const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      return `${yyyy}-${mm}-${dd}`;
    }
    return '';
  }

  async importRange(fromYmd: string, tillYmd: string) {
    let cur = fromYmd;
    const yesterday = tillYmd;
    while (cur <= yesterday) {
      await this.importDay(cur);
      cur = this.addDaysYmd(cur, 1);
    }
  }

  async importDay(dateYmd: string) {
    let start = 0;
    let totalImported = 0;
    let pages = 0;
    for (;;) {
      const { notReturnedCount, customers } = await this.getCustomersPage(start, this.pageSize, dateYmd, dateYmd);
      if (!customers || customers.length === 0) break;

      for (const c of customers) {
        await this.upsertCustomer(c);
      }

      totalImported += customers.length;
      pages += 1;
      start += customers.length;

      this.logger.log(`Imported day ${dateYmd}: page ${pages}, +${customers.length}, total ${totalImported}, remaining ~${notReturnedCount}`);

      if (notReturnedCount <= 0) break;
      if (this.throttleMs > 0) await new Promise((r) => setTimeout(r, this.throttleMs));
    }
  }

  private async getCustomersPage(startRowNumber: number, pageSize: number, from: string, till: string) {
    const params = { login: this.login, password: this.password, command: 'customers.get' };
    const payload = {
      firstContactDateFrom: from,
      firstContactDateTill: till,
      ids: null,
      pageSize: String(pageSize),
      startRowNumber: String(startRowNumber),
      vkIds: null,
    };
    const resp = await axios.post(this.url, payload, {
      params,
      headers: { 'Content-Type': 'application/json' },
      timeout: 60_000,
    });
    return resp.data as { count: number; notReturnedCount: number; customers: ApiCustomer[] };
  }

  private async upsertReferenceData(c: ApiCustomer) {
    const countryId = c.country
      ? (
          await this.prisma.crmCountry.upsert({
            where: { externalId: String(c.country.id) },
            update: { name: c.country.name },
            create: { externalId: String(c.country.id), name: c.country.name },
          })
        ).id
      : null;

    const cityId = c.city
      ? (
          await this.prisma.crmCity.upsert({
            where: { externalId: String(c.city.id) },
            update: { name: c.city.name },
            create: { externalId: String(c.city.id), name: c.city.name },
          })
        ).id
      : null;

    const crmStatusId = c.crmStatus
      ? (
          await this.prisma.crmStatus.upsert({
            where: { externalId: String(c.crmStatus.id) },
            update: { name: c.crmStatus.name, color: c.crmStatus.color, type: c.crmStatus.type },
            create: {
              externalId: String(c.crmStatus.id),
              name: c.crmStatus.name,
              color: c.crmStatus.color,
              type: c.crmStatus.type,
            },
          })
        ).id
      : null;

    const sourceId = c.source
      ? (
          await this.prisma.crmSource.upsert({
            where: { externalId: String(c.source.id) },
            update: { name: c.source.name },
            create: { externalId: String(c.source.id), name: c.source.name },
          })
        ).id
      : null;

    const salesChannelId = c.salesChannel
      ? (
          await this.prisma.crmSalesChannel.upsert({
            where: { externalId: String(c.salesChannel.id) },
            update: { name: c.salesChannel.name, code: c.salesChannel.code },
            create: {
              externalId: String(c.salesChannel.id),
              name: c.salesChannel.name,
              code: c.salesChannel.code,
            },
          })
        ).id
      : null;

    const managerId = c.manager
      ? (
          await this.prisma.crmManager.upsert({
            where: { externalId: String(c.manager.id) },
            update: {
              fullName: c.manager.fullName,
              email: c.manager.email || '',
              login: c.manager.login || '',
              phone: c.manager.phone || '',
              vk: c.manager.vk || null,
              lastLoginDate: c.manager.lastLoginDate || '',
              lastActivityDate: c.manager.lastActivityDate || '',
              isActive: Boolean(c.manager.isActive),
              permissions: c.manager.permissionsSettings ?? undefined,
            },
            create: {
              externalId: String(c.manager.id),
              fullName: c.manager.fullName,
              email: c.manager.email || '',
              login: c.manager.login || '',
              phone: c.manager.phone || '',
              vk: c.manager.vk || null,
              lastLoginDate: c.manager.lastLoginDate || '',
              lastActivityDate: c.manager.lastActivityDate || '',
              isActive: Boolean(c.manager.isActive),
              permissions: c.manager.permissionsSettings ?? undefined,
            },
          })
        ).id
      : null;

    const vkId = c.vk
      ? (
          await this.prisma.crmVk.upsert({
            where: { externalId: String(c.vk.id) },
            update: { name: c.vk.name, messagesGroupId: c.vk.messagesGroupId || '' },
            create: {
              externalId: String(c.vk.id),
              name: c.vk.name,
              messagesGroupId: c.vk.messagesGroupId || '',
            },
          })
        ).id
      : null;

    const avitoId = c.avito
      ? (
          await this.prisma.crmAvito.upsert({
            where: { externalId: String(c.avito.id) },
            update: { name: c.avito.name, chatId: c.avito.chatId || '' },
            create: { externalId: String(c.avito.id), name: c.avito.name, chatId: c.avito.chatId || '' },
          })
        ).id
      : null;

    return { countryId, cityId, crmStatusId, sourceId, salesChannelId, managerId, vkId, avitoId };
  }

  private async upsertCustomer(c: ApiCustomer) {
    const refs = await this.upsertReferenceData(c);
    const firstContact = this.normalizeDotDateToIso(c.firstContactDate);
    const lastContact = this.normalizeDotDateToIso(c.lastContactDate);
    const nextContact = this.normalizeDotDateToIso(c.nextContactDate);
    const customer = await this.prisma.crmCustomer.upsert({
      where: { externalId: String(c.id) },
      update: {
        fullName: c.fullName,
        photoUrl: c.photoUrl || '',
        birthday: c.birthday || '',
        sex: c.sex || '',
        phone: c.phone || '',
        email: c.email || '',
        address: c.address || '',
        otherContacts: c.otherContacts || '',
        firstContactDate: firstContact,
        lastContactDate: lastContact,
        nextContactDate: nextContact,
        shortNotes: c.shortNotes || '',
        comments: c.comments || '',
        countryId: refs.countryId,
        cityId: refs.cityId,
        crmStatusId: refs.crmStatusId,
        sourceId: refs.sourceId,
        salesChannelId: refs.salesChannelId,
        managerId: refs.managerId,
        vkId: refs.vkId,
        avitoId: refs.avitoId,
      },
      create: {
        externalId: String(c.id),
        fullName: c.fullName,
        photoUrl: c.photoUrl || '',
        birthday: c.birthday || '',
        sex: c.sex || '',
        phone: c.phone || '',
        email: c.email || '',
        address: c.address || '',
        otherContacts: c.otherContacts || '',
        firstContactDate: firstContact,
        lastContactDate: lastContact,
        nextContactDate: nextContact,
        shortNotes: c.shortNotes || '',
        comments: c.comments || '',
        countryId: refs.countryId ?? undefined,
        cityId: refs.cityId ?? undefined,
        crmStatusId: refs.crmStatusId ?? undefined,
        sourceId: refs.sourceId ?? undefined,
        salesChannelId: refs.salesChannelId ?? undefined,
        managerId: refs.managerId ?? undefined,
        vkId: refs.vkId ?? undefined,
        avitoId: refs.avitoId ?? undefined,
      },
    });

    if (Array.isArray(c.tags) && c.tags.length) {
      for (const t of c.tags) {
        const tag = await this.prisma.crmTag.upsert({
          where: { externalId: String(t.id) },
          update: { name: t.name, color: t.color || '', textColor: t.textColor || '' },
          create: { externalId: String(t.id), name: t.name, color: t.color || '', textColor: t.textColor || '' },
        });
        await this.prisma.crmCustomerTag.upsert({
          where: { customerId_tagId: { customerId: customer.id, tagId: tag.id } },
          update: {},
          create: { customerId: customer.id, tagId: tag.id },
        });
      }
    }
  }
}
