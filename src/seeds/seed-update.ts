import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  try {
    const braga = await prisma.user.findUnique({
      where: {
        id: 114,
      },
    });
    const roles = await prisma.role.findMany();
    console.log(
      roles.map((r) => ({ name: r.fullName, id: r.id, sn: r.shortName })),
    );
    console.log(braga);
    await prisma.user.update({
      where: {
        id: 114,
      },
      data: {
        roleId: 12,
      },
    });
    await prisma.user.update({
      where: {
        id: 48,
      },
      data: {
        workSpaceId: 8,
        groupId: 15,
      },
    });
  } catch (e) {
    console.log(e);
  }
}

main();
