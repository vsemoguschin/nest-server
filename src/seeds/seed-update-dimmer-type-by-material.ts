// Запуск: cd crm/nest && npx ts-node src/seeds/seed-update-dimmer-type-by-material.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateDimmerTypeByMaterial() {
  const polyResult = await prisma.taskOrder.updateMany({
    where: { material: 'Поликарбонат', dimmer: true },
    data: { dimmerType: 'Пульт' },
  });

  const pvcResult = await prisma.taskOrder.updateMany({
    where: { material: 'ПВХ', dimmer: true },
    data: { dimmerType: 'Кнопка' },
  });

  console.log(
    `TaskOrder: обновлено Поликарбонат=${polyResult.count}, ПВХ=${pvcResult.count}`,
  );
}

async function main() {
  try {
    await updateDimmerTypeByMaterial();
    console.log('✓ Скрипт завершен без ошибок');
  } catch (error) {
    console.error('✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
