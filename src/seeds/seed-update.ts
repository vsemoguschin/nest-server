import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  // await prisma.client.deleteMany({
  //   where: { userId: 17 },
  // });
  // const clients = await prisma.client.update({
  //   where: { id: 192 },
  //   data: {
  //     userId: 12,
  //   },
  // });
  const user = await prisma.user.findUnique({
    where: {
      id: 17
    }
  })
  const clients = await prisma.client.findMany({
    where: {
      userId: {
        in: [17, 45, 49],
      },
    },
  });
  const deals = await prisma.user.deleteMany({
    where: {
      id: {
        in: [45, 49],
      },
    },
  });


  console.log(clients, deals, user);
}

main();
