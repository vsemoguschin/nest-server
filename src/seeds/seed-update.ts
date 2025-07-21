import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  try {
    // const deletedUser = await prisma.user.findMany({
    //   where: {
    //     fullName: 'Егор Корякин',
    //   },
    // });
    // await prisma.user.update({
    //   where: {
    //     id: deletedUser[0].id,
    //   },
    //   data: {
    //     deletedAt: null,
    //   },
    // });

    const dekt = await prisma.user.findFirst({
      where: {
        fullName: {
          in: ['Евгения Дегтярева '],
        },
      },
      include: {
        managerReports: {
          where: {
            date: {
              startsWith: '2025-07',
            },
          },
        },
      },
    });
    if (dekt) {
      await prisma.user.update({
        where: {
          id: dekt.id,
        },
        data: {
          fullName: 'Евгения Дегтярева',
        },
      });
      await prisma.managerReport.updateMany({
        where: {
          userId: dekt.id,
        },
        data: {
          shiftCost: 666.67,
        },
      });
    }

    const zenc = await prisma.user.findFirst({
      where: {
        fullName: {
          in: ['Святослав Зенков'],
        },
      },
      include: {
        managerReports: {
          where: {
            date: {
              startsWith: '2025-07',
            },
          },
        },
      },
    });
    if (zenc) {
      await prisma.managerReport.updateMany({
        where: {
          userId: zenc?.id,
        },
        data: {
          shiftCost: 666.67,
        },
      });
      console.log(zenc?.managerReports);
    }
    return;

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
