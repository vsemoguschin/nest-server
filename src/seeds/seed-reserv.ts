import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const deals = await prisma.deal.findMany({
    where: {
      payments: {
        some: {
          reservation: true,
        },
      },
    },
    include: {
      payments: true,
    },
  });
  console.log('Deals with reservation payments:', deals);

  // всем сделкам присвоить reservation = true
  await prisma.deal.updateMany({
    where: {
      payments: {
        some: {
          reservation: true,
        },
      },
    },
    data: {
      reservation: true,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
