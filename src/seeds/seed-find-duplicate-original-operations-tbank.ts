import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

type CliOptions = {
  accountId?: number;
  from?: string;
  to?: string;
  limitGroups: number;
  pairsOffset: number;
  pairsLimit: number;
  json: boolean;
  verbose: boolean;
};

type PairMatch = {
  score: number;
  a: Row;
  b: Row;
  differingFields: string[];
};

type FlatDuplicatePair = {
  groupKey: string;
  score: number;
  differingFields: string[];
  a: Row;
  b: Row;
  latestCreatedAtMs: number;
};

type DuplicateCluster = {
  rowIds: number[];
  rowsCount: number;
  copiesCount: number; // rowsCount - 1
  copiesAmount: number; // сумма accountAmount лишних копий (оставляем 1 запись)
  typeOfOperation: string;
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
    limitGroups: 50,
    pairsOffset: 0,
    pairsLimit: 5,
    json: false,
    verbose: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--accountId=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n)) options.accountId = n;
    } else if (arg.startsWith('--from=')) {
      options.from = arg.split('=')[1];
    } else if (arg.startsWith('--to=')) {
      options.to = arg.split('=')[1];
    } else if (arg.startsWith('--limitGroups=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) options.limitGroups = n;
    } else if (arg.startsWith('--pairsOffset=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n >= 0) options.pairsOffset = Math.floor(n);
    } else if (arg.startsWith('--pairsLimit=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n >= 0) options.pairsLimit = Math.floor(n);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
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

function getSimilarityScore(a: Row, b: Row) {
  const sameExactDateTime = a.operationDate === b.operationDate;
  const sameDay = dateOnly(a.operationDate) === dateOnly(b.operationDate);

  const payPurposeMatch =
    !!normalize(a.payPurpose) && normalize(a.payPurpose) === normalize(b.payPurpose);
  const descriptionMatch =
    !!normalize(a.description) && normalize(a.description) === normalize(b.description);
  const counterPartyAccountMatch =
    !!normalize(a.counterPartyAccount) &&
    normalize(a.counterPartyAccount) === normalize(b.counterPartyAccount);
  const counterPartyInnMatch =
    !!normalize(a.counterPartyInn) && normalize(a.counterPartyInn) === normalize(b.counterPartyInn);
  const counterPartyTitleMatch =
    !!normalize(a.counterPartyTitle) &&
    normalize(a.counterPartyTitle) === normalize(b.counterPartyTitle);
  const counterPartyBicMatch =
    !!normalize(a.counterPartyBic) && normalize(a.counterPartyBic) === normalize(b.counterPartyBic);
  const categoryMatch =
    !!normalize(a.category) && normalize(a.category) === normalize(b.category);

  let score = 0;
  if (sameExactDateTime) score += 5;
  else if (sameDay) score += 1;

  if (payPurposeMatch) score += 5;
  if (descriptionMatch) score += 3;
  if (counterPartyAccountMatch) score += 4;
  if (counterPartyInnMatch) score += 2;
  if (counterPartyTitleMatch) score += 2;
  if (counterPartyBicMatch) score += 1;
  if (categoryMatch) score += 1;

  const hasStrongSignal =
    sameExactDateTime &&
    (payPurposeMatch || counterPartyAccountMatch || descriptionMatch);

  return hasStrongSignal ? score : 0;
}

function getDifferingFields(a: Row, b: Row) {
  const fields: Array<keyof Row> = [
    'operationId',
    'operationDate',
    'typeOfOperation',
    'category',
    'description',
    'payPurpose',
    'accountAmount',
    'counterPartyAccount',
    'counterPartyInn',
    'counterPartyKpp',
    'counterPartyBic',
    'counterPartyBankName',
    'counterPartyTitle',
    'expenseCategoryId',
    'expenseCategoryName',
    'accountId',
  ];

  return fields.filter((field) => {
    const av = a[field];
    const bv = b[field];
    if (typeof av === 'string' && typeof bv === 'string') {
      return av !== bv;
    }
    return av !== bv;
  });
}

function findLikelyDuplicatePairs(rows: Row[]): PairMatch[] {
  const pairs: PairMatch[] = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];

      if (a.operationId === b.operationId) {
        continue;
      }

      const score = getSimilarityScore(a, b);
      if (score < 10) {
        continue;
      }

      pairs.push({
        a,
        b,
        score,
        differingFields: getDifferingFields(a, b),
      });
    }
  }

  return pairs.sort((x, y) => y.score - x.score);
}

function buildDuplicateClusters(rows: Row[], pairs: PairMatch[]): DuplicateCluster[] {
  if (pairs.length === 0) return [];

  const byId = new Map(rows.map((row) => [row.id, row]));
  const adjacency = new Map<number, Set<number>>();

  const ensure = (id: number) => {
    if (!adjacency.has(id)) adjacency.set(id, new Set<number>());
    return adjacency.get(id)!;
  };

  for (const pair of pairs) {
    const aId = pair.a.id;
    const bId = pair.b.id;
    ensure(aId).add(bId);
    ensure(bId).add(aId);
  }

  const visited = new Set<number>();
  const clusters: DuplicateCluster[] = [];

  for (const startId of adjacency.keys()) {
    if (visited.has(startId)) continue;

    const stack = [startId];
    visited.add(startId);
    const component: number[] = [];

    while (stack.length > 0) {
      const id = stack.pop()!;
      component.push(id);

      for (const nextId of adjacency.get(id) || []) {
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        stack.push(nextId);
      }
    }

    const existingIds = component.filter((id) => byId.has(id)).sort((a, b) => a - b);
    if (existingIds.length < 2) continue;

    clusters.push({
      rowIds: existingIds,
      rowsCount: existingIds.length,
      copiesCount: existingIds.length - 1,
      // Внутри candidate group amount одинаковый, но считаем по факту размера кластера
      copiesAmount:
        (byId.get(existingIds[0])?.accountAmount || 0) * (existingIds.length - 1),
      typeOfOperation: byId.get(existingIds[0])?.typeOfOperation || 'Unknown',
    });
  }

  return clusters.sort((a, b) => b.rowsCount - a.rowsCount);
}

async function bootstrap() {
  const options = parseArgs(process.argv.slice(2));

  console.log('Поиск вероятных дублей OriginalOperationFromTbank');
  console.log('Параметры:', options);

  const rows = (await prisma.originalOperationFromTbank.findMany({
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
    orderBy: [{ accountId: 'asc' }, { operationDate: 'desc' }, { id: 'desc' }],
  })) as Row[];

  const filteredRows = rows.filter((row) =>
    inDateRange(row, options.from, options.to),
  );

  console.log(
    `Загружено записей: ${rows.length}, после фильтрации по дате: ${filteredRows.length}`,
  );

  const groups = new Map<string, Row[]>();
  for (const row of filteredRows) {
    const key = buildBaseKey(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const candidateGroups = [...groups.entries()]
    .map(([key, items]) => ({ key, items }))
    .filter((g) => g.items.length > 1);

  const allDuplicateGroups = candidateGroups
    .map((group) => ({
      ...group,
      pairs: findLikelyDuplicatePairs(group.items),
    }))
    .filter((group) => group.pairs.length > 0)
    .map((group) => ({
      ...group,
      clusters: buildDuplicateClusters(group.items, group.pairs),
    }))
    .sort((a, b) => {
      const maxA = Math.max(...a.pairs.map((p) => p.score));
      const maxB = Math.max(...b.pairs.map((p) => p.score));
      return maxB - maxA;
    });

  const results = allDuplicateGroups.slice(0, options.limitGroups);

  const flatDuplicatePairs: FlatDuplicatePair[] = allDuplicateGroups
    .flatMap((group) =>
      group.pairs.map((pair) => ({
        groupKey: group.key,
        score: pair.score,
        differingFields: pair.differingFields,
        a: pair.a,
        b: pair.b,
        latestCreatedAtMs: Math.max(
          new Date(pair.a.createdAt).getTime(),
          new Date(pair.b.createdAt).getTime(),
        ),
      })),
    )
    .sort((x, y) => {
      if (y.latestCreatedAtMs !== x.latestCreatedAtMs) {
        return y.latestCreatedAtMs - x.latestCreatedAtMs;
      }
      return y.score - x.score;
    });

  const pagedPairs = flatDuplicatePairs.slice(
    options.pairsOffset,
    options.pairsOffset + options.pairsLimit,
  );

  const duplicatePairsCount = allDuplicateGroups.reduce(
    (sum, group) => sum + group.pairs.length,
    0,
  );
  const duplicateClustersCount = allDuplicateGroups.reduce(
    (sum, group) => sum + group.clusters.length,
    0,
  );
  const exactCopiesCount = allDuplicateGroups.reduce(
    (sum, group) =>
      sum + group.clusters.reduce((inner, cluster) => inner + cluster.copiesCount, 0),
    0,
  );
  const exactCopiesAmount = allDuplicateGroups.reduce(
    (sum, group) =>
      sum + group.clusters.reduce((inner, cluster) => inner + cluster.copiesAmount, 0),
    0,
  );
  const exactCopiesAmountByType = allDuplicateGroups.reduce(
    (acc, group) => {
      for (const cluster of group.clusters) {
        if (cluster.typeOfOperation === 'Credit') {
          acc.credit += cluster.copiesAmount;
        } else if (cluster.typeOfOperation === 'Debit') {
          acc.debit += cluster.copiesAmount;
        } else {
          acc.other += cluster.copiesAmount;
        }
      }
      return acc;
    },
    { credit: 0, debit: 0, other: 0 },
  );
  const duplicateRowIds = new Set<number>();
  for (const group of allDuplicateGroups) {
    for (const pair of group.pairs) {
      duplicateRowIds.add(pair.a.id);
      duplicateRowIds.add(pair.b.id);
    }
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          totalRows: rows.length,
          checkedRows: filteredRows.length,
          candidateGroups: candidateGroups.length,
          duplicateGroups: allDuplicateGroups.length,
          duplicateClusters: duplicateClustersCount,
          duplicatePairs: duplicatePairsCount,
          duplicateRows: duplicateRowIds.size,
          exactCopies: exactCopiesCount,
          exactCopiesAmount,
          exactCopiesAmountByType,
          pairsPagination: {
            offset: options.pairsOffset,
            limit: options.pairsLimit,
            total: flatDuplicatePairs.length,
            shown: pagedPairs.length,
          },
          shownGroups: results.length,
          limitGroups: options.limitGroups,
          pairs: pagedPairs.map((pair) => ({
            groupKey: pair.groupKey,
            score: pair.score,
            differingFields: pair.differingFields,
            a: {
              id: pair.a.id,
              operationId: pair.a.operationId,
              operationDate: pair.a.operationDate,
              typeOfOperation: pair.a.typeOfOperation,
              accountAmount: pair.a.accountAmount,
              accountId: pair.a.accountId,
              category: pair.a.category,
              createdAt: pair.a.createdAt,
            },
            b: {
              id: pair.b.id,
              operationId: pair.b.operationId,
              operationDate: pair.b.operationDate,
              typeOfOperation: pair.b.typeOfOperation,
              accountAmount: pair.b.accountAmount,
              accountId: pair.b.accountId,
              category: pair.b.category,
              createdAt: pair.b.createdAt,
            },
          })),
          groups: results.map((g) => ({
            key: g.key,
            items: g.items,
            clusters: g.clusters,
            pairs: g.pairs.map((p) => ({
              score: p.score,
              differingFields: p.differingFields,
              a: { id: p.a.id, operationId: p.a.operationId },
              b: { id: p.b.id, operationId: p.b.operationId },
            })),
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Проверено операций: ${filteredRows.length}`);
  console.log(`Групп-кандидатов (дата+тип+сумма): ${candidateGroups.length}`);
  console.log(`Найдено групп дублей (всего): ${allDuplicateGroups.length}`);
  console.log(`Кластеров дублей (точных групп копий): ${duplicateClustersCount}`);
  console.log(`Найдено дублей (пар): ${duplicatePairsCount}`);
  console.log(`Уникальных записей в дублях: ${duplicateRowIds.size}`);
  console.log(`Точное количество копий (лишних записей): ${exactCopiesCount}`);
  console.log(
    `Сумма accountAmount лишних копий: ${exactCopiesAmount.toFixed(2)}`,
  );
  console.log(
    `Сумма лишних копий Credit: ${exactCopiesAmountByType.credit.toFixed(2)}`,
  );
  console.log(
    `Сумма лишних копий Debit: ${exactCopiesAmountByType.debit.toFixed(2)}`,
  );
  if (exactCopiesAmountByType.other > 0) {
    console.log(
      `Сумма лишних копий Other: ${exactCopiesAmountByType.other.toFixed(2)}`,
    );
  }
  if (allDuplicateGroups.length > options.limitGroups) {
    console.log(
      `Подробный вывод ограничен: будет показано ${options.limitGroups} из ${allDuplicateGroups.length} групп (--limitGroups=...)`,
    );
  }

  if (options.pairsLimit > 0) {
    console.log(
      `Пары дублей (последние по createdAt): показано ${pagedPairs.length} из ${flatDuplicatePairs.length} (offset=${options.pairsOffset}, limit=${options.pairsLimit})`,
    );
    for (const pair of pagedPairs) {
      const latestCreatedAt = new Date(pair.latestCreatedAtMs).toISOString();
      console.log(
        `  [${latestCreatedAt}] score=${pair.score} group=${pair.groupKey}`,
      );
      console.log(
        `    A: id=${pair.a.id}, opId=${pair.a.operationId}, dt=${pair.a.operationDate}, type=${pair.a.typeOfOperation}, amount=${pair.a.accountAmount}, category=${pair.a.category}`,
      );
      console.log(
        `    B: id=${pair.b.id}, opId=${pair.b.operationId}, dt=${pair.b.operationDate}, type=${pair.b.typeOfOperation}, amount=${pair.b.accountAmount}, category=${pair.b.category}`,
      );
      console.log(
        `    diff: ${pair.differingFields.length ? pair.differingFields.join(', ') : 'нет'}`,
      );
    }
  }

  if (!options.verbose) {
    return;
  }

  for (const group of results) {
    console.log('\n============================================================');
    console.log(`GROUP: ${group.key} (rows=${group.items.length})`);
    if (group.clusters.length > 0) {
      console.log(
        `  clusters: ${group.clusters.length}, exactCopiesInGroup=${group.clusters.reduce((sum, c) => sum + c.copiesCount, 0)}`,
      );
    }
    for (const pair of group.pairs) {
      console.log(
        `  pair score=${pair.score}: id=${pair.a.id}(${pair.a.operationId}) <-> id=${pair.b.id}(${pair.b.operationId})`,
      );
      console.log(
        `  differingFields: ${pair.differingFields.length ? pair.differingFields.join(', ') : 'нет'}`,
      );
    }
    if (group.clusters.length > 0) {
      for (const cluster of group.clusters) {
        console.log(
          `  cluster type=${cluster.typeOfOperation}, rows=${cluster.rowsCount}, copies=${cluster.copiesCount}, copiesAmount=${cluster.copiesAmount.toFixed(2)}, rowIds=[${cluster.rowIds.join(', ')}]`,
        );
      }
    }

    console.log('  rows:');
    for (const row of group.items) {
      console.log(
        `   - id=${row.id}, opId=${row.operationId}, dt=${row.operationDate}, amount=${row.accountAmount}, cpAcc="${row.counterPartyAccount}", inn="${row.counterPartyInn}", title="${row.counterPartyTitle}", category="${row.category}"`,
      );
      if (row.payPurpose) {
        console.log(`     payPurpose: ${row.payPurpose}`);
      }
      if (row.description) {
        console.log(`     description: ${row.description}`);
      }
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
