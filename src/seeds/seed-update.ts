import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      fullName: {
        in: ['Татьяна Швец'],
      },
    },
    include: {
      managerReports: {
        where: {
          date: {
            startsWith: '2025-05',
          },
        },
      },
    },
  });
  const usersIds = users.map((u) => u.id);
  //update users isIntern = true
  await prisma.user.updateMany({
    where: {
      id: {
        in: usersIds,
      },
    },
    data: {
      isIntern: true,
    },
  });
  //update managerReports shiftCost = 800
  const userReportsIds = users.map((u) => u.managerReports.map((r) => r.id));
  await prisma.managerReport.updateMany({
    where: {
      id: {
        in: userReportsIds.flat(),
      },
    },
    data: {
      shiftCost: 800,
    },
  });
  console.log(
    users.map((u) => {
      return {
        shiftCost: u.managerReports.map((r) => r.shiftCost),
        intern: u.isIntern,
      };
    }),
  );
}

main();
