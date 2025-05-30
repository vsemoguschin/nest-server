import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const stageList = [
  { title: 'Выгрузка', index: 1 },
  { title: 'Компоновка', index: 2 },
  { title: 'Фрезеровка', index: 3 },
  { title: 'Пленка', index: 4 },
  { title: 'Сборка', index: 5 },
  { title: 'В работе', index: 6 },
  { title: 'ОКК', index: 7 },
  { title: 'ОКК(Оплачено)', index: 8 },
  { title: 'Упаковано', index: 9 },
  { title: 'Оплачено', index: 10 },
  { title: 'Отправлена', index: 11 },
  { title: 'На исправлении', index: 12 },
  { title: 'Ремонт', index: 13 },
  { title: 'Возврат', index: 14 },
  { title: 'Брак', index: 15 },
];

async function main() {
  for (const stage of stageList) {
    await prisma.stage.upsert({
      where: { title: stage.title },
      update: { index: stage.index },
      create: {
        title: stage.title,
        index: stage.index,
      },
    });
  }
  console.log('Stages seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
