/**
 * Cleanup script for duplicate OperationPosition rows.
 *
 * Duplicates were caused by a race condition between hourly T-Bank sync and
 * manual position editing (see audit report, 2026-05-11).
 *
 * Usage:
 *   # Dry-run (safe, default): show what would be deleted
 *   ts-node --transpile-only -r tsconfig-paths/register src/scripts/planfact-cleanup-duplicate-positions.ts
 *
 *   # Apply: actually delete safe sync duplicates
 *   APPLY=true ts-node --transpile-only -r tsconfig-paths/register src/scripts/planfact-cleanup-duplicate-positions.ts
 *
 * Classification (source field is NOT used — all old rows got MANUAL by default):
 *
 *   sync_full_amount_duplicate:
 *     - positionsSum > accountAmount
 *     - at least one position has amount == accountAmount
 *     - after removing that position, remaining positions sum == accountAmount
 *     - Safe to auto-delete that position (it's the sync-injected duplicate).
 *
 *   valid_manual_split:
 *     - positionsSum == accountAmount (regardless of position count)
 *     - no action needed
 *
 *   conflict:
 *     - positionsSum > accountAmount but no single full-amount position found,
 *       OR removing full-amount positions still doesn't restore the correct sum
 *     - manual review required
 *
 *   safe_full_duplicate (all positions identical, each == accountAmount):
 *     - keep lowest id, delete rest
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === 'true';
const EPS = 0.001;

interface PositionRow {
  id: number;
  amount: number;
  period: string | null;
  source: string;
  counterPartyId: number | null;
  expenseCategoryId: number | null;
  projectId: number | null;
}

interface OperationWithPositions {
  id: number;
  operationId: string;
  accountId: number;
  operationDate: string;
  accountAmount: number;
  positions: PositionRow[];
}

type ClassificationType =
  | 'safe_full_duplicate'
  | 'sync_full_amount_duplicate'
  | 'valid_manual_split'
  | 'conflict';

interface Classification {
  type: ClassificationType;
  reason: string;
  toDelete: number[];
  toKeep: number[];
  positionSum: number;
}

function posSum(positions: PositionRow[]): number {
  return positions.reduce((acc, p) => acc + p.amount, 0);
}

function fingerprint(p: PositionRow): string {
  return `${p.amount}|${p.period ?? ''}|${p.counterPartyId ?? ''}|${p.expenseCategoryId ?? ''}|${p.projectId ?? ''}`;
}

function classifyOperation(op: OperationWithPositions): Classification {
  const { positions, accountAmount } = op;
  const totalSum = posSum(positions);
  const allIds = positions.map((p) => p.id).sort((a, b) => a - b);

  // Case 1: sum already correct — valid split or nothing to do.
  if (Math.abs(totalSum - accountAmount) <= EPS) {
    const first = positions[0];
    const allIdentical = positions.every((p) => fingerprint(p) === fingerprint(first));
    // Edge: multiple identical positions each equal to accountAmount (shouldn't happen after fix,
    // but handle gracefully — sum would be N*accountAmount, caught above only if N==1).
    // If we're here, sum == accountAmount with multiple positions → either 1 pos or valid split.
    return {
      type: 'valid_manual_split',
      reason: `Сумма позиций (${totalSum.toFixed(2)}) == accountAmount — валидное разбиение или одна позиция`,
      toDelete: [],
      toKeep: allIds,
      positionSum: totalSum,
    };
  }

  // From here: totalSum != accountAmount (most likely totalSum > accountAmount).

  // Case 2: all positions identical and each == accountAmount → classic safe full duplicate.
  const first = positions[0];
  const allIdentical = positions.every((p) => fingerprint(p) === fingerprint(first));
  if (allIdentical && Math.abs(first.amount - accountAmount) <= EPS) {
    const [keep, ...toDelete] = allIds;
    return {
      type: 'safe_full_duplicate',
      reason: `${positions.length} идентичных позиций, каждая amount=${first.amount} == accountAmount`,
      toDelete,
      toKeep: [keep],
      positionSum: totalSum,
    };
  }

  // Case 3: mixed positions, sum > accountAmount.
  // Look for full-amount positions (amount == accountAmount) — sync-injected candidates.
  const fullAmountPositions = positions.filter((p) => Math.abs(p.amount - accountAmount) <= EPS);
  const otherPositions = positions.filter((p) => Math.abs(p.amount - accountAmount) > EPS);

  if (fullAmountPositions.length === 0) {
    return {
      type: 'conflict',
      reason: `Сумма позиций (${totalSum.toFixed(2)}) ≠ accountAmount (${accountAmount}), нет позиции на полную сумму`,
      toDelete: [],
      toKeep: allIds,
      positionSum: totalSum,
    };
  }

  // Check if removing ALL full-amount positions restores the correct sum.
  const otherSum = posSum(otherPositions);

  if (Math.abs(otherSum - accountAmount) <= EPS) {
    // Removing all full-amount positions leaves a correct split — delete all of them.
    return {
      type: 'sync_full_amount_duplicate',
      reason:
        `Удаление ${fullAmountPositions.length} позиций на полную сумму (amount=${accountAmount}) ` +
        `восстанавливает правильную сумму разбиения (${otherSum.toFixed(2)})`,
      toDelete: fullAmountPositions.map((p) => p.id),
      toKeep: otherPositions.map((p) => p.id).sort((a, b) => a - b),
      positionSum: totalSum,
    };
  }

  // Check if removing only ONE full-amount position restores the correct sum.
  // (e.g. other positions sum to accountAmount - accountAmount = 0, which would be wrong;
  //  but maybe otherPositions + (fullAmountPositions.length - 1) * accountAmount == accountAmount)
  if (fullAmountPositions.length > 1) {
    const keepOneFullSum = otherSum + accountAmount * (fullAmountPositions.length - 1);
    if (Math.abs(keepOneFullSum - accountAmount) <= EPS) {
      const sortedFull = fullAmountPositions.map((p) => p.id).sort((a, b) => a - b);
      const [keepFull, ...deleteFull] = sortedFull;
      return {
        type: 'sync_full_amount_duplicate',
        reason:
          `Оставляем 1 из ${fullAmountPositions.length} полных позиций (id=${keepFull}), ` +
          `удаляем ${deleteFull.length} лишних`,
        toDelete: deleteFull,
        toKeep: [...otherPositions.map((p) => p.id), keepFull].sort((a, b) => a - b),
        positionSum: totalSum,
      };
    }
  }

  return {
    type: 'conflict',
    reason:
      `Сумма (${totalSum.toFixed(2)}) > accountAmount (${accountAmount}), ` +
      `есть ${fullAmountPositions.length} позиций на полную сумму, но удаление не восстанавливает правильную сумму`,
    toDelete: [],
    toKeep: allIds,
    positionSum: totalSum,
  };
}

async function fetchDuplicates(): Promise<OperationWithPositions[]> {
  const grouped = await prisma.$queryRaw<{ originalOperationId: number; cnt: bigint }[]>`
    SELECT "originalOperationId", COUNT(*) AS cnt
    FROM "OperationPosition"
    WHERE "originalOperationId" IS NOT NULL
    GROUP BY "originalOperationId"
    HAVING COUNT(*) > 1
  `;

  if (grouped.length === 0) return [];

  const ids = grouped.map((r) => r.originalOperationId);

  const operations = await (prisma as any).originalOperationFromTbank.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      operationId: true,
      accountId: true,
      operationDate: true,
      accountAmount: true,
      operationPositions: {
        select: {
          id: true,
          amount: true,
          period: true,
          source: true,
          counterPartyId: true,
          expenseCategoryId: true,
          projectId: true,
        },
        orderBy: { id: 'asc' },
      },
    },
  }) as Array<{
    id: number;
    operationId: string;
    accountId: number;
    operationDate: string;
    accountAmount: number;
    operationPositions: PositionRow[];
  }>;

  return operations.map((op) => ({
    id: op.id,
    operationId: op.operationId,
    accountId: op.accountId,
    operationDate: op.operationDate,
    accountAmount: op.accountAmount,
    positions: op.operationPositions,
  }));
}

function printOpHeader(op: OperationWithPositions, c: Classification): void {
  console.log(
    `  operationId=${op.operationId} accountId=${op.accountId} date=${op.operationDate}` +
      ` accountAmount=${op.accountAmount} posSum=${c.positionSum.toFixed(2)}`,
  );
}

function printPositions(positions: PositionRow[], markIds?: Set<number>): void {
  for (const p of positions) {
    const mark = markIds?.has(p.id) ? ' ← УДАЛИТЬ' : '';
    console.log(
      `    id=${p.id} amount=${p.amount} period=${p.period ?? '-'} source=${p.source}` +
        ` category=${p.expenseCategoryId ?? '-'} project=${p.projectId ?? '-'} counterParty=${p.counterPartyId ?? '-'}${mark}`,
    );
  }
}

async function main() {
  console.log(`\n=== Planfact Duplicate Position Cleanup ===`);
  console.log(`Mode: ${APPLY ? 'APPLY (destructive)' : 'DRY-RUN (safe)'}\n`);

  const operations = await fetchDuplicates();

  if (operations.length === 0) {
    console.log('Дублей не найдено. Всё чисто.\n');
    return;
  }

  const byType: Record<ClassificationType, { op: OperationWithPositions; c: Classification }[]> = {
    safe_full_duplicate: [],
    sync_full_amount_duplicate: [],
    valid_manual_split: [],
    conflict: [],
  };

  const safeDeleteIds: number[] = [];

  for (const op of operations) {
    const c = classifyOperation(op);
    byType[c.type].push({ op, c });
    if (c.type === 'safe_full_duplicate' || c.type === 'sync_full_amount_duplicate') {
      safeDeleteIds.push(...c.toDelete);
    }
  }

  const totalAutoDelete = safeDeleteIds.length;

  console.log(`Всего операций с 2+ позициями: ${operations.length}`);
  console.log(`  sync_full_amount_duplicate : ${byType.sync_full_amount_duplicate.length} операций → удалить ${byType.sync_full_amount_duplicate.reduce((s, { c }) => s + c.toDelete.length, 0)} позиций`);
  console.log(`  safe_full_duplicate        : ${byType.safe_full_duplicate.length} операций → удалить ${byType.safe_full_duplicate.reduce((s, { c }) => s + c.toDelete.length, 0)} позиций`);
  console.log(`  valid_manual_split         : ${byType.valid_manual_split.length} операций → не трогаем`);
  console.log(`  conflict                   : ${byType.conflict.length} операций → ручная проверка`);
  console.log(`  Итого к удалению: ${totalAutoDelete} позиций`);
  console.log('');

  if (byType.sync_full_amount_duplicate.length > 0) {
    console.log('--- sync_full_amount_duplicate ---');
    for (const { op, c } of byType.sync_full_amount_duplicate) {
      printOpHeader(op, c);
      console.log(`    причина: ${c.reason}`);
      printPositions(op.positions, new Set(c.toDelete));
    }
    console.log('');
  }

  if (byType.safe_full_duplicate.length > 0) {
    console.log('--- safe_full_duplicate ---');
    for (const { op, c } of byType.safe_full_duplicate) {
      printOpHeader(op, c);
      console.log(`    → оставить id=${c.toKeep[0]}, удалить: [${c.toDelete.join(',')}]`);
    }
    console.log('');
  }

  if (byType.conflict.length > 0) {
    console.log('--- conflict (ручная проверка) ---');
    for (const { op, c } of byType.conflict) {
      printOpHeader(op, c);
      console.log(`    причина: ${c.reason}`);
      printPositions(op.positions);
    }
    console.log('');
  }

  if (!APPLY) {
    console.log('Для применения запустите с APPLY=true.\n');
    return;
  }

  if (safeDeleteIds.length === 0) {
    console.log('Нечего удалять автоматически.\n');
    return;
  }

  console.log(`Удаляем ${safeDeleteIds.length} позиций...`);
  const deleted = await prisma.operationPosition.deleteMany({
    where: { id: { in: safeDeleteIds } },
  });
  console.log(`Удалено: ${deleted.count} позиций.\n`);

  if (byType.conflict.length > 0) {
    console.log(`Конфликтные операции (${byType.conflict.length}) НЕ тронуты — проверьте вручную.\n`);
  }

  console.log('Готово.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
