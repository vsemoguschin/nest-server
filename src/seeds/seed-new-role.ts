import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Проверяем, существует ли роль
  let newRole = await prisma.role.findFirst({
    where: { shortName: 'BUKH' },
  });
  if (!newRole) {
    newRole = await prisma.role.create({
      data: {
        shortName: 'BUKH',
        fullName: 'Бухгалтер',
        department: 'FINANCE',
      },
    });
    console.log('Created Role:', newRole);
  } else {
    console.log('Role already exists:', newRole);
  }

  // Проверяем, существует ли рабочее пространство
  let newWorkSpace = await prisma.workSpace.findFirst({
    where: { title: 'Остальные' },
  });
  if (!newWorkSpace) {
    newWorkSpace = await prisma.workSpace.create({
      data: {
        title: 'Остальные',
        department: 'OTHERS',
      },
    });
    console.log('Created WorkSpace:', newWorkSpace);
  } else {
    console.log('WorkSpace already exists:', newWorkSpace);
  }

  // Проверяем, существует ли группа рабочего пространства
  let newWorkSpaceGroup = await prisma.group.findFirst({
    where: { title: 'Финансы', workSpaceId: newWorkSpace.id },
  });
  if (!newWorkSpaceGroup) {
    newWorkSpaceGroup = await prisma.group.create({
      data: {
        title: 'Финансы',
        workSpaceId: newWorkSpace.id,
      },
    });
    console.log('Created WorkSpaceGroup:', newWorkSpaceGroup);
  } else {
    console.log('WorkSpaceGroup already exists:', newWorkSpaceGroup);
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