import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateDopsGroupAndWorkspace() {
  console.log('Начинаем обновление dop записей...');

  // Получаем все dop записи с их связанными deal
  const dops = await prisma.dop.findMany({
    include: {
      deal: {
        select: {
          id: true,
          groupId: true,
          workSpaceId: true,
        },
      },
    },
  });

  console.log(`Найдено ${dops.length} dop записей для обработки`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const dop of dops) {
    try {
      // Проверяем, что deal существует и имеет необходимые поля
      if (!dop.deal) {
        console.warn(
          `⚠️  Dop ID ${dop.id}: связанная deal не найдена, пропускаем`,
        );
        skippedCount++;
        continue;
      }

      if (!dop.deal.groupId || !dop.deal.workSpaceId) {
        console.warn(
          `⚠️  Dop ID ${dop.id}: deal не имеет groupId или workSpaceId, пропускаем`,
        );
        skippedCount++;
        continue;
      }

      // Проверяем, нужно ли обновление
      if (
        dop.groupId === dop.deal.groupId &&
        dop.workSpaceId === dop.deal.workSpaceId
      ) {
        console.log(`✓  Dop ID ${dop.id}: значения уже совпадают, пропускаем`);
        skippedCount++;
        continue;
      }

      // Обновляем dop
      await prisma.dop.update({
        where: { id: dop.id },
        data: {
          groupId: dop.deal.groupId,
          workSpaceId: dop.deal.workSpaceId,
        },
      });

      console.log(
        `✓  Dop ID ${dop.id}: обновлен (groupId: ${dop.groupId} → ${dop.deal.groupId}, workSpaceId: ${dop.workSpaceId} → ${dop.deal.workSpaceId})`,
      );
      updatedCount++;
    } catch (error) {
      console.error(`✗  Ошибка при обновлении dop ID ${dop.id}:`, error);
      errorCount++;
    }
  }

  console.log('\n=== Результаты обновления ===');
  console.log(`Обновлено: ${updatedCount}`);
  console.log(`Пропущено: ${skippedCount}`);
  console.log(`Ошибок: ${errorCount}`);
  console.log(`Всего обработано: ${dops.length}`);
}

async function main() {
  try {
    await updateDopsGroupAndWorkspace();
    console.log('\n✓ Скрипт успешно выполнен');
  } catch (error) {
    console.error('✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
