import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  await prisma.dealSource.update({
    where: {
      title: 'Telegram'
    },
    data: {
      title: 'Телеграм 0501',
    },
  });
}

main();
