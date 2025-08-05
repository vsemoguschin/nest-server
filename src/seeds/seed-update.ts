import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  try {
    const names = [20, 21, 23, 22];
    prisma.group.deleteMany({
      where: {
        id: {
          in: names,
        },
      },
    });
  } catch (e) {
    console.log(e);
  }
}

main();
