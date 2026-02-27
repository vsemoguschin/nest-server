import 'dotenv/config';
import axios, { AxiosError } from 'axios';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { SocksProxyAgent } from 'socks-proxy-agent';

const tbankProxy = 'socks5h://127.0.0.1:1080';
const tbankProxyAgent = tbankProxy
  ? new SocksProxyAgent(tbankProxy)
  : undefined;

const prisma = new PrismaClient();

const T_ENDPOINT = 'https://business.tbank.ru/openapi/api/v1/statement';
const TB_TOKEN = process.env.TB_TOKEN;

if (!TB_TOKEN) {
  console.error('TB_TOKEN не задан');
  process.exit(1);
}

type Row = {
  id: number;
  operationId: string;
  operationDate: string;
  typeOfOperation: string;
  category: string;
  description: string;
  payPurpose: string;
  accountAmount: number;
  counterPartyAccount: string;
  counterPartyInn: string;
  counterPartyKpp: string;
  counterPartyBic: string;
  counterPartyBankName: string;
  counterPartyTitle: string;
  expenseCategoryId: number | null;
  expenseCategoryName: string | null;
  accountId: number;
  createdAt: Date;
  updatedAt: Date;
};

type ApiOperation = {
  operationId: string;
  operationDate: string;
  typeOfOperation?: string;
  category?: string;
  description?: string;
  payPurpose?: string;
  accountAmount: number;
  counterParty?: {
    account?: string;
    inn?: string;
    kpp?: string;
    name?: string;
    bankName?: string;
    bankBic?: string;
  };
};

type StatementResponse = {
  operations?: ApiOperation[];
  nextCursor?: string | null;
};

type PairMatch = {
  score: number;
  a: Row;
  b: Row;
};

type DuplicateCluster = {
  rowIds: number[];
};

type VerifyStatus =
  | 'exact_present'
  | 'semantic_present_other_id'
  | 'missing_in_api';

type VerifyRowResult = {
  status: VerifyStatus;
  row: Row;
  accountNumber: string;
  day: string;
  matchedApiOperationId?: string;
  matchedApiCategory?: string;
  matchedScore?: number;
};

type CliOptions = {
  accountId?: number;
  from?: string;
  to?: string;
  dayOffset: number;
  dayLimit?: number;
  outputOffset: number;
  outputLimit: number;
  includeExact: boolean;
  json: boolean;
};

function normalize(value?: string | null) {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function dateOnly(value: string) {
  return (value || '').slice(0, 10);
}

function amountKey(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : String(value);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dayOffset: 0,
    outputOffset: 0,
    outputLimit: 20,
    includeExact: false,
    json: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--accountId=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n)) options.accountId = n;
    } else if (arg.startsWith('--from=')) {
      options.from = arg.split('=')[1];
    } else if (arg.startsWith('--to=')) {
      options.to = arg.split('=')[1];
    } else if (arg.startsWith('--dayOffset=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n >= 0) options.dayOffset = Math.floor(n);
    } else if (arg.startsWith('--dayLimit=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) options.dayLimit = Math.floor(n);
    } else if (arg.startsWith('--outputOffset=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n >= 0) options.outputOffset = Math.floor(n);
    } else if (arg.startsWith('--outputLimit=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n >= 0) options.outputLimit = Math.floor(n);
    } else if (arg === '--includeExact') {
      options.includeExact = true;
    } else if (arg === '--json') {
      options.json = true;
    }
  }

  return options;
}

function inDateRange(row: Row, from?: string, to?: string) {
  const d = dateOnly(row.operationDate);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function buildBaseKey(row: Row) {
  return [
    row.accountId,
    dateOnly(row.operationDate),
    row.typeOfOperation || '',
    amountKey(row.accountAmount),
  ].join('|');
}

function getDbRowSimilarityScore(a: Row, b: Row) {
  const sameExactDateTime = a.operationDate === b.operationDate;
  const payPurposeMatch =
    !!normalize(a.payPurpose) &&
    normalize(a.payPurpose) === normalize(b.payPurpose);
  const descriptionMatch =
    !!normalize(a.description) &&
    normalize(a.description) === normalize(b.description);
  const counterPartyAccountMatch =
    !!normalize(a.counterPartyAccount) &&
    normalize(a.counterPartyAccount) === normalize(b.counterPartyAccount);
  const counterPartyInnMatch =
    !!normalize(a.counterPartyInn) &&
    normalize(a.counterPartyInn) === normalize(b.counterPartyInn);
  const counterPartyTitleMatch =
    !!normalize(a.counterPartyTitle) &&
    normalize(a.counterPartyTitle) === normalize(b.counterPartyTitle);

  let score = 0;
  if (sameExactDateTime) score += 5;
  if (payPurposeMatch) score += 5;
  if (descriptionMatch) score += 3;
  if (counterPartyAccountMatch) score += 4;
  if (counterPartyInnMatch) score += 2;
  if (counterPartyTitleMatch) score += 2;

  const hasStrongSignal =
    sameExactDateTime &&
    (payPurposeMatch || descriptionMatch || counterPartyAccountMatch);

  return hasStrongSignal ? score : 0;
}

function getDbVsApiSimilarityScore(row: Row, op: ApiOperation) {
  if ((op.typeOfOperation || 'Unknown') !== row.typeOfOperation) return 0;
  if (Number(op.accountAmount) !== Number(row.accountAmount)) return 0;

  const sameExactDateTime = op.operationDate === row.operationDate;
  const payPurposeMatch =
    !!normalize(row.payPurpose) &&
    normalize(op.payPurpose || '') === normalize(row.payPurpose);
  const descriptionMatch =
    !!normalize(row.description) &&
    normalize(op.description || '') === normalize(row.description);
  const counterPartyAccountMatch =
    !!normalize(row.counterPartyAccount) &&
    normalize(op.counterParty?.account || '') ===
      normalize(row.counterPartyAccount);
  const counterPartyInnMatch =
    !!normalize(row.counterPartyInn) &&
    normalize(op.counterParty?.inn || '') === normalize(row.counterPartyInn);
  const counterPartyTitleMatch =
    !!normalize(row.counterPartyTitle) &&
    normalize(op.counterParty?.name || '') === normalize(row.counterPartyTitle);

  let score = 0;
  if (sameExactDateTime) score += 5;
  if (payPurposeMatch) score += 5;
  if (descriptionMatch) score += 3;
  if (counterPartyAccountMatch) score += 4;
  if (counterPartyInnMatch) score += 2;
  if (counterPartyTitleMatch) score += 2;

  const hasStrongSignal =
    sameExactDateTime &&
    (payPurposeMatch || descriptionMatch || counterPartyAccountMatch);

  return hasStrongSignal ? score : 0;
}

function findLikelyDuplicatePairs(rows: Row[]): PairMatch[] {
  const pairs: PairMatch[] = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a.operationId === b.operationId) continue;
      const score = getDbRowSimilarityScore(a, b);
      if (score < 10) continue;
      pairs.push({ a, b, score });
    }
  }

  return pairs;
}

function buildDuplicateClusters(
  rows: Row[],
  pairs: PairMatch[],
): DuplicateCluster[] {
  if (pairs.length === 0) return [];

  const rowIds = new Set(rows.map((r) => r.id));
  const adjacency = new Map<number, Set<number>>();
  const ensure = (id: number) => {
    if (!adjacency.has(id)) adjacency.set(id, new Set<number>());
    return adjacency.get(id)!;
  };

  for (const pair of pairs) {
    ensure(pair.a.id).add(pair.b.id);
    ensure(pair.b.id).add(pair.a.id);
  }

  const visited = new Set<number>();
  const clusters: DuplicateCluster[] = [];

  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const stack = [start];
    visited.add(start);
    const ids: number[] = [];

    while (stack.length) {
      const cur = stack.pop()!;
      ids.push(cur);
      for (const next of adjacency.get(cur) || []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    const normalizedIds = ids
      .filter((id) => rowIds.has(id))
      .sort((a, b) => a - b);
    if (normalizedIds.length > 1) {
      clusters.push({ rowIds: normalizedIds });
    }
  }

  return clusters;
}

async function fetchStatementDay(
  accountNumber: string,
  day: string,
): Promise<ApiOperation[]> {
  const from = new Date(`${day}T00:00:00.000Z`).toISOString();
  const to = new Date(`${day}T23:59:59.999Z`).toISOString();

  const all: ApiOperation[] = [];
  let cursor: string | undefined;
  let page = 0;

  while (true) {
    page++;
    try {
      const response = await axios.get<StatementResponse>(T_ENDPOINT, {
        httpAgent: tbankProxyAgent,
        httpsAgent: tbankProxyAgent,
        headers: {
          Authorization: `Bearer ${TB_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Request-Id': randomUUID(),
        },
        params: {
          accountNumber,
          operationStatus: 'Transaction',
          from,
          to,
          withBalances: cursor ? false : true,
          limit: 1000,
          ...(cursor ? { cursor } : {}),
        },
        timeout: 30000,
      });

      const ops = response.data.operations || [];
      all.push(...ops);
      cursor = response.data.nextCursor || undefined;
      if (!cursor || ops.length === 0) break;
    } catch (error) {
      const err = error as AxiosError;
      console.error(
        `Ошибка T-Bank API (${accountNumber}, ${day}, page=${page}): ${err.message}`,
      );
      throw error;
    }
  }

  return all;
}

async function bootstrap() {
  const options = parseArgs(process.argv.slice(2));

  console.log('Проверка дублей OriginalOperationFromTbank через T-Bank API');
  console.log('Параметры:', options);

  const [rows, accounts] = await Promise.all([
    prisma.originalOperationFromTbank.findMany({
      where: options.accountId ? { accountId: options.accountId } : undefined,
      select: {
        id: true,
        operationId: true,
        operationDate: true,
        typeOfOperation: true,
        category: true,
        description: true,
        payPurpose: true,
        accountAmount: true,
        counterPartyAccount: true,
        counterPartyInn: true,
        counterPartyKpp: true,
        counterPartyBic: true,
        counterPartyBankName: true,
        counterPartyTitle: true,
        expenseCategoryId: true,
        expenseCategoryName: true,
        accountId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { accountId: 'asc' },
        { operationDate: 'desc' },
        { id: 'desc' },
      ],
    }),
    prisma.planFactAccount.findMany({
      select: { id: true, accountNumber: true, name: true },
    }),
  ]);

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const filteredRows = (rows as Row[]).filter((row) =>
    inDateRange(row, options.from, options.to),
  );

  const candidateGroups = [
    ...filteredRows
      .reduce((map, row) => {
        const key = buildBaseKey(row);
        const list = map.get(key) || [];
        list.push(row);
        map.set(key, list);
        return map;
      }, new Map<string, Row[]>())
      .entries(),
  ]
    .map(([key, items]) => ({ key, items }))
    .filter((g) => g.items.length > 1);

  const duplicateGroups = candidateGroups
    .map((group) => {
      const pairs = findLikelyDuplicatePairs(group.items);
      const clusters = buildDuplicateClusters(group.items, pairs);
      return { ...group, pairs, clusters };
    })
    .filter((g) => g.clusters.length > 0);

  const duplicateRowIds = new Set<number>();
  for (const group of duplicateGroups) {
    for (const cluster of group.clusters) {
      for (const rowId of cluster.rowIds) duplicateRowIds.add(rowId);
    }
  }
  const duplicateRows = filteredRows.filter((row) =>
    duplicateRowIds.has(row.id),
  );

  const uniqueDayKeysAll = Array.from(
    new Set(
      duplicateRows.map(
        (row) => `${row.accountId}|${dateOnly(row.operationDate)}`,
      ),
    ),
  ).sort();
  const uniqueDayKeys = uniqueDayKeysAll.slice(
    options.dayOffset,
    options.dayLimit ? options.dayOffset + options.dayLimit : undefined,
  );
  const dayKeySet = new Set(uniqueDayKeys);

  const duplicateRowsToVerify = duplicateRows.filter((row) =>
    dayKeySet.has(`${row.accountId}|${dateOnly(row.operationDate)}`),
  );

  const apiCache = new Map<string, ApiOperation[]>();
  const verifyResults: VerifyRowResult[] = [];

  console.log(
    `Дубль-групп: ${duplicateGroups.length}, дубль-строк: ${duplicateRows.length}, account+day ключей: ${uniqueDayKeysAll.length}`,
  );
  console.log(
    `К проверке сейчас: account+day=${uniqueDayKeys.length} (offset=${options.dayOffset}${options.dayLimit ? `, limit=${options.dayLimit}` : ''}), строк=${duplicateRowsToVerify.length}`,
  );

  for (const dayKey of uniqueDayKeys) {
    const [accountIdStr, day] = dayKey.split('|');
    const accountId = Number(accountIdStr);
    const account = accountById.get(accountId);
    if (!account) {
      console.warn(
        `Пропуск: не найден PlanFactAccount для accountId=${accountId}`,
      );
      continue;
    }

    const cacheKey = `${accountId}|${day}`;
    const apiOperations =
      apiCache.get(cacheKey) ||
      (await fetchStatementDay(account.accountNumber, day));
    apiCache.set(cacheKey, apiOperations);

    const rowsForDay = duplicateRowsToVerify.filter(
      (row) =>
        row.accountId === accountId && dateOnly(row.operationDate) === day,
    );

    for (const row of rowsForDay) {
      const exact = apiOperations.find(
        (op) => op.operationId === row.operationId,
      );
      if (exact) {
        verifyResults.push({
          status: 'exact_present',
          row,
          accountNumber: account.accountNumber,
          day,
          matchedApiOperationId: exact.operationId,
          matchedApiCategory: exact.category || '',
          matchedScore: 999,
        });
        continue;
      }

      let best: { op: ApiOperation; score: number } | null = null;
      for (const op of apiOperations) {
        const score = getDbVsApiSimilarityScore(row, op);
        if (!best || score > best.score) {
          best = { op, score };
        }
      }

      if (best && best.score >= 10) {
        verifyResults.push({
          status: 'semantic_present_other_id',
          row,
          accountNumber: account.accountNumber,
          day,
          matchedApiOperationId: best.op.operationId,
          matchedApiCategory: best.op.category || '',
          matchedScore: best.score,
        });
      } else {
        verifyResults.push({
          status: 'missing_in_api',
          row,
          accountNumber: account.accountNumber,
          day,
        });
      }
    }
  }

  const counts = verifyResults.reduce(
    (acc, item) => {
      acc.total++;
      acc[item.status]++;
      if (item.status !== 'exact_present') {
        acc.missingExactId++;
      }
      if (item.status === 'missing_in_api') {
        acc.missingAmountTotal += item.row.accountAmount;
        if (item.row.typeOfOperation === 'Credit')
          acc.missingAmountCredit += item.row.accountAmount;
        else if (item.row.typeOfOperation === 'Debit')
          acc.missingAmountDebit += item.row.accountAmount;
        else acc.missingAmountOther += item.row.accountAmount;
      }
      return acc;
    },
    {
      total: 0,
      exact_present: 0,
      semantic_present_other_id: 0,
      missing_in_api: 0,
      missingExactId: 0,
      missingAmountTotal: 0,
      missingAmountCredit: 0,
      missingAmountDebit: 0,
      missingAmountOther: 0,
    },
  );

  const outputBase = verifyResults
    .filter((item) =>
      options.includeExact ? true : item.status !== 'exact_present',
    )
    .sort((a, b) => b.row.createdAt.getTime() - a.row.createdAt.getTime());

  const outputRows = outputBase.slice(
    options.outputOffset,
    options.outputOffset + options.outputLimit,
  );

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          checkedRowsInDb: filteredRows.length,
          duplicateGroups: duplicateGroups.length,
          duplicateRows: duplicateRows.length,
          dayKeysTotal: uniqueDayKeysAll.length,
          dayKeysChecked: uniqueDayKeys.length,
          verifyResults: counts,
          outputPagination: {
            offset: options.outputOffset,
            limit: options.outputLimit,
            total: outputBase.length,
            shown: outputRows.length,
            includeExact: options.includeExact,
          },
          rows: outputRows.map((item) => ({
            status: item.status,
            accountId: item.row.accountId,
            accountNumber: item.accountNumber,
            day: item.day,
            id: item.row.id,
            operationId: item.row.operationId,
            operationDate: item.row.operationDate,
            typeOfOperation: item.row.typeOfOperation,
            accountAmount: item.row.accountAmount,
            category: item.row.category,
            matchedApiOperationId: item.matchedApiOperationId || null,
            matchedApiCategory: item.matchedApiCategory || null,
            matchedScore: item.matchedScore || null,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Проверено строк-дублей через API: ${counts.total}`);
  console.log(`exact_present: ${counts.exact_present}`);
  console.log(
    `semantic_present_other_id (ID изменился): ${counts.semantic_present_other_id}`,
  );
  console.log(
    `missing_in_api (семантически не найдено): ${counts.missing_in_api}`,
  );
  console.log(
    `missingExactId (нет точного operationId в API): ${counts.missingExactId}`,
  );
  console.log(
    `Сумма missing_in_api: ${counts.missingAmountTotal.toFixed(2)} (Credit=${counts.missingAmountCredit.toFixed(2)}, Debit=${counts.missingAmountDebit.toFixed(2)}${counts.missingAmountOther ? `, Other=${counts.missingAmountOther.toFixed(2)}` : ''})`,
  );
  console.log(
    `Вывод строк: ${outputRows.length} из ${outputBase.length} (offset=${options.outputOffset}, limit=${options.outputLimit}, includeExact=${options.includeExact})`,
  );

  for (const item of outputRows) {
    console.log(
      `[${item.status}] id=${item.row.id}, opId=${item.row.operationId}, accountId=${item.row.accountId}, accountNumber=${item.accountNumber}, day=${item.day}, dt=${item.row.operationDate}, type=${item.row.typeOfOperation}, amount=${item.row.accountAmount}, category=${item.row.category}`,
    );
    if (item.matchedApiOperationId) {
      console.log(
        `  API match: opId=${item.matchedApiOperationId}, category=${item.matchedApiCategory || ''}, score=${item.matchedScore ?? ''}`,
      );
    }
    if (item.row.payPurpose) {
      console.log(`  payPurpose: ${item.row.payPurpose}`);
    } else if (item.row.description) {
      console.log(`  description: ${item.row.description}`);
    }
  }
}

bootstrap()
  .catch((error) => {
    console.error('Ошибка выполнения скрипта:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
