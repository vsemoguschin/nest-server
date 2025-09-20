import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const targetId = 5;
  const newTitle = 'Производство СПб';

  const exists = await prisma.board.findUnique({
    where: { id: targetId },
    select: { id: true, title: true },
  });

  if (!exists) {
    console.log(`Board #${targetId} not found`);
    return;
  }

  const updated = await prisma.board.update({
    where: { id: targetId },
    data: { title: newTitle },
    select: { id: true, title: true },
  });

  console.log(`Updated board #${updated.id} → title: "${updated.title}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

