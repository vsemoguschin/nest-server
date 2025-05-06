import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const updatedUsersInterns = await prisma.user.findMany({
      where: {
        fullName: {
          in: ['Гасымова Юлия'],
        },
      },
    });
    console.log('updatedUsersInterns', updatedUsersInterns);

    // console.log('updatedReports', updatedReports);
    await prisma.user.updateMany({
      where: {
        id: {
          in: updatedUsersInterns.map((user) => user.id),
        },
      },
      data: {
        isIntern: false,
      },
    });
  } catch (error) {
    console.error('Error updating:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
