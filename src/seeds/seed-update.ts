import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  await prisma.adSource.create({
    data: {
      title: 'Telega.in',
      workSpaceId: 3,
    },
  });
  await prisma.adSource.create({
    data: {
      title: 'МТС Маркетолог',
      workSpaceId: 3,
    },
  });
}

main();
