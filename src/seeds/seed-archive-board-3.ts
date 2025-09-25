import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const BOARD_ID = 3;
  const res = await prisma.kanbanTask.updateMany({
    where: {
      deletedAt: null,
      archived: false,
      boardId: BOARD_ID,
    },
    data: { archived: true },
  });
  console.log(`[seed-archive-board-3] archived=${res.count} tasks on boardId=${BOARD_ID}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

