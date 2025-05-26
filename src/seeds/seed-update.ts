import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  await prisma.adSource.create({
    data: {
      title: 'Бизнес Неон',
      workSpaceId: 2,
    },
  });
}

main();
