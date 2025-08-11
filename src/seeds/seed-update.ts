import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  try {

    await prisma.adSource.updateMany({
      where: {
        id: {
          in: [6, 7],
        },
      },
      data: {
        workSpaceId: 3,
        groupId: 18,
      },
    });

    const adExpense = await prisma.adExpense.updateMany({
      where: {
        date: {
          startsWith: '2025-08',
        },
        workSpaceId: 2,
        groupId: 2
      },
      data: {
        workSpaceId: 3,
        groupId: 18,
      },
    });

    console.log(adExpense);
  } catch (e) {
    console.log(e);
  }
}

main();
