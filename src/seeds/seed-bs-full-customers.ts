import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

const BLUESALES_URL =
  process.env.BLUESALES_URL ||
  'https://bluesales.ru/app/Customers/WebServer.aspx';
const BLUESALES_LOGIN = process.env.BLUESALES_LOGIN;
const BLUESALES_PASSWORD = process.env.BLUESALES_PASSWORD;

const BLUESALES_PAGE_SIZE = parseInt(
  process.env.BLUESALES_PAGE_SIZE || '500',
  10,
);
const BLUESALES_THROTTLE_MS = parseInt(
  process.env.BLUESALES_THROTTLE_MS || '500',
  10,
);
const BLUESALES_START_OFFSET = parseInt(
  process.env.BLUESALES_START_OFFSET || '0',
  10,
);
const BLUESALES_MAX_RETRIES = parseInt(
  process.env.BLUESALES_MAX_RETRIES || '6',
  10,
);

function ymdInMoscow(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

const BLUESALES_FULL_FROM = process.env.BLUESALES_FULL_FROM || '2023-01-01';
const BLUESALES_FULL_TILL =
  process.env.BLUESALES_FULL_TILL || ymdInMoscow(new Date());

type ApiCustomer = {
  id: number;
  fullName: string;
  photoUrl: string;
  country: { id: number; name: string } | null;
  city: { id: number; name: string } | null;
  birthday: string;
  sex: string;
  vk: { id: string; name: string; messagesGroupId: string } | null;
  ok: unknown;
  facebook: unknown;
  instagram: unknown;
  whatsApp: unknown;
  telegram: unknown;
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
  customFields: unknown[];
};

function normalizeDotDateToIso(s?: string | null): string {
  if (!s) return '';
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const y2 = dt.getUTCFullYear();
  const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d2 = String(dt.getUTCDate()).padStart(2, '0');
  return `${y2}-${m2}-${d2}`;
}

function endOfMonth(ymd: string): string {
  const [y, m] = ymd.split('-').map((v) => parseInt(v, 10));
  const last = new Date(Date.UTC(y, m, 0));
  const y2 = last.getUTCFullYear();
  const m2 = String(last.getUTCMonth() + 1).padStart(2, '0');
  const d2 = String(last.getUTCDate()).padStart(2, '0');
  return `${y2}-${m2}-${d2}`;
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
          update: {
            name: c.vk.name,
            messagesGroupId: c.vk.messagesGroupId || '',
          },
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

async function syncCustomerTags(customerId: number, tags: ApiCustomer['tags']) {
  if (!Array.isArray(tags) || tags.length === 0) {
    await prisma.crmCustomerTag.deleteMany({ where: { customerId } });
    return;
  }

  const desiredTagIds = new Set<number>();

  for (const t of tags) {
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

    desiredTagIds.add(tag.id);

    await prisma.crmCustomerTag.upsert({
      where: { customerId_tagId: { customerId, tagId: tag.id } },
      update: {},
      create: { customerId, tagId: tag.id },
    });
  }

  await prisma.crmCustomerTag.deleteMany({
    where: {
      customerId,
      tagId: { notIn: Array.from(desiredTagIds) },
    },
  });
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

  await syncCustomerTags(customer.id, c.tags);
}

async function importMonth(fromYmd: string, tillYmd: string) {
  let start = BLUESALES_START_OFFSET;
  const pageSize = BLUESALES_PAGE_SIZE;
  let pages = 0;
  let totalImported = 0;
  let retries = 0;

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
          `No customers returned for ${fromYmd}..${tillYmd} at offset ${start}. Stop range.`,
        );
        break;
      }

      for (const c of customers) {
        await upsertCustomer(c);
      }

      totalImported += customers.length;
      pages += 1;
      retries = 0;

      console.log(
        `[${fromYmd}..${tillYmd}] page ${pages}: +${customers.length}, total=${totalImported}, remaining~${notReturnedCount}, nextOffset=${start + customers.length}`,
      );

      start += customers.length;

      if (notReturnedCount <= 0) break;

      if (BLUESALES_THROTTLE_MS > 0) {
        await new Promise((r) => setTimeout(r, BLUESALES_THROTTLE_MS));
      }
    } catch (e: any) {
      retries += 1;
      const status = e?.response?.status;
      const delay = Math.min(
        30_000,
        (BLUESALES_THROTTLE_MS || 500) * Math.pow(2, Math.min(retries, 5)),
      );

      if (status === 400) {
        if (start === 0) {
          console.warn(
            `400 for ${fromYmd}..${tillYmd} at offset 0 (likely empty range). Skip range.`,
          );
        } else {
          console.warn(
            `400 for ${fromYmd}..${tillYmd} at offset ${start} (likely end of range). Continue next range.`,
          );
        }
        break;
      }

      console.error(
        `Error for ${fromYmd}..${tillYmd} at offset ${start}: ${e?.message || e}. Retry ${retries}/${BLUESALES_MAX_RETRIES} in ${delay}ms`,
      );

      if (retries > BLUESALES_MAX_RETRIES) {
        console.error(
          `Retries exhausted for ${fromYmd}..${tillYmd} at offset ${start}. Continue next range.`,
        );
        break;
      }

      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function importAllCustomers() {
  let cur = BLUESALES_FULL_FROM.slice(0, 7) + '-01';

  while (cur <= BLUESALES_FULL_TILL) {
    const monthEnd = endOfMonth(cur);
    const rangeEnd = monthEnd < BLUESALES_FULL_TILL ? monthEnd : BLUESALES_FULL_TILL;

    console.log(`\n=== Import range ${cur}..${rangeEnd} ===`);
    await importMonth(cur, rangeEnd);

    cur = addDaysYmd(cur, 32).slice(0, 7) + '-01';

    if (BLUESALES_THROTTLE_MS > 0) {
      await new Promise((r) => setTimeout(r, BLUESALES_THROTTLE_MS));
    }
  }
}

async function main() {
  if (!BLUESALES_LOGIN || !BLUESALES_PASSWORD) {
    throw new Error('BLUESALES_LOGIN and BLUESALES_PASSWORD are required');
  }

  console.log(
    `Start full customers import: ${BLUESALES_FULL_FROM}..${BLUESALES_FULL_TILL}, pageSize=${BLUESALES_PAGE_SIZE}`,
  );

  await importAllCustomers();

  console.log('Full customers import completed');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
