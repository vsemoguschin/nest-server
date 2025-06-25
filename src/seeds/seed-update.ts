import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.deleteMany({
    where: {
      id: {
        in: [74, 41, 42],
      },
    },
  });

  await prisma.refreshToken.deleteMany({
    where: {
      userId: {
        in: [83, 40],
      },
    },
  });

  const user2 = await prisma.user.deleteMany({
    where: {
      id: {
        in: [83, 40],
      },
    },
    // include: {
    //   refreshTokens: true,
    // },
  });

  console.log(user);
}

main();
