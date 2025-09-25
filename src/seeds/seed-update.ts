// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

const BLUESALES_URL =
  process.env.BLUESALES_URL ||
  'https://bluesales.ru/app/Customers/WebServer.aspx';
const BLUESALES_LOGIN = process.env.BLUESALES_LOGIN || 'zapas';
const BLUESALES_PASSWORD =
  process.env.BLUESALES_PASSWORD || 'D6B6E49BBD840126F8D074C1CDBBD218';
const BLUESALES_PAGE_SIZE = parseInt(
  process.env.BLUESALES_PAGE_SIZE || '500',
  10,
);
const BLUESALES_THROTTLE_MS = parseInt(
  process.env.BLUESALES_THROTTLE_MS || '500',
  10,
); // пауза между запросами
const BLUESALES_START_OFFSET = parseInt(
  process.env.BLUESALES_START_OFFSET || '0',
  10,
);

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

function normalizeDotDateToIso(s?: string | null): string {
  if (!s) return '';
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str; // already ISO
  const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

async function getCustomersPage(
  startRowNumber: number,
  pageSize: number,
  fromYmd: string,
  tillYmd: string,
) {
  const params = {
    login: BLUESALES_LOGIN,
    password: BLUESALES_PASSWORD,
    command: 'customers.get',
  };

  const payload = {
    firstContactDateFrom: fromYmd,
    firstContactDateTill: tillYmd,
    ids: null,
    pageSize: String(pageSize),
    startRowNumber: String(startRowNumber),
    vkIds: null,
  };

  const resp = await axios.post(BLUESALES_URL, payload, {
    params,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    timeout: 60_000,
  });
  return resp.data as {
    count: number;
    notReturnedCount: number;
    customers: ApiCustomer[];
  };
}

async function upsertReferenceData(c: ApiCustomer) {
  // Upsert reference tables and return their IDs (overwrite fields if exist)
  const countryId = c.country
    ? (
        await prisma.crmCountry.upsert({
          where: { externalId: String(c.country.id) },
          update: { name: c.country.name },
          create: { externalId: String(c.country.id), name: c.country.name },
        })
      ).id
    : null;

  const cityId = c.city
    ? (
        await prisma.crmCity.upsert({
          where: { externalId: String(c.city.id) },
          update: { name: c.city.name },
          create: { externalId: String(c.city.id), name: c.city.name },
        })
      ).id
    : null;

  const crmStatusId = c.crmStatus
    ? (
        await prisma.crmStatus.upsert({
          where: { externalId: String(c.crmStatus.id) },
          update: {
            name: c.crmStatus.name,
            color: c.crmStatus.color,
            type: c.crmStatus.type,
          },
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
        await prisma.crmSource.upsert({
          where: { externalId: String(c.source.id) },
          update: { name: c.source.name },
          create: { externalId: String(c.source.id), name: c.source.name },
        })
      ).id
    : null;

  const salesChannelId = c.salesChannel
    ? (
        await prisma.crmSalesChannel.upsert({
          where: { externalId: String(c.salesChannel.id) },
          update: {
            name: c.salesChannel.name,
            code: c.salesChannel.code,
          },
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
        await prisma.crmManager.upsert({
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
        await prisma.crmVk.upsert({
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
        await prisma.crmAvito.upsert({
          where: { externalId: String(c.avito.id) },
          update: { name: c.avito.name, chatId: c.avito.chatId || '' },
          create: {
            externalId: String(c.avito.id),
            name: c.avito.name,
            chatId: c.avito.chatId || '',
          },
        })
      ).id
    : null;

  return {
    countryId,
    cityId,
    crmStatusId,
    sourceId,
    salesChannelId,
    managerId,
    vkId,
    avitoId,
  };
}

async function upsertCustomer(c: ApiCustomer) {
  const refs = await upsertReferenceData(c);
  const firstContact = normalizeDotDateToIso(c.firstContactDate);
  const lastContact = normalizeDotDateToIso(c.lastContactDate);
  const nextContact = normalizeDotDateToIso(c.nextContactDate);

  const customer = await prisma.crmCustomer.upsert({
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
    select: { id: true },
  });

  // Tags: ensure tag exists (upsert) and ensure link exists (upsert)
  if (Array.isArray(c.tags) && c.tags.length) {
    for (const t of c.tags) {
      const tag = await prisma.crmTag.upsert({
        where: { externalId: String(t.id) },
        update: {
          name: t.name,
          color: t.color || '',
          textColor: t.textColor || '',
        },
        create: {
          externalId: String(t.id),
          name: t.name,
          color: t.color || '',
          textColor: t.textColor || '',
        },
        select: { id: true },
      });

      await prisma.crmCustomerTag.upsert({
        where: { customerId_tagId: { customerId: customer.id, tagId: tag.id } },
        update: {},
        create: { customerId: customer.id, tagId: tag.id },
      });
    }
  }
}

function addDaysYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const y2 = dt.getUTCFullYear();
  const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d2 = String(dt.getUTCDate()).padStart(2, '0');
  return `${y2}-${m2}-${d2}`;
}

function endOfMonth(ymd: string) {
  const [y, m] = ymd.split('-').map((v) => parseInt(v, 10));
  const last = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of current
  const y2 = last.getUTCFullYear();
  const m2 = String(last.getUTCMonth() + 1).padStart(2, '0');
  const d2 = String(last.getUTCDate()).padStart(2, '0');
  return `${y2}-${m2}-${d2}`;
}

async function importMonth(fromYmd: string, tillYmd: string) {
  let start = BLUESALES_START_OFFSET;
  const pageSize = BLUESALES_PAGE_SIZE;
  let pages = 0;
  let totalImported = 0;
  let retries = 0;
  const maxRetries = 6;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const { notReturnedCount, customers } = await getCustomersPage(
        start,
        pageSize,
        fromYmd,
        tillYmd,
      );

      if (!customers || customers.length === 0) {
        console.log(
          `No customers returned for ${fromYmd}..${tillYmd} at offset ${start}. Stopping this range.`,
        );
        break;
      }

      for (const c of customers) await upsertCustomer(c);

      totalImported += customers.length;
      pages += 1;
      console.log(
        `[${fromYmd}..${tillYmd}] Page ${pages}: +${customers.length}, total ${totalImported}, remaining ~${notReturnedCount}, next offset ${start + customers.length}`,
      );

      start += customers.length;
      retries = 0; // reset on success

      if (notReturnedCount <= 0) break;
      if (BLUESALES_THROTTLE_MS > 0)
        await new Promise((r) => setTimeout(r, BLUESALES_THROTTLE_MS));
    } catch (e: any) {
      retries += 1;
      const delay = Math.min(
        30_000,
        (BLUESALES_THROTTLE_MS || 500) * Math.pow(2, Math.min(retries, 5)),
      );
      const status = e?.response?.status;
      if (status === 400) {
        // Часто 400 у этого API = нет данных в заданном диапазоне.
        if (start === 0) {
          console.warn(
            `400 for range ${fromYmd}..${tillYmd} at offset 0 — вероятно, нет данных. Пропускаю диапазон.`,
          );
          break;
        } else {
          console.warn(
            `400 for range ${fromYmd}..${tillYmd} at offset ${start} — считаю, что достигнут конец данных. Переход к следующему диапазону.`,
          );
          break;
        }
      }
      console.error(
        `Error at offset ${start} for ${fromYmd}..${tillYmd}: ${e?.message || e}. Retry #${retries} in ${delay}ms`,
      );
      if (retries > maxRetries) {
        console.error(
          `Max retries exceeded for ${fromYmd}..${tillYmd} at offset ${start}. Moving to next range.`,
        );
        break;
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function importAllCustomers() {
  const from = process.env.BLUESALES_FULL_FROM || '2023-01-01';
  const till = process.env.BLUESALES_FULL_TILL || '2025-09-28';

  // идём по месяцам, чтобы не упираться в возможные ограничения offset
  let cur = from.slice(0, 7) + '-01';
  while (cur <= till) {
    const monthEnd = endOfMonth(cur);
    const rangeEnd = monthEnd < till ? monthEnd : till;
    console.log(`\n=== Importing range ${cur} .. ${rangeEnd} ===`);
    await importMonth(cur, rangeEnd);
    // следующий месяц: добавим 32 дня и установим на 1-е число
    const next = addDaysYmd(cur, 32).slice(0, 7) + '-01';
    cur = next;
    if (BLUESALES_THROTTLE_MS > 0)
      await new Promise((r) => setTimeout(r, BLUESALES_THROTTLE_MS));
  }
}

async function main() {
  await importAllCustomers();
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
