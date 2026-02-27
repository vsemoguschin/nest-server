import 'dotenv/config';
import 'reflect-metadata';
import 'tsconfig-paths/register';
import axios, { AxiosError } from 'axios';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TbankSyncService } from '../services/tbank-sync.service';

const prisma = new PrismaClient();

const T_ENDPOINT = 'https://business.tbank.ru/openapi/api/v1/statement';
const TB_TOKEN = process.env.TB_TOKEN;

// Прокси нужен для запросов к T-Bank API
const tbankProxy = 'socks5h://127.0.0.1:1080';
const tbankProxyAgent = tbankProxy
  ? new SocksProxyAgent(tbankProxy)
  : undefined;

if (!TB_TOKEN) {
  console.error('TB_TOKEN не задан');
  process.exit(1);
}

type CliOptions = {
  from: string;
  to: string;
  accountId?: number;
  sampleLimit: number;
  payPurposeContains?: string;
  applyFix: boolean;
};

type ApiOperation = {
  operationId: string;
  operationDate?: string;
  typeOfOperation?: string;
  accountAmount?: number;
  category?: string;
  payPurpose?: string;
  description?: string;
  expenseCategoryId?: number | null;
  expenseCategoryName?: string | null;
  counterParty?: {
    account?: string;
    inn?: string;
    kpp?: string;
    bankBic?: string;
    bankName?: string;
    name?: string;
  };
};

type StatementResponse = {
  operations?: ApiOperation[];
  nextCursor?: string | null;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    from: '',
    to: '',
    sampleLimit: 20,
    applyFix: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--from=')) {
      options.from = arg.split('=')[1];
    } else if (arg.startsWith('--to=')) {
      options.to = arg.split('=')[1];
    } else if (arg.startsWith('--accountId=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n)) options.accountId = n;
    } else if (arg.startsWith('--sampleLimit=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n >= 0) options.sampleLimit = Math.floor(n);
    } else if (arg.startsWith('--payPurposeContains=')) {
      const value = arg.slice('--payPurposeContains='.length).trim();
      if (value) options.payPurposeContains = value;
    } else if (arg === '--applyFix') {
      options.applyFix = true;
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.from)) {
    throw new Error('Нужен --from=YYYY-MM-DD');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.to)) {
    throw new Error('Нужен --to=YYYY-MM-DD');
  }

  return options;
}

async function fetchOperationsFromApiByPeriod(
  accountNumber: string,
  from: string,
  to: string,
): Promise<ApiOperation[]> {
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
          from: new Date(`${from}T00:00:00.000Z`).toISOString(),
          to: new Date(`${to}T23:59:59.999Z`).toISOString(),
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
      hasMore = !!cursor && operations.length > 0;

      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      const err = error as AxiosError;
      console.error(
        `Ошибка T-Bank API для счета ${accountNumber}: ${err.message}`,
      );
      throw error;
    }
  }

  return allOperations;
}

async function resolveProjectIds() {
  const projects = await prisma.project.findMany({
    where: {
      code: { in: ['general', 'easyneon', 'easybook'] },
    },
    select: {
      id: true,
      code: true,
    },
  });

  const byCode = new Map(projects.map((p) => [p.code, p.id]));
  const generalId = byCode.get('general');
  if (!generalId) {
    throw new Error('Проект с code="general" не найден. Запусти seed-projects.ts');
  }

  return {
    generalId,
    easyneonId: byCode.get('easyneon') ?? generalId,
    easybookId: byCode.get('easybook') ?? generalId,
  };
}

function getProjectIdForAccount(
  accountId: number,
  projects: { generalId: number; easyneonId: number; easybookId: number },
) {
  return accountId === 1
    ? projects.easyneonId
    : accountId === 3
      ? projects.easybookId
      : projects.generalId;
}

function normalizeApiOpsForTbankSync(apiOps: ApiOperation[]) {
  return apiOps.map((op) => ({
    operationId: op.operationId,
    operationDate: op.operationDate || '',
    typeOfOperation: op.typeOfOperation || 'Unknown',
    category: op.category || '',
    description: op.description || '',
    payPurpose: op.payPurpose || '',
    accountAmount: Number(op.accountAmount || 0),
    counterParty: {
      account: op.counterParty?.account || '',
      inn: op.counterParty?.inn || '',
      kpp: op.counterParty?.kpp || '',
      bankBic: op.counterParty?.bankBic || '',
      bankName: op.counterParty?.bankName || '',
      name: op.counterParty?.name || '',
    },
    expenseCategoryId: op.expenseCategoryId ?? null,
    expenseCategoryName: op.expenseCategoryName ?? null,
  }));
}

async function applyDbApiDiffForAccount(params: {
  account: { id: number; name: string; accountNumber: string };
  dbOnlyRows: Array<{ id: number }>;
  apiOnlyOps: ApiOperation[];
  tbankSyncService: TbankSyncService;
  projectIds: { generalId: number; easyneonId: number; easybookId: number };
}) {
  const { account, dbOnlyRows, apiOnlyOps, tbankSyncService, projectIds } = params;
  const dbOnlyIds = dbOnlyRows.map((row) => row.id);

  let createdCount = 0;
  if (apiOnlyOps.length > 0) {
    const normalized = normalizeApiOpsForTbankSync(apiOnlyOps);
    const projectId = getProjectIdForAccount(account.id, projectIds);
    const result = await tbankSyncService.saveOriginalOperations(
      normalized,
      account.id,
      projectId,
    );
    createdCount = result.savedCount;
  }

  let deletedPositionsCount = 0;
  let deletedOriginalsCount = 0;
  if (dbOnlyIds.length > 0) {
    const txResult = await prisma.$transaction(async (tx) => {
      const delPositions = await tx.operationPosition.deleteMany({
        where: {
          originalOperationId: { in: dbOnlyIds },
        },
      });

      const delOriginals = await tx.originalOperationFromTbank.deleteMany({
        where: {
          id: { in: dbOnlyIds },
        },
      });

      return {
        deletedPositionsCount: delPositions.count,
        deletedOriginalsCount: delOriginals.count,
      };
    });

    deletedPositionsCount = txResult.deletedPositionsCount;
    deletedOriginalsCount = txResult.deletedOriginalsCount;
  }

  return {
    createdCount,
    deletedPositionsCount,
    deletedOriginalsCount,
  };
}

async function bootstrap() {
  const options = parseArgs(process.argv.slice(2));

  console.log('Сравнение операций T-Bank: БД vs API (по operationId)');
  console.log('Параметры:', options);
  console.log('Прокси:', tbankProxy || 'disabled');
  console.log(`Режим: ${options.applyFix ? 'APPLY FIX' : 'DRY RUN'}`);

  const accounts = await prisma.planFactAccount.findMany({
    where: {
      isReal: true,
      ...(options.accountId ? { id: options.accountId } : {}),
    },
    select: {
      id: true,
      name: true,
      accountNumber: true,
    },
    orderBy: { id: 'asc' },
  });

  if (accounts.length === 0) {
    console.log('Подходящих счетов не найдено');
    return;
  }

  const dbFromIso = `${options.from}T00:00:00.000Z`;
  const dbToIso = `${options.to}T23:59:59.999Z`;

  let totalDbCount = 0;
  let totalApiCount = 0;
  let totalDbOnlyCount = 0;
  let totalIntersectionCount = 0;
  let totalApiOnlyCount = 0;
  let totalAppliedCreated = 0;
  let totalAppliedDeletedOriginals = 0;
  let totalAppliedDeletedPositions = 0;

  const globalDbOnlySamples: Array<{
    id: number;
    operationId: string;
    operationDate: string;
    typeOfOperation: string;
    accountAmount: number;
    category: string;
    payPurpose: string;
    accountId: number;
    accountName: string;
    accountNumber: string;
  }> = [];
  const globalApiOnlySamples: Array<{
    operationId: string;
    operationDate?: string;
    typeOfOperation?: string;
    accountAmount?: number;
    category?: string;
    payPurpose?: string;
    accountId: number;
    accountName: string;
    accountNumber: string;
  }> = [];

  let appContext: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null =
    null;
  let tbankSyncService: TbankSyncService | null = null;
  let projectIds:
    | { generalId: number; easyneonId: number; easybookId: number }
    | null = null;

  if (options.applyFix) {
    appContext = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });
    tbankSyncService = appContext.get(TbankSyncService);
    projectIds = await resolveProjectIds();
  }

  for (const account of accounts) {
    console.log(
      `\n=== Счет ${account.id} | ${account.name} | ${account.accountNumber} ===`,
    );

    const [dbRows, apiOps] = await Promise.all([
      prisma.originalOperationFromTbank.findMany({
        where: {
          accountId: account.id,
          operationDate: {
            gte: dbFromIso,
            lte: dbToIso,
          },
        },
        select: {
          id: true,
          operationId: true,
          operationDate: true,
          typeOfOperation: true,
          accountAmount: true,
          category: true,
          payPurpose: true,
          accountId: true,
        },
        orderBy: [{ operationDate: 'desc' }, { id: 'desc' }],
      }),
      fetchOperationsFromApiByPeriod(account.accountNumber, options.from, options.to),
    ]);

    const dbOperationIds = new Set(dbRows.map((row) => row.operationId));
    const apiOperationIds = new Set(
      apiOps.map((op) => op.operationId).filter(Boolean),
    );

    const dbOnlyRows = dbRows.filter((row) => !apiOperationIds.has(row.operationId));
    const apiOnlyOps = apiOps.filter((op) => !dbOperationIds.has(op.operationId));
    const intersectionCount = [...dbOperationIds].filter((id) =>
      apiOperationIds.has(id),
    ).length;
    const apiOnlyCount = [...apiOperationIds].filter((id) => !dbOperationIds.has(id))
      .length;

    totalDbCount += dbRows.length;
    totalApiCount += apiOps.length;
    totalDbOnlyCount += dbOnlyRows.length;
    totalIntersectionCount += intersectionCount;
    totalApiOnlyCount += apiOnlyCount;

    console.log(`БД операций за период: ${dbRows.length}`);
    console.log(`API операций за период: ${apiOps.length}`);
    console.log(`Есть и в БД, и в API (по operationId): ${intersectionCount}`);
    console.log(`Есть в БД, но нет в API: ${dbOnlyRows.length}`);
    console.log(`Есть в API, но нет в БД: ${apiOnlyCount}`);

    if (options.applyFix && tbankSyncService && projectIds) {
      const applyResult = await applyDbApiDiffForAccount({
        account,
        dbOnlyRows: dbOnlyRows.map((row) => ({ id: row.id })),
        apiOnlyOps,
        tbankSyncService,
        projectIds,
      });

      totalAppliedCreated += applyResult.createdCount;
      totalAppliedDeletedOriginals += applyResult.deletedOriginalsCount;
      totalAppliedDeletedPositions += applyResult.deletedPositionsCount;

      console.log(
        `APPLY: created(api-only via TbankSyncService)=${applyResult.createdCount}, deleted originals(db-only)=${applyResult.deletedOriginalsCount}, deleted positions=${applyResult.deletedPositionsCount}`,
      );
    }

    for (const row of dbOnlyRows) {
      if (globalDbOnlySamples.length >= options.sampleLimit) break;
      globalDbOnlySamples.push({
        ...row,
        accountName: account.name,
        accountNumber: account.accountNumber,
      });
    }
    for (const op of apiOnlyOps) {
      if (globalApiOnlySamples.length >= options.sampleLimit) break;
      globalApiOnlySamples.push({
        operationId: op.operationId,
        operationDate: op.operationDate,
        typeOfOperation: op.typeOfOperation,
        accountAmount: op.accountAmount,
        category: op.category,
        payPurpose: op.payPurpose,
        accountId: account.id,
        accountName: account.name,
        accountNumber: account.accountNumber,
      });
    }
  }

  console.log('\n==================== ИТОГО ====================');
  console.log(`Период: ${options.from} .. ${options.to}`);
  console.log(`Счетов проверено: ${accounts.length}`);
  console.log(`БД операций (сумма по счетам): ${totalDbCount}`);
  console.log(`API операций (сумма по счетам): ${totalApiCount}`);
  console.log(`Совпало по operationId: ${totalIntersectionCount}`);
  console.log(`В БД, но нет в API: ${totalDbOnlyCount}`);
  console.log(`В API, но нет в БД: ${totalApiOnlyCount}`);
  if (options.applyFix) {
    console.log(`\nПрименено изменений:`);
    console.log(`Создано api-only (через TbankSyncService): ${totalAppliedCreated}`);
    console.log(`Удалено db-only OriginalOperationFromTbank: ${totalAppliedDeletedOriginals}`);
    console.log(`Удалено связанных OperationPosition: ${totalAppliedDeletedPositions}`);
  }

  if (options.sampleLimit > 0 && globalDbOnlySamples.length > 0) {
    console.log(
      `\nПримеры "есть в БД, но нет в API" (до ${options.sampleLimit} записей):`,
    );
    for (const row of globalDbOnlySamples) {
      console.log(
        `- id=${row.id}, opId=${row.operationId}, dt=${row.operationDate}, type=${row.typeOfOperation}, amount=${row.accountAmount}, category=${row.category}, accountId=${row.accountId}, account=${row.accountName} (${row.accountNumber})`,
      );
      if (row.payPurpose) {
        console.log(`  payPurpose: ${row.payPurpose}`);
      }
    }

    if (options.payPurposeContains) {
      const payPurposeNeedle = options.payPurposeContains;
      const filteredByPayPurpose = globalDbOnlySamples.filter((row) =>
        row.payPurpose?.includes(payPurposeNeedle),
      );

      console.log(
        `\nПримеры db-only c payPurpose содержит "${payPurposeNeedle}" (в пределах sampleLimit=${options.sampleLimit}): ${filteredByPayPurpose.length}`,
      );
      for (const row of filteredByPayPurpose) {
        console.log(
          `- id=${row.id}, opId=${row.operationId}, dt=${row.operationDate}, type=${row.typeOfOperation}, amount=${row.accountAmount}, category=${row.category}, accountId=${row.accountId}, account=${row.accountName} (${row.accountNumber})`,
        );
        if (row.payPurpose) {
          console.log(`  payPurpose: ${row.payPurpose}`);
        }
      }
    }
  }

  if (options.sampleLimit > 0 && globalApiOnlySamples.length > 0) {
    console.log(
      `\nПримеры "есть в API, но нет в БД" (до ${options.sampleLimit} записей):`,
    );
    for (const row of globalApiOnlySamples) {
      console.log(
        `- opId=${row.operationId}, dt=${row.operationDate || ''}, type=${row.typeOfOperation || ''}, amount=${row.accountAmount ?? ''}, category=${row.category || ''}, accountId=${row.accountId}, account=${row.accountName} (${row.accountNumber})`,
      );
      if (row.payPurpose) {
        console.log(`  payPurpose: ${row.payPurpose}`);
      }
    }

    if (options.payPurposeContains) {
      const payPurposeNeedle = options.payPurposeContains;
      const filteredByPayPurpose = globalApiOnlySamples.filter((row) =>
        row.payPurpose?.includes(payPurposeNeedle),
      );

      console.log(
        `\nПримеры api-only c payPurpose содержит "${payPurposeNeedle}" (в пределах sampleLimit=${options.sampleLimit}): ${filteredByPayPurpose.length}`,
      );
      for (const row of filteredByPayPurpose) {
        console.log(
          `- opId=${row.operationId}, dt=${row.operationDate || ''}, type=${row.typeOfOperation || ''}, amount=${row.accountAmount ?? ''}, category=${row.category || ''}, accountId=${row.accountId}, account=${row.accountName} (${row.accountNumber})`,
        );
        if (row.payPurpose) {
          console.log(`  payPurpose: ${row.payPurpose}`);
        }
      }
    }
  }

  if (appContext) {
    await appContext.close();
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
