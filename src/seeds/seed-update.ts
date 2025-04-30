import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // найти все сделки с категорией "Услуги" и обновить их категорию на Предложения услуг
    const updatedDeals = await prisma.deal.updateMany({
      where: {
        category: 'Услуги',
      },
      data: {
        category: 'Предложения услуг',
      },
    });

    //найти все сделки с категорией "Товары для бизнеса" и обновить их категорию на Оборудование для бизнеса
    const updatedDeals2 = await prisma.deal.updateMany({
      where: {
        category: 'Товары для бизнеса',
      },
      data: {
        category: 'Оборудование для бизнеса',
      },
    });
    // найти все сделки с категорией "Мебель" и "Интерьер" и обновить их категорию на "Мебель и интерьер"
    const updatedDeals3 = await prisma.deal.updateMany({
      where: {
        category: {
          in: ['Мебель', 'Интерьер'],
        },
      },
      data: {
        category: 'Мебель и интерьер',
      },
    });

    const updatedUsersInterns = await prisma.user.findMany({
      where: {
        fullName: {
          in: ['Гасымова', 'Швец', 'Алдобаева', 'Дегтярева', 'Ильина'],
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
    console.log('updatedReports', updatedReports);
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
