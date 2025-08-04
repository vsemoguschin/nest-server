import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  try {
    const names = ['ИзиСветильник', 'ИзиБук', 'Авито'];

    await prisma.group.update({
      where: {
        id: 3,
      },
      data: {
        title: 'ВК',
      },
    });

    await prisma.group.create({
      data: {
        title: 'ИзиКурс',
        workSpaceId: 2,
      },
    });

    Promise.all(
      names.map(async (n) => {
        // await prisma.workSpace.create({
        //   data: {
        //     title: n,
        //     department: 'COMMERCIAL',
        //   },
        // });
        await prisma.group.create({
          data: {
            title: n,
            workSpaceId: 3,
          },
        });
      }),
    );
  } catch (e) {
    console.log(e);
  }
}

main();
