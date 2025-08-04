import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  try {
    // const names = ['ИзиСветильник', 'ИзиБук', 'Авито'];
    const names = ['ИзиСветильник', 'ИзиБук', 'ИзиКурс'];

    Promise.all(
      names.map(async (n) => {
        const ws = await prisma.workSpace.create({
          data: {
            title: n,
            department: 'COMMERCIAL',
          },
        });
        await prisma.group.create({
          data: {
            title: n,
            workSpaceId: ws.id,
          },
        });
      }),
    );
  } catch (e) {
    console.log(e);
  }
}

main();
