import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {

    const updatedUsersInterns = await prisma.user.findMany({
      where: {
        fullName: {
          in: ['Гасымова Юлия', 'Татьяна Швец', 'Вероника Алдобаева', 'Евгения Дегтярева ', 'Наталья Ильина'],
        },
      },
    });
    console.log('updatedUsersInterns', updatedUsersInterns);
    //найти все отчеты менеджеров
    const updatedReports = await prisma.managerReport.updateMany({
      where: {
        userId: {
          in: updatedUsersInterns.map((user) => user.id),
        },
      },
      data: {
        shiftCost: 800,
      },
    });
    // console.log('updatedReports', updatedReports);
    await prisma.user.updateMany({
      where: {
        id: {
          in: updatedUsersInterns.map((user) => user.id),
        },
      },
      data: {
        isIntern: true,
      },
    });
  } catch (error) {
    console.error('Error updating workspace:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
