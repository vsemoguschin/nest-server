import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const sourceGroupId = 18;
  const targetGroupId = 3;
  const saleDates = ['2026-02-18', '2026-02-19'];

  try {
    const dealsBefore = await prisma.deal.findMany({
      where: {
        deletedAt: null,
        groupId: sourceGroupId,
        saleDate: { in: saleDates },
      },
      select: {
        id: true,
        title: true,
        saleDate: true,
        groupId: true,
      },
    });

    console.log(
      `[Seed] Найдено сделок для обновления: ${dealsBefore.length} (dates=${saleDates.join(', ')}, groupId=${sourceGroupId})`,
    );

    if (!dealsBefore.length) {
      console.log('[Seed] Обновление не требуется');
      return;
    }

    const result = await prisma.deal.updateMany({
      where: {
        id: { in: dealsBefore.map((deal) => deal.id) },
      },
      data: {
        groupId: targetGroupId,
      },
    });

    console.log(
      `[Seed] Обновлено сделок: ${result.count}. groupId: ${sourceGroupId} -> ${targetGroupId}`,
    );
  } catch (error) {
    console.error('[Seed] Ошибка выполнения сид-скрипта:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
