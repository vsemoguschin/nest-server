import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.dop.updateMany({
      where: {
        id: {
          in: [2192, 2193, 2194],
        },
      },
      data: {
        workSpaceId: 3,
        saleDate: '2025-04-14',
      },
    });
    await prisma.dop.update({
      where: {
        id: 2190,
      },
      data: {
        saleDate: '2025-04-19',
      },
    });
  } catch (error) {
    console.error('Error updating:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
