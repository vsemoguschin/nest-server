import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const BOARD_ID = 3;
  const DAYS = 5;
  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  // 1) Заархивировать все задачи старше 5 дней
  const arch = await prisma.kanbanTask.updateMany({
    where: {
      deletedAt: null,
      boardId: BOARD_ID,
      createdAt: { lt: cutoff },
      archived: false,
    },
    data: { archived: true },
  });

  // 2) Снять архив для задач моложе 5 дней (на всякий случай выровнять состояние)
  const unarch = await prisma.kanbanTask.updateMany({
    where: {
      deletedAt: null,
      boardId: BOARD_ID,
      createdAt: { gte: cutoff },
      archived: true,
    },
    data: { archived: false },
  });

  console.log(
    `[seed-archive-board-3] cutoff=${cutoff.toISOString()} archived=${arch.count} unarchived=${unarch.count} boardId=${BOARD_ID}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
