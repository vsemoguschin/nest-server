import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const roles = await prisma.role.findMany({
      select: {
        id: true,
        shortName: true,
        fullName: true,
        department: true,
      },
      orderBy: { shortName: 'asc' },
    });

    const draft = roles.map((role) => ({
      id: role.id,
      shortName: role.shortName,
      fullName: role.fullName,
      department: role.department,
      description: '',
      responsibilities: [],
      permissions: [],
      scope: '',
      notes: '',
    }));

    console.log(JSON.stringify(draft, null, 2));
  } catch (error) {
    console.error('Ошибка при формировании черновика ролей:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
