import { PrismaClient } from '@prisma/client';
import axios from 'axios';

/*
 * Запуск через .env:
 * npm run seed:bs-full-customers
 *
 * Запуск с явными параметрами:
 * npm run seed:bs-full-customers -- --account-code easybook --login YOUR_LOGIN --password YOUR_PASSWORD
 *
 * Дополнительные параметры:
 * --account-name "ИзиБук"
 * --url https://bluesales.ru/app/Customers/WebServer.aspx
 * --from 2023-01-01
 * --till 2026-03-06
 * --page-size 500
 * --throttle-ms 500
 * --start-offset 0
 * --max-retries 6
 * --drop
 *
 * Если параметр не передан, используется значение из переменных окружения.
 */
const prisma = new PrismaClient();

function getCliArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find(
    (item) => item === `--${name}` || item.startsWith(prefix),
  );

  if (!arg) return undefined;
  if (arg === `--${name}`) {
    const index = process.argv.indexOf(arg);
    const nextValue = process.argv[index + 1];
    if (!nextValue || nextValue.startsWith('--')) return undefined;
    return nextValue;
  }

  return arg.slice(prefix.length);
}

const BLUESALES_URL =
  getCliArg('url') ||
  process.env.BLUESALES_URL ||
  'https://bluesales.ru/app/Customers/WebServer.aspx';
const BLUESALES_LOGIN = getCliArg('login') || process.env.BLUESALES_LOGIN;
const BLUESALES_PASSWORD =
  getCliArg('password') || process.env.BLUESALES_PASSWORD;
const BLUESALES_ACCOUNT_CODE =
  getCliArg('account-code') || process.env.BLUESALES_ACCOUNT_CODE || 'main';
const BLUESALES_ACCOUNT_NAME =
  getCliArg('account-name') ||
  process.env.BLUESALES_ACCOUNT_NAME ||
  (BLUESALES_ACCOUNT_CODE === 'easybook'
    ? 'ИзиБук'
    : BLUESALES_ACCOUNT_CODE === 'easyneon'
      ? 'ИзиНеон'
      : `BlueSales ${BLUESALES_ACCOUNT_CODE}`);

const BLUESALES_PAGE_SIZE = parseInt(
  getCliArg('page-size') || process.env.BLUESALES_PAGE_SIZE || '500',
  10,
);
const BLUESALES_THROTTLE_MS = parseInt(
  getCliArg('throttle-ms') || process.env.BLUESALES_THROTTLE_MS || '500',
  10,
);
const BLUESALES_START_OFFSET = parseInt(
  getCliArg('start-offset') || process.env.BLUESALES_START_OFFSET || '0',
  10,
);
const BLUESALES_MAX_RETRIES = parseInt(
  getCliArg('max-retries') || process.env.BLUESALES_MAX_RETRIES || '6',
  10,
);
const SCRIPT_STARTED_AT_MS = Date.now();

const CRM_TRUNCATE_TABLES = [
  'CrmCustomer',
  'CrmCountry',
  'CrmCity',
  'CrmStatus',
  'CrmSource',
  'CrmSalesChannel',
  'CrmManager',
  'CrmVk',
  'CrmAvito',
  'CrmTag',
  'CrmCustomerTag',
  'CrmSyncState',
] as const;

function parseBooleanFlag(v?: string): boolean {
  if (!v) return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(v.trim().toLowerCase());
}

const SHOULD_DROP_BEFORE_IMPORT =
  parseBooleanFlag(process.env.BLUESALES_DROP_BEFORE_IMPORT) ||
  process.argv.includes('--drop');

function ymdInMoscow(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

const BLUESALES_FULL_FROM =
  getCliArg('from') || process.env.BLUESALES_FULL_FROM || '2023-01-01';
const BLUESALES_FULL_TILL =
  getCliArg('till') || process.env.BLUESALES_FULL_TILL || ymdInMoscow(new Date());
let cachedAccountId: number | null = null;

type ApiCustomer = {
  id: number | string;
  fullName?: string | null;
  photoUrl?: string | null;
  country?: { id: number | string; name: string | null } | null;
  city?: { id: number | string; name: string | null } | null;
  birthday?: string | null;
  sex?: string | null;
  vk:
    | {
        id: string | number;
        name: string | null;
        messagesGroupId?: string | number | null;
        groupId?: string | number | null;
      }
    | null;
  ok: unknown;
  facebook: unknown;
  instagram: unknown;
  whatsApp: unknown;
  telegram: unknown;
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
    permissionsSettings: any;
    permissions?: any;
  } | null;
  shortNotes?: string | null;
  comments?: string | null;
  customFields?: unknown[] | null;
};

function toStringOrEmpty(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toIntOrDefault(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function toExternalId(value: unknown): string | null {
  const v = toStringOrEmpty(value);
  return v ? v : null;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function normalizeApiResponse(data: any): {
  count: number;
  notReturnedCount: number;
  customers: ApiCustomer[];
} {
  const customersRaw =
    (Array.isArray(data?.customers) ? data.customers : null) ||
    (Array.isArray(data?.items) ? data.items : null) ||
    (Array.isArray(data?.result?.customers) ? data.result.customers : null) ||
    (Array.isArray(data?.result?.items) ? data.result.items : null) ||
    [];

  const count = toIntOrDefault(
    data?.count ?? data?.totalCount ?? data?.result?.count ?? customersRaw.length,
    customersRaw.length,
  );

  const notReturnedCount = toIntOrDefault(
    data?.notReturnedCount ??
      data?.remainingCount ??
      data?.result?.notReturnedCount ??
      Math.max(count - customersRaw.length, 0),
    0,
  );

  return {
    count,
    notReturnedCount,
    customers: customersRaw as ApiCustomer[],
  };
}

async function resolveAccountId(): Promise<number> {
  if (Number.isInteger(cachedAccountId) && cachedAccountId! > 0) {
    return cachedAccountId!;
  }

  const account = await prisma.crmAccount.upsert({
    where: { code: BLUESALES_ACCOUNT_CODE },
    update: {
      isActive: true,
    },
    create: {
      code: BLUESALES_ACCOUNT_CODE,
      name: BLUESALES_ACCOUNT_NAME,
      isActive: true,
    },
    select: { id: true },
  });

  cachedAccountId = account.id;
  return account.id;
}

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

  return normalizeApiResponse(resp.data);
}

async function upsertReferenceData(c: ApiCustomer, accountId: number) {
  const countryExternalId = toExternalId(c.country?.id);
  const countryId = countryExternalId
    ? (
        await prisma.crmCountry.upsert({
          where: { externalId: countryExternalId },
          update: { name: toStringOrEmpty(c.country?.name), accountId },
          create: {
            accountId,
            externalId: countryExternalId,
            name: toStringOrEmpty(c.country?.name),
          },
        })
      ).id
    : null;

  const cityExternalId = toExternalId(c.city?.id);
  const cityId = cityExternalId
    ? (
        await prisma.crmCity.upsert({
          where: { externalId: cityExternalId },
          update: { name: toStringOrEmpty(c.city?.name), accountId },
          create: {
            accountId,
            externalId: cityExternalId,
            name: toStringOrEmpty(c.city?.name),
          },
        })
      ).id
    : null;

  const crmStatusExternalId = toExternalId(c.crmStatus?.id);
  const crmStatusId = crmStatusExternalId
    ? (
        await prisma.crmStatus.upsert({
          where: { externalId: crmStatusExternalId },
          update: {
            name: toStringOrEmpty(c.crmStatus?.name),
            color: toStringOrEmpty(c.crmStatus?.color),
            type: toIntOrDefault(c.crmStatus?.type, 0),
            accountId,
          },
          create: {
            accountId,
            externalId: crmStatusExternalId,
            name: toStringOrEmpty(c.crmStatus?.name),
            color: toStringOrEmpty(c.crmStatus?.color),
            type: toIntOrDefault(c.crmStatus?.type, 0),
          },
        })
      ).id
    : null;

  const sourceExternalId = toExternalId(c.source?.id);
  const sourceId = sourceExternalId
    ? (
        await prisma.crmSource.upsert({
          where: { externalId: sourceExternalId },
          update: { name: toStringOrEmpty(c.source?.name), accountId },
          create: {
            accountId,
            externalId: sourceExternalId,
            name: toStringOrEmpty(c.source?.name),
          },
        })
      ).id
    : null;

  const salesChannelExternalId = toExternalId(c.salesChannel?.id);
  const salesChannelId = salesChannelExternalId
    ? (
        await prisma.crmSalesChannel.upsert({
          where: { externalId: salesChannelExternalId },
          update: {
            name: toStringOrEmpty(c.salesChannel?.name),
            code: toIntOrDefault(c.salesChannel?.code, 0),
            accountId,
          },
          create: {
            accountId,
            externalId: salesChannelExternalId,
            name: toStringOrEmpty(c.salesChannel?.name),
            code: toIntOrDefault(c.salesChannel?.code, 0),
          },
        })
      ).id
    : null;

  const managerExternalId = toExternalId(c.manager?.id);
  const managerId = managerExternalId
    ? (
        await prisma.crmManager.upsert({
          where: { externalId: managerExternalId },
          update: {
            fullName: toStringOrEmpty(c.manager?.fullName),
            email: toStringOrEmpty(c.manager?.email),
            login: toStringOrEmpty(c.manager?.login),
            phone: toStringOrEmpty(c.manager?.phone),
            vk: c.manager?.vk || null,
            lastLoginDate: toStringOrEmpty(c.manager?.lastLoginDate),
            lastActivityDate: toStringOrEmpty(c.manager?.lastActivityDate),
            isActive: Boolean(c.manager?.isActive),
            permissions:
              c.manager?.permissionsSettings ?? c.manager?.permissions ?? undefined,
            accountId,
          },
          create: {
            accountId,
            externalId: managerExternalId,
            fullName: toStringOrEmpty(c.manager?.fullName),
            email: toStringOrEmpty(c.manager?.email),
            login: toStringOrEmpty(c.manager?.login),
            phone: toStringOrEmpty(c.manager?.phone),
            vk: c.manager?.vk || null,
            lastLoginDate: toStringOrEmpty(c.manager?.lastLoginDate),
            lastActivityDate: toStringOrEmpty(c.manager?.lastActivityDate),
            isActive: Boolean(c.manager?.isActive),
            permissions:
              c.manager?.permissionsSettings ?? c.manager?.permissions ?? undefined,
          },
        })
      ).id
    : null;

  const vkExternalId = toExternalId(c.vk?.id);
  const vkId = vkExternalId
    ? (
        await prisma.crmVk.upsert({
          where: { externalId: vkExternalId },
          update: {
            name: toStringOrEmpty(c.vk?.name),
            messagesGroupId: toStringOrEmpty(
              c.vk?.messagesGroupId ?? c.vk?.groupId,
            ),
            accountId,
          },
          create: {
            accountId,
            externalId: vkExternalId,
            name: toStringOrEmpty(c.vk?.name),
            messagesGroupId: toStringOrEmpty(
              c.vk?.messagesGroupId ?? c.vk?.groupId,
            ),
          },
        })
      ).id
    : null;

  const avitoExternalId = toExternalId(c.avito?.id);
  const avitoId = avitoExternalId
    ? (
        await prisma.crmAvito.upsert({
          where: { externalId: avitoExternalId },
          update: {
            name: toStringOrEmpty(c.avito?.name),
            chatId: toStringOrEmpty(c.avito?.chatId),
            accountId,
          },
          create: {
            accountId,
            externalId: avitoExternalId,
            name: toStringOrEmpty(c.avito?.name),
            chatId: toStringOrEmpty(c.avito?.chatId),
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

async function syncCustomerTags(
  customerId: number,
  tags: ApiCustomer['tags'],
  accountId: number,
) {
  if (!Array.isArray(tags) || tags.length === 0) {
    await prisma.crmCustomerTag.deleteMany({ where: { customerId, accountId } });
    return;
  }

  const desiredTagIds = new Set<number>();

  for (const t of tags) {
    const tagExternalId = toExternalId(t?.id);
    if (!tagExternalId) continue;

    const tag = await prisma.crmTag.upsert({
      where: { externalId: tagExternalId },
      update: {
        name: toStringOrEmpty(t?.name),
        color: toStringOrEmpty(t?.color),
        textColor: toStringOrEmpty(t?.textColor),
        accountId,
      },
      create: {
        accountId,
        externalId: tagExternalId,
        name: toStringOrEmpty(t?.name),
        color: toStringOrEmpty(t?.color),
        textColor: toStringOrEmpty(t?.textColor),
      },
      select: { id: true },
    });

    desiredTagIds.add(tag.id);

    await prisma.crmCustomerTag.upsert({
      where: { customerId_tagId: { customerId, tagId: tag.id } },
      update: {},
      create: { accountId, customerId, tagId: tag.id },
    });
  }

  await prisma.crmCustomerTag.deleteMany({
    where: {
      accountId,
      customerId,
      tagId: { notIn: Array.from(desiredTagIds) },
    },
  });
}

async function upsertCustomer(c: ApiCustomer, accountId: number) {
  const customerExternalId = toExternalId(c?.id);
  if (!customerExternalId) {
    console.warn(
      '[seed-bs-full-customers] Skip customer without external id',
      c,
    );
    return;
  }

  const refs = await upsertReferenceData(c, accountId);

  const firstContact = normalizeDotDateToIso(c.firstContactDate);
  const lastContact = normalizeDotDateToIso(c.lastContactDate);
  const nextContact = normalizeDotDateToIso(c.nextContactDate);

  const customer = await prisma.crmCustomer.upsert({
    where: { externalId: customerExternalId },
    update: {
      accountId,
      fullName: toStringOrEmpty(c.fullName),
      photoUrl: toStringOrEmpty(c.photoUrl),
      birthday: toStringOrEmpty(c.birthday),
      sex: toStringOrEmpty(c.sex),
      phone: toStringOrEmpty(c.phone),
      email: toStringOrEmpty(c.email),
      address: toStringOrEmpty(c.address),
      otherContacts: toStringOrEmpty(c.otherContacts),
      firstContactDate: firstContact,
      lastContactDate: lastContact,
      nextContactDate: nextContact,
      shortNotes: toStringOrEmpty(c.shortNotes),
      comments: toStringOrEmpty(c.comments),
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
      accountId,
      externalId: customerExternalId,
      fullName: toStringOrEmpty(c.fullName),
      photoUrl: toStringOrEmpty(c.photoUrl),
      birthday: toStringOrEmpty(c.birthday),
      sex: toStringOrEmpty(c.sex),
      phone: toStringOrEmpty(c.phone),
      email: toStringOrEmpty(c.email),
      address: toStringOrEmpty(c.address),
      otherContacts: toStringOrEmpty(c.otherContacts),
      firstContactDate: firstContact,
      lastContactDate: lastContact,
      nextContactDate: nextContact,
      shortNotes: toStringOrEmpty(c.shortNotes),
      comments: toStringOrEmpty(c.comments),
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

  await syncCustomerTags(customer.id, c.tags, accountId);
}

async function importMonth(fromYmd: string, tillYmd: string, accountId: number) {
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
        await upsertCustomer(c, accountId);
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

async function importAllCustomers(accountId: number) {
  let cur = BLUESALES_FULL_FROM.slice(0, 7) + '-01';

  while (cur <= BLUESALES_FULL_TILL) {
    const monthEnd = endOfMonth(cur);
    const rangeEnd = monthEnd < BLUESALES_FULL_TILL ? monthEnd : BLUESALES_FULL_TILL;

    console.log(`\n=== Import range ${cur}..${rangeEnd} ===`);
    await importMonth(cur, rangeEnd, accountId);

    cur = addDaysYmd(cur, 32).slice(0, 7) + '-01';

    if (BLUESALES_THROTTLE_MS > 0) {
      await new Promise((r) => setTimeout(r, BLUESALES_THROTTLE_MS));
    }
  }
}

async function truncateCrmTablesBeforeImport() {
  const tablesSql = CRM_TRUNCATE_TABLES.map((t) => `"${t}"`).join(', ');

  console.warn(
    `[seed-bs-full-customers] Drop flag enabled. Truncating tables: ${CRM_TRUNCATE_TABLES.join(', ')}`,
  );

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tablesSql} RESTART IDENTITY CASCADE;`,
  );

  console.warn('[seed-bs-full-customers] Tables truncated');
}

async function main() {
  if (!BLUESALES_LOGIN || !BLUESALES_PASSWORD) {
    throw new Error('BLUESALES_LOGIN and BLUESALES_PASSWORD are required');
  }

  if (SHOULD_DROP_BEFORE_IMPORT) {
    await truncateCrmTablesBeforeImport();
  }

  const accountId = await resolveAccountId();

  console.log(
    `Start full customers import: ${BLUESALES_FULL_FROM}..${BLUESALES_FULL_TILL}, pageSize=${BLUESALES_PAGE_SIZE}, dropBeforeImport=${SHOULD_DROP_BEFORE_IMPORT}, account=${BLUESALES_ACCOUNT_CODE}#${accountId}`,
  );

  await importAllCustomers(accountId);

  const durationMs = Date.now() - SCRIPT_STARTED_AT_MS;
  console.log(
    `Full customers import completed. Duration: ${formatDuration(durationMs)} (${durationMs} ms)`,
  );
}

main()
  .catch((e) => {
    const durationMs = Date.now() - SCRIPT_STARTED_AT_MS;
    console.error(
      `Full customers import failed after ${formatDuration(durationMs)} (${durationMs} ms)`,
    );
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
