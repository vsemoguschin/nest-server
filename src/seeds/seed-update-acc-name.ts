import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const acc = await prisma.planFactAccount.update({
    where: {
      id: 2
    },
    data: {
      name: 'Счет 4658'
    }
  })
  await prisma.planFactAccount.create({
    data: {
      name: 'Счет ИзиБук',
      accountNumber: '40802810900002610999'
    }
  })
  // console.log(acc);

}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
