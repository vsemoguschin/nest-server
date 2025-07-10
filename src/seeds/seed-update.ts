import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  try {
    const user = await prisma.user.update({
      where: {
        id: 111,
      },
      data: {
        isIntern: false,
      },
    });

    const reportsJune = await prisma.managerReport.findMany({
      where: {
        userId: 111,
        date: {
          lte: '2025-07-00',
        },
      },
    });
    console.log(reportsJune);
    const reportsJuneIds = reportsJune.map((r) => r.id);
    await prisma.managerReport.updateMany({
      where: {
        id: {
          in: reportsJuneIds,
        },
      },
      data: {
        shiftCost: 800,
      },
    });

    const reportsJule = await prisma.managerReport.findMany({
      where: {
        userId: 111,
        date: {
          startsWith: '2025-07',
        },
      },
    });
    const reportsJuleIds = reportsJule.map((r) => r.id);

    await prisma.managerReport.updateMany({
      where: {
        id: {
          in: reportsJuleIds,
        },
      },
      data: {
        shiftCost: 666.67,
      },
    });
  } catch (e) {
    console.log(e);
  }
  // const accounts = [
  //   {
  //     name: 'Основной счет 7213',
  //     accountNumber: '40802810800000977213',
  //     balance: 0,
  //     type: 'Безналичный',
  //   },
  //   {
  //     name: 'Кредитный счет 4658',
  //     accountNumber: '40802810900002414658',
  //     balance: 0,
  //     type: 'Безналичный',
  //   },
  // ];
  // const data = await prisma.planFactAccount.createMany({
  //   data: accounts,
  // });
}

main();
