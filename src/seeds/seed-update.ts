import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.update({
    where: {
      id: 46,
    },
    data: {
      fullName: 'Юлия Пихтова',
    },
  });

  console.log(user);
}

main();
