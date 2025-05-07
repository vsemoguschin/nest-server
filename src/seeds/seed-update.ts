import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.deal.update({
      where: {
        id: 1440,
      },
      data: {
        workSpaceId: 3,
        groupId: 3,
      },
    });
    await prisma.client.update({
      where: {
        id: 1359,
      },
      data: {
        workSpaceId: 3,
        groupId: 3,
      },
    });
  } catch (error) {
    console.error('Error updating:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
