import 'dotenv/config';

import { Prisma } from '@prisma/client';
import { CrmCustomersService } from '../domains/crm-customers/crm-customers.service';
import { PrismaService } from '../prisma/prisma.service';

type SmokeOptions = {
  limit: number;
  maxPages: number;
  searchQuery?: string;
};

function parseIntegerEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : defaultValue;
}

function parseOptions(): SmokeOptions {
  const limitRaw = parseIntegerEnv('SMOKE_LIMIT', 100);
  const boundedLimit = Math.min(Math.max(limitRaw, 1), 100);
  const maxPagesRaw = parseIntegerEnv('SMOKE_MAX_PAGES', 0);
  const maxPages = Math.max(maxPagesRaw, 0);
  const searchQuery = (process.env.SMOKE_Q || '').trim() || undefined;

  return {
    limit: boundedLimit,
    maxPages,
    searchQuery,
  };
}

async function resolveAccountId(prisma: PrismaService): Promise<number> {
  const accountCode =
    process.env.CRM_ACCOUNT_CODE || process.env.BLUESALES_ACCOUNT_CODE || 'easybook';
  const accountName =
    process.env.CRM_ACCOUNT_NAME ||
    (accountCode === 'easybook'
      ? 'ИзиБук'
      : accountCode === 'easyneon'
        ? 'ИзиНеон'
        : `BlueSales ${accountCode}`);

  const account = await prisma.crmAccount.upsert({
    where: { code: accountCode },
    update: {
      name: accountName,
      isActive: true,
    },
    create: {
      code: accountCode,
      name: accountName,
      isActive: true,
    },
    select: { id: true },
  });

  return account.id;
}

function withAccountWhere(
  accountId: number,
  where: Prisma.CrmCustomerWhereInput,
): Prisma.CrmCustomerWhereInput {
  return {
    AND: [{ accountId }, where],
  };
}

function buildSearchWhere(q?: string): Prisma.CrmCustomerWhereInput {
  const normalizedQ = (q || '').trim();
  if (!normalizedQ) {
    return {};
  }

  return {
    fullName: { contains: normalizedQ, mode: 'insensitive' },
  };
}

function pickSearchQuery(seed: { fullName: string } | null): string | null {
  if (!seed) return null;

  const fullNamePart = seed.fullName
    .split(/\s+/)
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.length >= 3);
  if (fullNamePart) return fullNamePart;

  return null;
}

async function runScenario(params: {
  label: string;
  service: CrmCustomersService;
  prisma: PrismaService;
  accountId: number;
  limit: number;
  maxPages: number;
  q?: string;
}) {
  const { label, service, prisma, accountId, limit, maxPages, q } = params;
  const normalizedQ = (q || '').trim();
  const where = withAccountWhere(accountId, buildSearchWhere(normalizedQ));
  const expectedRows = await prisma.crmCustomer.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
    },
  });
  const expectedIds = expectedRows.map((row) => row.id);
  const expectedTotal = expectedIds.length;

  const seenIds = new Set<number>();
  const fetchedIds: number[] = [];
  let page = 0;
  let totalFetched = 0;
  let cursor: string | undefined;

  const startedAt = Date.now();

  while (true) {
    if (maxPages > 0 && page >= maxPages) {
      throw new Error(
        `Достигнут лимит страниц SMOKE_MAX_PAGES=${maxPages}, обход не завершен`,
      );
    }

    page += 1;
    const response = await service.list({
      limit,
      cursor,
      q: normalizedQ || undefined,
    });

    const items = response.items || [];

    if (items.length > limit) {
      throw new Error(
        `Страница ${page}: получено ${items.length}, что больше лимита ${limit}`,
      );
    }

    if (response.hasMore && !response.nextCursor) {
      throw new Error(`Страница ${page}: hasMore=true, но nextCursor пустой`);
    }

    if (!response.hasMore && response.nextCursor) {
      throw new Error(`Страница ${page}: hasMore=false, но nextCursor заполнен`);
    }

    for (const item of items) {
      if (seenIds.has(item.id)) {
        throw new Error(`Найден дубль id=${item.id} на странице ${page}`);
      }
      seenIds.add(item.id);
      fetchedIds.push(item.id);

      if (normalizedQ) {
        const haystack = String(item.fullName || '').toLowerCase();
        if (!haystack.includes(normalizedQ.toLowerCase())) {
          throw new Error(
            `Элемент id=${item.id} не соответствует фильтру q="${normalizedQ}"`,
          );
        }
      }
    }

    totalFetched += items.length;

    if (!response.hasMore) {
      break;
    }

    if (response.nextCursor === cursor) {
      throw new Error(`Курсор не меняется на странице ${page}`);
    }
    cursor = response.nextCursor || undefined;
  }

  if (totalFetched !== expectedTotal) {
    throw new Error(
      `Количество записей не совпало: fetched=${totalFetched}, expected=${expectedTotal}`,
    );
  }

  for (let index = 0; index < expectedIds.length; index += 1) {
    if (fetchedIds[index] !== expectedIds[index]) {
      throw new Error(
        `Нарушен порядок или состав данных на позиции ${index + 1}: fetched=${fetchedIds[index]}, expected=${expectedIds[index]}`,
      );
    }
  }

  const durationMs = Date.now() - startedAt;
  console.info(
    `[crm-customers-smoke] ${label}: OK | fetched=${totalFetched} | pages=${page} | limit=${limit} | durationMs=${durationMs}`,
  );
}

async function main() {
  const options = parseOptions();
  const prisma = new PrismaService();
  await prisma.$connect();

  const service = new CrmCustomersService(prisma);

  try {
    const accountId = await resolveAccountId(prisma);

    console.info('[crm-customers-smoke] start', {
      limit: options.limit,
      maxPages: options.maxPages,
      customSearchQuery: options.searchQuery || null,
      accountId,
    });

    await runScenario({
      label: 'full-list',
      service,
      prisma,
      accountId,
      limit: options.limit,
      maxPages: options.maxPages,
    });

    let searchQ = options.searchQuery || null;
    if (!searchQ) {
      const seed = await prisma.crmCustomer.findFirst({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
          fullName: true,
        },
      });
      searchQ = pickSearchQuery(seed);
    }

    if (searchQ) {
      await runScenario({
        label: `search-q:${searchQ}`,
        service,
        prisma,
        accountId,
        limit: options.limit,
        maxPages: options.maxPages,
        q: searchQ,
      });
    } else {
      console.info(
        '[crm-customers-smoke] search scenario skipped: не удалось подобрать q',
      );
    }

    console.info('[crm-customers-smoke] done');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[crm-customers-smoke] failed', error);
  process.exitCode = 1;
});
