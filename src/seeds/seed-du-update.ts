import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Fetch all deals including their associated dealUsers
    const deals = await prisma.deal.findMany({
      include: {
        dealers: true,
      },
    });

    for (const deal of deals) {
      if (deal.dealers && deal.dealers.length > 0) {
        for (let i = 0; i < deal.dealers.length; i++) {
          const dealer = deal.dealers[i];
          await prisma.dealUser.update({
            where: { id: dealer.id },
            data: { idx: i },
          });
        }
      }
    }

    console.log('Fetched deals with dealUsers:', deals);
  } catch (error) {
    console.error('Error fetching deals:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
