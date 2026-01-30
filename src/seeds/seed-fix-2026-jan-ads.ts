// Запуск: cd crm/nest && npx ts-node src/seeds/seed-fix-2026-jan-ads.ts (опц. BATCH_SIZE=500)
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_PREFIX = '2026-01';
const VAT_RATIO = 1.22 / 1.2; // 61/60 — переводим расходы с 20% на 22%
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 200);

const recalcFloat = (value: number) =>
  Math.round(value * VAT_RATIO * 100) / 100;
const recalcInt = (value: number) => Math.round(value * VAT_RATIO);

async function updateVkAdsDailyStat() {
  const total = await prisma.vkAdsDailyStat.count({
    where: { date: { startsWith: TARGET_PREFIX } },
  });

  console.log(`VkAdsDailyStat: найдено ${total} записей за ${TARGET_PREFIX}`);
  if (!total) return;

  const stats = await prisma.vkAdsDailyStat.findMany({
    where: { date: { startsWith: TARGET_PREFIX } },
    select: { id: true, spentNds: true },
    orderBy: { id: 'asc' },
  });

  let updated = 0;
  for (let i = 0; i < stats.length; i += BATCH_SIZE) {
    const batch = stats.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((stat) =>
        prisma.vkAdsDailyStat.update({
          where: { id: stat.id },
          data: { spentNds: recalcFloat(stat.spentNds ?? 0) },
        }),
      ),
    );
    updated += batch.length;
    console.log(`  VkAdsDailyStat: обновлено ${updated}/${stats.length}`);
  }
}

async function updateAdExpenses() {
  const total = await prisma.adExpense.count({
    where: { date: { startsWith: TARGET_PREFIX } },
  });

  console.log(`AdExpense: найдено ${total} записей за ${TARGET_PREFIX}`);
  if (!total) return;

  const expenses = await prisma.adExpense.findMany({
    where: { date: { startsWith: TARGET_PREFIX } },
    select: { id: true, price: true },
    orderBy: { id: 'asc' },
  });

  let updated = 0;
  for (let i = 0; i < expenses.length; i += BATCH_SIZE) {
    const batch = expenses.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((expense) =>
        prisma.adExpense.update({
          where: { id: expense.id },
          // Округляем, чтобы сохранить целочисленный price в БД.
          data: { price: recalcInt(expense.price) },
        }),
      ),
    );
    updated += batch.length;
    console.log(`  AdExpense: обновлено ${updated}/${expenses.length}`);
  }
}

async function main() {
  try {
    console.log(
      `Старт пересчета расходов за ${TARGET_PREFIX} (коэффициент ${VAT_RATIO.toFixed(
        6,
      )})`,
    );
    await updateVkAdsDailyStat();
    await updateAdExpenses();
    console.log('✓ Скрипт завершен без ошибок');
  } catch (error) {
    console.error('✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
