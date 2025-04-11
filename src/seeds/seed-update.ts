import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Fetch all deals including their associated dealUsers
    const ws = await prisma.workSpace.findFirst({
      where: {
        title: 'B2B',
      },
    });
    if (!ws) {
      throw new Error('DealSource not found');
    }
    //delete ds
    await prisma.adSource.create({
      data: {
        title: 'ВК для отдела B2B',
        workSpaceId: ws.id,
      },
    });
  } catch (error) {
    console.error('Error fetching deals:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
