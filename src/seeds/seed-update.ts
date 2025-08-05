import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  try {
    const names = [20, 21, 23, 22];
    const gs = await prisma.group.deleteMany({
      where: {
        id: {
          in: names,
        },
      },
    });
    // await prisma.group.delete({
    //   where: {
    //     id: 20,
    //   },
    // });
    // console.log(gs);
  } catch (e) {
    console.log(e);
  }
}

main();
