import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const renames = [
  { from: 'Чёрные держатели', to: 'Держатели черные' },
  { from: 'Золотые держатели', to: 'Держатели золотые' },
  { from: 'Стальные держатели', to: 'Держатели стальные' },
];

async function main() {
  console.log('Старт: переименование позиций поставок');

  for (const { from, to } of renames) {
    const count = await prisma.suppliePosition.count({
      where: { name: from },
    });

    console.log(`Найдено записей для "${from}": ${count}`);

    if (count === 0) continue;

    const result = await prisma.suppliePosition.updateMany({
      where: { name: from },
      data: { name: to },
    });

    console.log(`Обновлено записей на "${to}": ${result.count}`);
  }

  console.log('Готово');
}

main()
  .catch((error) => {
    console.error('Ошибка выполнения скрипта:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
