// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GROUP_ID = 24;
const TARGET_WS_ID = 3;

async function main() {
  // Проверим, что группа существует (и заодно увидим текущий ws)
  const group = await prisma.group.findUnique({
    where: { id: GROUP_ID },
    select: { id: true, title: true, workSpaceId: true },
  });
  if (!group) {
    throw new Error(`Group ${GROUP_ID} not found`);
  }

  console.log(
    `Group "${group.title}" (${group.id}) current WS: ${group.workSpaceId} -> ${TARGET_WS_ID}`,
  );

  const results = await prisma.$transaction([
    // 1) Обновляем workSpaceId у самой группы
    prisma.group.update({
      where: { id: GROUP_ID },
      data: { workSpaceId: TARGET_WS_ID },
    }),

    // 2) Обновляем все дочерние записи по groupId
    prisma.client.updateMany({
      where: { groupId: GROUP_ID },
      data: { workSpaceId: TARGET_WS_ID },
    }),
    prisma.deal.updateMany({
      where: { groupId: GROUP_ID },
      data: { workSpaceId: TARGET_WS_ID },
    }),
    prisma.dop.updateMany({
      where: { groupId: GROUP_ID },
      data: { workSpaceId: TARGET_WS_ID },
    }),
    prisma.payment.updateMany({
      where: { groupId: GROUP_ID },
      data: { workSpaceId: TARGET_WS_ID },
    }),
    prisma.adExpense.updateMany({
      where: { groupId: GROUP_ID },
      data: { workSpaceId: TARGET_WS_ID },
    }),
    prisma.adSource.updateMany({
      where: { groupId: GROUP_ID },
      data: { workSpaceId: TARGET_WS_ID },
    }),
  ]);

  // Немного читаемого вывода:
  // results[0] — объект группы после update
  const [updatedGroup, clients, deals, dops, payments, adExpenses, adSources] =
    results as [
      any,
      { count: number },
      { count: number },
      { count: number },
      { count: number },
      { count: number },
      { count: number },
    ];

  console.log('Done.');
  console.table({
    groupId: updatedGroup.id,
    groupTitle: updatedGroup.title,
    groupWorkSpaceId: updatedGroup.workSpaceId,
    clients: clients.count,
    deals: deals.count,
    dops: dops.count,
    payments: payments.count,
    adExpenses: adExpenses.count,
    adSources: adSources.count,
  });
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
