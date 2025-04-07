import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Fetch all deals including their associated dealUsers
    const ds = await prisma.dealSource.findFirst({
      where: {
        title: 'вк'
      }
    });
    if (!ds) {
      throw new Error('DealSource not found');
    }
    //delete ds
    await prisma.dealSource.delete({
      where: {
        id: ds.id
      }
    });

  } catch (error) {
    console.error('Error fetching deals:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
