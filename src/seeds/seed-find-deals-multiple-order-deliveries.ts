import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const grouped = await prisma.delivery.groupBy({
    by: ['dealId'],
    where: {
      purpose: 'Заказ',
    },
    _count: {
      _all: true,
    },
  });

  const duplicates = grouped.filter((item) => (item._count?._all ?? 0) > 1);

  console.log(
    `[Delivery Seed] Deals with multiple deliveries (purpose=Заказ): ${duplicates.length}`,
  );

  if (duplicates.length === 0) {
    return;
  }

  const dealIds = duplicates.map((item) => item.dealId);
  const deals = await prisma.deal.findMany({
    where: { id: { in: dealIds } },
    select: { id: true, title: true, saleDate: true },
  });
  const dealMap = new Map(
    deals.map((deal) => [deal.id, { title: deal.title, saleDate: deal.saleDate }]),
  );

  duplicates
    .map((item) => {
      const deal = dealMap.get(item.dealId);
      return {
        dealId: item.dealId,
        deliveries: item._count?._all ?? 0,
        saleDate: deal?.saleDate ?? '',
        title: deal?.title ?? '',
      };
    })
    .sort((a, b) => {
      const dateCompare = a.saleDate.localeCompare(b.saleDate);
      if (dateCompare !== 0) return dateCompare;
      return a.dealId - b.dealId;
    })
    .forEach((item) => {
      console.log(
        `dealId=${item.dealId} deliveries=${item.deliveries} saleDate=${item.saleDate} title="${item.title}" url=http://localhost:3000/deals/${item.dealId}`,
      );
    });
}

run()
  .catch((error) => {
    console.error('[Delivery Seed] Fatal error', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
