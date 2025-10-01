import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function renameRole(id: number, newFullName: string) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) {
    console.warn(`Role with id=${id} not found`);
    return;
  }
  if (role.fullName === newFullName) {
    console.log(`Role id=${id} already named '${newFullName}'`);
    return;
  }
  const updated = await prisma.role.update({
    where: { id },
    data: { fullName: newFullName },
    select: { id: true, shortName: true, fullName: true },
  });
  console.log(
    `Renamed role id=${updated.id} (${updated.shortName}) to '${updated.fullName}'`,
  );
}

async function main() {
  await renameRole(6, 'Менеджер продаж');
  await renameRole(8, 'Менеджер ведения');
  console.log('Role rename seeding complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
