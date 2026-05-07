/**
 * Read-only аудит операций T-Bank API vs БД.
 *
 * Пример запуска:
 * npx ts-node src/seeds/audit-tbank-operations-api-vs-db.ts --accountId=1 --from=2026-04-01 --to=2026-04-30 --format=table --out=./tmp/tbank-audit-april.json
 *
 * Что делает:
 * - читает реальные счета PlanFactAccount;
 * - запрашивает операции из T-Bank API за период;
 * - читает OriginalOperationFromTbank за тот же период;
 * - сравнивает только по operationId;
 * - ничего не пишет в БД и не изменяет данные.
 */
import 'dotenv/config';
import axios, { AxiosError } from 'axios';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { SocksProxyAgent } from 'socks-proxy-agent';
const tbankProxy = 'socks5h://127.0.0.1:1080';
const tbankProxyAgent = tbankProxy
  ? new SocksProxyAgent(tbankProxy)
  : undefined;

const prisma = new PrismaClient();
const T_ENDPOINT = 'https://business.tbank.ru/openapi/api/v1/statement';
const TB_TOKEN = process.env.TB_TOKEN;

type CliOptions = {
  accountId: number;
  from: string;
  to: string;
  bankAccountId?: number;
  accountNumber?: string;
  format: 'json' | 'table';
  out?: string;
};

type ApiOperation = {
  operationId: string;
  operationDate?: string;
  typeOfOperation?: string;
  accountAmount?: number;
  payPurpose?: string;
  description?: string;
  counterParty?: {
    name?: string;
  };
};

type StatementResponse = {
  operations?: ApiOperation[];
  nextCursor?: string | null;
};

type BankAccount = {
  id: number;
  name: string;
  accountNumber: string;
  isReal: boolean;
};

type DbOperation = {
  operationId: string;
  operationDate: string;
  typeOfOperation: string;
  accountAmount: number;
  counterPartyTitle: string;
  payPurpose: string;
  accountId: number;
};

type ReportRow = {
  operationId: string;
  operationDate: string;
  amount: number;
  typeOfOperation: string;
  counterParty: string;
  payPurpose: string;
  accountId: number;
  accountName: string;
  accountNumber: string;
  source: 'api-only' | 'db-only' | 'match';
};

type AccountReport = {
  accountId: number;
  accountName: string;
  accountNumber: string;
  apiCount: number;
  dbCount: number;
  matchedCount: number;
  apiOnlyCount: number;
  dbOnlyCount: number;
  apiOnly: ReportRow[];
  dbOnly: ReportRow[];
  matchesPreview: ReportRow[];
};

type AuditReport = {
  generatedAt: string;
  period: {
    from: string;
    to: string;
  };
  accountId: number;
  filters: {
    bankAccountId?: number;
    accountNumber?: string;
  };
  checkedAccounts: Array<{
    accountId: number;
    accountName: string;
    accountNumber: string;
  }>;
  totals: {
    apiCount: number;
    dbCount: number;
    matchedCount: number;
    apiOnlyCount: number;
    dbOnlyCount: number;
  };
  accountReports: AccountReport[];
  discrepancies: ReportRow[];
};

function assertRequiredEnv(name: string, value?: string) {
  if (!value?.trim()) {
    throw new Error(`Не задана переменная окружения ${name}`);
  }
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseIntArg(name: string, raw: string) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Параметр ${name} должен быть положительным числом`);
  }
  return value;
}

function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    format: 'table',
  };

  for (const arg of argv) {
    if (arg.startsWith('--accountId=')) {
      options.accountId = parseIntArg('--accountId', arg.split('=')[1] || '');
    } else if (arg.startsWith('--from=')) {
      options.from = arg.split('=')[1];
    } else if (arg.startsWith('--to=')) {
      options.to = arg.split('=')[1];
    } else if (arg.startsWith('--bankAccountId=')) {
      options.bankAccountId = parseIntArg(
        '--bankAccountId',
        arg.split('=')[1] || '',
      );
    } else if (arg.startsWith('--accountNumber=')) {
      const value = arg.split('=')[1]?.trim();
      if (!value) {
        throw new Error('Параметр --accountNumber не должен быть пустым');
      }
      options.accountNumber = value;
    } else if (arg.startsWith('--format=')) {
      const value = arg.split('=')[1];
      if (value !== 'json' && value !== 'table') {
        throw new Error('Параметр --format должен быть json или table');
      }
      options.format = value;
    } else if (arg.startsWith('--out=')) {
      const value = arg.split('=')[1]?.trim();
      if (!value) {
        throw new Error('Параметр --out не должен быть пустым');
      }
      options.out = value;
    }
  }

  if (!options.accountId) {
    throw new Error('Обязательный параметр: --accountId=<crm account id>');
  }
  if (!options.from || !isIsoDate(options.from)) {
    throw new Error('Обязательный параметр: --from=YYYY-MM-DD');
  }
  if (!options.to || !isIsoDate(options.to)) {
    throw new Error('Обязательный параметр: --to=YYYY-MM-DD');
  }
  if (options.from > options.to) {
    throw new Error('Параметр --from не может быть позже --to');
  }
  if (options.bankAccountId && options.accountNumber) {
    throw new Error(
      'Передавайте только один уточняющий фильтр: --bankAccountId или --accountNumber',
    );
  }

  return options as CliOptions;
}

async function fetchOperationsFromTbank(
  accountNumber: string,
  from: string,
  to: string,
): Promise<ApiOperation[]> {
  assertRequiredEnv('TB_TOKEN', TB_TOKEN);

  const allOperations: ApiOperation[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await axios.get<StatementResponse>(T_ENDPOINT, {
        proxy: false,
        // httpAgent: tbankProxyAgent,
        // httpsAgent: tbankProxyAgent,
        headers: {
          Authorization: `Bearer ${TB_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Request-Id': randomUUID(),
        },
        params: {
          accountNumber,
          operationStatus: 'Transaction',
          from: `${from}T00:00:00.000Z`,
          to: `${to}T23:59:59.999Z`,
          withBalances: cursor ? false : true,
          limit: 1000,
          ...(cursor ? { cursor } : {}),
        },
        timeout: 30000,
        maxBodyLength: Infinity,
      });

      const operations = response.data.operations || [];
      allOperations.push(...operations);
      cursor = response.data.nextCursor || undefined;
      hasMore = Boolean(cursor) && operations.length > 0;

      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      const err = error as AxiosError;
      throw new Error(
        `Ошибка T-Bank API для счета ${accountNumber}: ${err.message}`,
      );
    }
  }

  return allOperations;
}

function toReportRowFromApi(
  item: ApiOperation,
  account: BankAccount,
  source: 'api-only' | 'match',
): ReportRow {
  return {
    operationId: item.operationId,
    operationDate: item.operationDate || '',
    amount: Number(item.accountAmount || 0),
    typeOfOperation: item.typeOfOperation || 'Unknown',
    counterParty: item.counterParty?.name || '',
    payPurpose: item.payPurpose || '',
    accountId: account.id,
    accountName: account.name,
    accountNumber: account.accountNumber,
    source,
  };
}

function toReportRowFromDb(
  item: DbOperation,
  account: BankAccount,
  source: 'db-only',
): ReportRow {
  return {
    operationId: item.operationId,
    operationDate: item.operationDate,
    amount: Number(item.accountAmount || 0),
    typeOfOperation: item.typeOfOperation || 'Unknown',
    counterParty: item.counterPartyTitle || '',
    payPurpose: item.payPurpose || '',
    accountId: account.id,
    accountName: account.name,
    accountNumber: account.accountNumber,
    source,
  };
}

function printTableReport(report: AuditReport) {
  console.log(`Период: ${report.period.from} .. ${report.period.to}`);
  console.log(`accountId: ${report.accountId}`);
  console.log(
    `Проверенные счета: ${report.checkedAccounts.map((item) => `#${item.accountId} ${item.accountName} (${item.accountNumber})`).join('; ')}`,
  );
  console.log(
    `Итого: API=${report.totals.apiCount}, DB=${report.totals.dbCount}, match=${report.totals.matchedCount}, api-only=${report.totals.apiOnlyCount}, db-only=${report.totals.dbOnlyCount}`,
  );

  console.log('\nСводка по счетам:');
  console.table(
    report.accountReports.map((item) => ({
      accountId: item.accountId,
      accountName: item.accountName,
      accountNumber: item.accountNumber,
      apiCount: item.apiCount,
      dbCount: item.dbCount,
      matchedCount: item.matchedCount,
      apiOnlyCount: item.apiOnlyCount,
      dbOnlyCount: item.dbOnlyCount,
    })),
  );

  const matchesPreview = report.accountReports.flatMap(
    (item) => item.matchesPreview,
  );
  if (matchesPreview.length > 0) {
    console.log('\nПервые совпадения (до 20):');
    console.table(
      matchesPreview.slice(0, 20).map((item) => ({
        operationId: item.operationId,
        operationDate: item.operationDate,
        amount: item.amount,
        typeOfOperation: item.typeOfOperation,
        counterParty: item.counterParty,
        payPurpose: item.payPurpose,
        accountNumber: item.accountNumber,
      })),
    );
  }

  if (report.discrepancies.length > 0) {
    console.log('\nРасхождения:');
    console.table(
      report.discrepancies.map((item) => ({
        source: item.source,
        operationId: item.operationId,
        operationDate: item.operationDate,
        amount: item.amount,
        typeOfOperation: item.typeOfOperation,
        counterParty: item.counterParty,
        payPurpose: item.payPurpose,
        accountNumber: item.accountNumber,
      })),
    );
  } else {
    console.log('\nРасхождений не найдено.');
  }
}

async function writeReportIfNeeded(report: AuditReport, out?: string) {
  if (!out) return;
  const absolutePath = resolve(out);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nJSON-отчет сохранен: ${absolutePath}`);
}

async function resolveAccounts(options: CliOptions): Promise<BankAccount[]> {
  const baseAccount = await prisma.planFactAccount.findFirst({
    where: {
      id: options.accountId,
      isReal: true,
    },
    select: {
      id: true,
      name: true,
      accountNumber: true,
      isReal: true,
    },
  });

  if (!baseAccount) {
    throw new Error(
      `PlanFactAccount с id=${options.accountId} не найден или не является реальным счетом`,
    );
  }

  if (!options.bankAccountId && !options.accountNumber) {
    return [baseAccount];
  }

  const filteredAccount = await prisma.planFactAccount.findFirst({
    where: {
      isReal: true,
      ...(options.bankAccountId ? { id: options.bankAccountId } : {}),
      ...(options.accountNumber
        ? { accountNumber: options.accountNumber }
        : {}),
    },
    select: {
      id: true,
      name: true,
      accountNumber: true,
      isReal: true,
    },
  });

  if (!filteredAccount) {
    throw new Error(
      'Не найден реальный PlanFactAccount по уточняющему фильтру --bankAccountId/--accountNumber',
    );
  }

  return [filteredAccount];
}

async function loadDbOperations(
  accountId: number,
  from: string,
  to: string,
): Promise<DbOperation[]> {
  return prisma.originalOperationFromTbank.findMany({
    where: {
      accountId,
      operationDate: {
        gte: `${from}T00:00:00.000Z`,
        lte: `${to}T23:59:59.999Z`,
      },
    },
    select: {
      operationId: true,
      operationDate: true,
      typeOfOperation: true,
      accountAmount: true,
      counterPartyTitle: true,
      payPurpose: true,
      accountId: true,
    },
    orderBy: [{ operationDate: 'asc' }, { operationId: 'asc' }],
  });
}

async function buildReport(options: CliOptions): Promise<AuditReport> {
  const accounts = await resolveAccounts(options);
  const accountReports: AccountReport[] = [];
  const discrepancies: ReportRow[] = [];

  let apiCount = 0;
  let dbCount = 0;
  let matchedCount = 0;
  let apiOnlyCount = 0;
  let dbOnlyCount = 0;

  for (const account of accounts) {
    const [apiOperations, dbOperations] = await Promise.all([
      fetchOperationsFromTbank(account.accountNumber, options.from, options.to),
      loadDbOperations(account.id, options.from, options.to),
    ]);

    const apiById = new Map(
      apiOperations
        .filter((item) => Boolean(item.operationId))
        .map((item) => [item.operationId, item]),
    );
    const dbById = new Map(
      dbOperations.map((item) => [item.operationId, item]),
    );

    const localMatches: ReportRow[] = [];
    const localApiOnly: ReportRow[] = [];
    const localDbOnly: ReportRow[] = [];

    for (const apiItem of apiOperations) {
      if (dbById.has(apiItem.operationId)) {
        localMatches.push(toReportRowFromApi(apiItem, account, 'match'));
      } else {
        const row = toReportRowFromApi(apiItem, account, 'api-only');
        localApiOnly.push(row);
        discrepancies.push(row);
      }
    }

    for (const dbItem of dbOperations) {
      if (!apiById.has(dbItem.operationId)) {
        const row = toReportRowFromDb(dbItem, account, 'db-only');
        localDbOnly.push(row);
        discrepancies.push(row);
      }
    }

    apiCount += apiOperations.length;
    dbCount += dbOperations.length;
    matchedCount += localMatches.length;
    apiOnlyCount += localApiOnly.length;
    dbOnlyCount += localDbOnly.length;

    accountReports.push({
      accountId: account.id,
      accountName: account.name,
      accountNumber: account.accountNumber,
      apiCount: apiOperations.length,
      dbCount: dbOperations.length,
      matchedCount: localMatches.length,
      apiOnlyCount: localApiOnly.length,
      dbOnlyCount: localDbOnly.length,
      apiOnly: localApiOnly,
      dbOnly: localDbOnly,
      matchesPreview: localMatches.slice(0, 20),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    period: {
      from: options.from,
      to: options.to,
    },
    accountId: options.accountId,
    filters: {
      bankAccountId: options.bankAccountId,
      accountNumber: options.accountNumber,
    },
    checkedAccounts: accounts.map((item) => ({
      accountId: item.id,
      accountName: item.name,
      accountNumber: item.accountNumber,
    })),
    totals: {
      apiCount,
      dbCount,
      matchedCount,
      apiOnlyCount,
      dbOnlyCount,
    },
    accountReports,
    discrepancies,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildReport(options);

  if (options.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTableReport(report);
  }

  await writeReportIfNeeded(report, options.out);
}

main()
  .catch((error) => {
    console.error(
      `[tbank-audit] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
