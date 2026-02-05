import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedOperationPositionsPeriod() {
  let updated = 0;

  for (;;) {
    const positions = await prisma.operationPosition.findMany({
      where: {
        period: null,
        originalOperationId: { not: null },
      },
      select: {
        id: true,
        originalOperation: {
          select: { operationDate: true },
        },
      },
      take: 1000,
    });

    if (positions.length === 0) break;

    const updates = positions
      .map((pos) => {
        const period = pos.originalOperation?.operationDate?.slice(0, 7);
        if (!period) return null;
        return prisma.operationPosition.update({
          where: { id: pos.id },
          data: { period },
        });
      })
      .filter((op): op is ReturnType<typeof prisma.operationPosition.update> =>
        Boolean(op),
      );

    if (updates.length === 0) break;

    await prisma.$transaction(updates);
    updated += updates.length;
    console.log(`Обновлено позиций: ${updated}`);
  }

  console.log(`Готово. Всего обновлено позиций: ${updated}`);
}

async function main() {
  try {
    await seedOperationPositionsPeriod();
  } catch (error) {
    console.error('Ошибка при обновлении period в OperationPosition:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
