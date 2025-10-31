import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
// Используем any для обхода проблемы с типами до генерации Prisma
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extendedPrisma = prisma as any;

async function upsertRule(data: {
  name: string;
  priority: number;
  keywords: string[];
  operationType: 'Debit' | 'Credit' | 'Any';
  expenseCategoryId: number;
}) {
  // upsert по имени правила
  const existing = await extendedPrisma.autoCategoryRule.findFirst({
    where: { name: data.name },
  });

  const ruleData = {
    enabled: true,
    priority: data.priority,
    name: data.name,
    description: '',
    keywords: data.keywords,
    operationType: data.operationType,
    expenseCategoryId: data.expenseCategoryId,
  };

  if (existing) {
    return extendedPrisma.autoCategoryRule.update({
      where: { id: existing.id },
      data: ruleData,
    });
  }

  return extendedPrisma.autoCategoryRule.create({
    data: ruleData,
  });
}

async function main() {
  // Правила, заменяющие хардкод по payPurpose
  await upsertRule({
    name: 'Продажа по СБП',
    priority: 10,
    keywords: ['пополнение', 'операции', 'сбп', 'терминал'],
    operationType: 'Credit',
    expenseCategoryId: 2,
  });

  await upsertRule({
    name: 'Продажа через онлайн кассу',
    priority: 20,
    keywords: ['перевод', 'средств', 'договору', '7035739486'],
    operationType: 'Credit',
    expenseCategoryId: 4,
  });

  console.log('✅ Базовые правила автокатегоризации созданы/обновлены');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
