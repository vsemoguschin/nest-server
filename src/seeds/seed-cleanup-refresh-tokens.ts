import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupRefreshTokens() {
  console.log('Начинаем очистку refresh токенов...\n');

  // Получаем статистику до очистки
  const statsBefore = {
    total: await prisma.refreshToken.count(),
    expired: await prisma.refreshToken.count({
      where: { expiresAt: { lt: new Date() } },
    }),
    revoked: await prisma.refreshToken.count({
      where: { revoked: true },
    }),
    active: await prisma.refreshToken.count({
      where: { revoked: false, expiresAt: { gt: new Date() } },
    }),
  };

  console.log('=== Статистика ДО очистки ===');
  console.log(`Всего токенов: ${statsBefore.total}`);
  console.log(`Истекших: ${statsBefore.expired}`);
  console.log(`Отозванных: ${statsBefore.revoked}`);
  console.log(`Активных: ${statsBefore.active}\n`);

  // Удаляем истекшие токены
  console.log('Удаление истекших токенов...');
  const deletedExpired = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  console.log(`✓ Удалено истекших токенов: ${deletedExpired.count}\n`);

  // Удаляем отозванные токены
  console.log('Удаление отозванных токенов...');
  const deletedRevoked = await prisma.refreshToken.deleteMany({
    where: { revoked: true },
  });
  console.log(`✓ Удалено отозванных токенов: ${deletedRevoked.count}\n`);

  // Ограничиваем количество активных токенов на пользователя (максимум 5)
  console.log('Ограничение количества активных токенов на пользователя...');
  const usersWithTokens = await prisma.user.findMany({
    where: {
      refreshTokens: {
        some: {
          revoked: false,
          expiresAt: { gt: new Date() },
        },
      },
    },
    include: {
      refreshTokens: {
        where: {
          revoked: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  let tokensDeletedByLimit = 0;
  for (const user of usersWithTokens) {
    if (user.refreshTokens.length > 5) {
      const tokensToDelete = user.refreshTokens.slice(5);
      const deleted = await prisma.refreshToken.deleteMany({
        where: {
          id: { in: tokensToDelete.map((t) => t.id) },
        },
      });
      tokensDeletedByLimit += deleted.count;
      console.log(
        `  Пользователь ID ${user.id}: удалено ${deleted.count} старых токенов (осталось ${user.refreshTokens.length - deleted.count})`,
      );
    }
  }
  console.log(
    `✓ Всего удалено токенов из-за ограничения: ${tokensDeletedByLimit}\n`,
  );

  // Получаем статистику после очистки
  const statsAfter = {
    total: await prisma.refreshToken.count(),
    expired: await prisma.refreshToken.count({
      where: { expiresAt: { lt: new Date() } },
    }),
    revoked: await prisma.refreshToken.count({
      where: { revoked: true },
    }),
    active: await prisma.refreshToken.count({
      where: { revoked: false, expiresAt: { gt: new Date() } },
    }),
  };

  console.log('=== Статистика ПОСЛЕ очистки ===');
  console.log(`Всего токенов: ${statsAfter.total}`);
  console.log(`Истекших: ${statsAfter.expired}`);
  console.log(`Отозванных: ${statsAfter.revoked}`);
  console.log(`Активных: ${statsAfter.active}\n`);

  const totalDeleted =
    deletedExpired.count + deletedRevoked.count + tokensDeletedByLimit;
  console.log('=== Итоги очистки ===');
  console.log(`Всего удалено токенов: ${totalDeleted}`);
  console.log(`  - Истекших: ${deletedExpired.count}`);
  console.log(`  - Отозванных: ${deletedRevoked.count}`);
  console.log(`  - Из-за ограничения: ${tokensDeletedByLimit}`);
  console.log(
    `Сокращение: ${statsBefore.total} → ${statsAfter.total} (${((totalDeleted / statsBefore.total) * 100).toFixed(2)}%)`,
  );
}

async function main() {
  try {
    await cleanupRefreshTokens();
    console.log('\n✓ Скрипт успешно выполнен');
  } catch (error) {
    console.error('✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

