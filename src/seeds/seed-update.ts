// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GROUP_ID = 24;
const TARGET_WS_ID = 3;

async function main() {
  const ws = await prisma.workSpace.update({
    where: {
      id: 5
    },
    data: {
      title: 'Производство СПБ'
    }
  })
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
