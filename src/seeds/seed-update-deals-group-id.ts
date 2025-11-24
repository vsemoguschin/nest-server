import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateDealsGroupId() {
  console.log('Начинаем обновление groupId для сделок, payments и dops...');

  const dealIds = [2928, 2930];
  const targetGroupId = 19;

  let dealsUpdatedCount = 0;
  let dealsNotFoundCount = 0;
  let dealsAlreadyUpdatedCount = 0;
  let dealsErrorCount = 0;

  let paymentsUpdatedCount = 0;
  let paymentsErrorCount = 0;

  let dopsUpdatedCount = 0;
  let dopsErrorCount = 0;

  for (const dealId of dealIds) {
    try {
      // Проверяем существование сделки
      const deal = await prisma.deal.findUnique({
        where: { id: dealId },
        select: {
          id: true,
          title: true,
          groupId: true,
          status: true,
          deletedAt: true,
        },
      });

      if (!deal) {
        console.warn(`⚠️  Сделка ID ${dealId}: не найдена в базе данных`);
        dealsNotFoundCount++;
        continue;
      }

      // Проверяем, не удалена ли сделка
      if (deal.deletedAt) {
        console.warn(
          `⚠️  Сделка ID ${dealId} (${deal.title}): удалена (deletedAt: ${deal.deletedAt}), пропускаем`,
        );
        dealsNotFoundCount++;
        continue;
      }

      // Обновляем сделку (если нужно)
      if (deal.groupId !== targetGroupId) {
        await prisma.deal.update({
          where: { id: dealId },
          data: {
            groupId: targetGroupId,
          },
        });

        console.log(
          `✓  Сделка ID ${dealId} (${deal.title}): обновлена (groupId: ${deal.groupId} → ${targetGroupId})`,
        );
        dealsUpdatedCount++;
      } else {
        console.log(
          `✓  Сделка ID ${dealId} (${deal.title}): уже имеет groupId=${targetGroupId}`,
        );
        dealsAlreadyUpdatedCount++;
      }

      // Обновляем payments для этой сделки
      try {
        const paymentsResult = await prisma.payment.updateMany({
          where: {
            dealId: dealId,
            OR: [{ groupId: { not: targetGroupId } }, { groupId: null }],
          },
          data: {
            groupId: targetGroupId,
          },
        });

        if (paymentsResult.count > 0) {
          console.log(
            `  → Обновлено payments: ${paymentsResult.count} шт. для сделки ID ${dealId}`,
          );
          paymentsUpdatedCount += paymentsResult.count;
        }
      } catch (error) {
        console.error(
          `✗  Ошибка при обновлении payments для сделки ID ${dealId}:`,
          error,
        );
        paymentsErrorCount++;
      }

      // Обновляем dops для этой сделки
      try {
        const dopsResult = await prisma.dop.updateMany({
          where: {
            dealId: dealId,
            OR: [{ groupId: { not: targetGroupId } }, { groupId: null }],
          },
          data: {
            groupId: targetGroupId,
          },
        });

        if (dopsResult.count > 0) {
          console.log(
            `  → Обновлено dops: ${dopsResult.count} шт. для сделки ID ${dealId}`,
          );
          dopsUpdatedCount += dopsResult.count;
        }
      } catch (error) {
        console.error(
          `✗  Ошибка при обновлении dops для сделки ID ${dealId}:`,
          error,
        );
        dopsErrorCount++;
      }
    } catch (error) {
      console.error(`✗  Ошибка при обновлении сделки ID ${dealId}:`, error);
      dealsErrorCount++;
    }
  }

  console.log('\n=== Результаты обновления ===');
  console.log('\nСделки:');
  console.log(`  Обновлено: ${dealsUpdatedCount}`);
  console.log(`  Уже имели нужный groupId: ${dealsAlreadyUpdatedCount}`);
  console.log(`  Не найдено/удалено: ${dealsNotFoundCount}`);
  console.log(`  Ошибок: ${dealsErrorCount}`);
  console.log(`  Всего обработано: ${dealIds.length}`);

  console.log('\nPayments:');
  console.log(`  Обновлено: ${paymentsUpdatedCount}`);
  console.log(`  Ошибок: ${paymentsErrorCount}`);

  console.log('\nDops:');
  console.log(`  Обновлено: ${dopsUpdatedCount}`);
  console.log(`  Ошибок: ${dopsErrorCount}`);
}

async function main() {
  try {
    await prisma.user.update({
      where: { id: 315 },
      data: {
        roleId: 6,
      },
    });

    // Затем выполняем обновление указанных сделок
    await updateDealsGroupId();
    console.log('\n✓ Скрипт успешно выполнен');
  } catch (error) {
    console.error('✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
