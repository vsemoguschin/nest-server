import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Проверяем, существует ли роль
  let newRole = await prisma.role.findFirst({
    where: { shortName: 'GUEST' },
  });
  if (!newRole) {
    newRole = await prisma.role.create({
      data: {
        shortName: 'GUEST',
        fullName: 'Гость',
        department: 'GUESTS',
      },
    });
    console.log('Created Role:', newRole);
  } else {
    console.log('Role already exists:', newRole);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
