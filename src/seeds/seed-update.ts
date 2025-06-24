import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: {
      fullName: 'Варзар Глеб',
    },
  });

  await prisma.user.update({
    where: {
      id: user?.id,
    },
    data: {
      isIntern: true,
    },
  });
}

main();
