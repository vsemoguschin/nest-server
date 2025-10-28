import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Параметры фильтрации по датам
  const from = process.argv[2] || null; // YYYY-MM-DD
  const to = process.argv[3] || null; // YYYY-MM-DD

  console.log('🔍 Поиск операций и поставок...\n');

  if (from && to) {
    console.log(`📅 Фильтр по датам: с ${from} по ${to}\n`);
  } else if (from) {
    console.log(`📅 Фильтр по датам: с ${from}\n`);
  } else if (to) {
    console.log(`📅 Фильтр по датам: до ${to}\n`);
  } else {
    console.log('📅 Без фильтра по датам (все данные)\n');
  }

  try {
    // Формируем фильтр по датам для операций
    const operationDateFilter: Record<string, string> = {};
    if (from) {
      operationDateFilter.gte = from;
    }
    if (to) {
      operationDateFilter.lte = to;
    }

    // Получаем все операции с связанными данными
    const operations = await prisma.originalOperationFromTbank.findMany({
      where:
        Object.keys(operationDateFilter).length > 0
          ? {
              operationDate: operationDateFilter,
            }
          : {},
      include: {
        account: {
          select: {
            id: true,
            name: true,
            accountNumber: true,
          },
        },
        operationPositions: {
          include: {
            counterParty: {
              select: {
                id: true,
                title: true,
              },
            },
            expenseCategory: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        // supplie: {
        //   select: {
        //     id: true,
        //     supplier: true,
        //     date: true,
        //     paymentStatus: true,
        //   },
        // },
      },
      orderBy: {
        operationDate: 'desc',
      },
    });

    // Формируем фильтр по датам для поставок
    const supplieDateFilter: Record<string, string> = {};
    if (from) {
      supplieDateFilter.gte = from;
    }
    if (to) {
      supplieDateFilter.lte = to;
    }

    // Получаем все поставки
    const supplies = await prisma.supplie.findMany({
      where:
        Object.keys(supplieDateFilter).length > 0
          ? {
              date: supplieDateFilter,
            }
          : {},
      include: {
        positions: true,
      },
      orderBy: {
        date: 'desc',
      },
    });

    console.log(`📊 Найдено операций: ${operations.length}`);
    console.log(`📦 Найдено поставок: ${supplies.length}\n`);

    if (operations.length === 0 && supplies.length === 0) {
      console.log('❌ Операции и поставки не найдены');
      return;
    }

    // Группируем по аккаунтам
    const operationsByAccount = operations.reduce(
      (acc, op) => {
        const accountName = op.account.name;
        if (!acc[accountName]) {
          acc[accountName] = [];
        }
        acc[accountName].push(op);
        return acc;
      },
      {} as Record<string, typeof operations>,
    );

    // Выводим статистику по аккаунтам
    console.log('📈 Статистика по аккаунтам:');
    Object.entries(operationsByAccount).forEach(([accountName, ops]) => {
      const totalAmount = ops.reduce((sum, op) => sum + op.accountAmount, 0);
      const creditOps = ops.filter(
        (op) => op.typeOfOperation === 'Credit',
      ).length;
      const debitOps = ops.filter(
        (op) => op.typeOfOperation === 'Debit',
      ).length;
      // const withSupplies = ops.filter((op) => op.supplie).length;

      console.log(`  ${accountName}:`);
      console.log(`    Всего операций: ${ops.length}`);
      console.log(`    Приходные: ${creditOps}, Расходные: ${debitOps}`);
      // console.log(`    Связанные с поставками: ${withSupplies}`);
      console.log(`    Общая сумма: ${totalAmount.toFixed(2)} руб.`);
      console.log('');
    });

    // Статистика по поставкам
    if (supplies.length > 0) {
      console.log('📦 Статистика по поставкам:');

      const totalPositions = supplies.reduce(
        (sum, supply) => sum + supply.positions.length,
        0,
      );
      const totalAmount = supplies.reduce(
        (sum, supply) =>
          sum +
          supply.positions.reduce(
            (posSum, pos) => posSum + pos.priceForItem * pos.quantity,
            0,
          ),
        0,
      );

      const suppliersStats = supplies.reduce(
        (acc, supply) => {
          acc[supply.supplier] = (acc[supply.supplier] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const paymentStatusStats = supplies.reduce(
        (acc, supply) => {
          acc[supply.paymentStatus] = (acc[supply.paymentStatus] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      console.log(`  Всего поставок: ${supplies.length}`);
      console.log(`  Всего позиций: ${totalPositions}`);
      console.log(`  Общая сумма: ${totalAmount.toFixed(2)} руб.`);
      console.log('');

      console.log('  Топ-5 поставщиков:');
      Object.entries(suppliersStats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .forEach(([supplier, count]) => {
          console.log(`    ${supplier}: ${count} поставок`);
        });
      console.log('');

      console.log('  Статус оплаты:');
      Object.entries(paymentStatusStats).forEach(([status, count]) => {
        console.log(`    ${status}: ${count} поставок`);
      });
      console.log('');
    }

    // Показываем последние 10 операций
    console.log('🕒 Последние 10 операций:');
    console.log('='.repeat(120));

    operations.slice(0, 10).forEach((op, index) => {
      console.log(
        `${index + 1}. ${op.operationDate} | ${op.typeOfOperation} | ${op.accountAmount.toFixed(2)} руб.`,
      );
      console.log(`   Описание: ${op.description}`);
      console.log(`   Контрагент: ${op.counterPartyTitle}`);
      console.log(
        `   Аккаунт: ${op.account.name} (${op.account.accountNumber})`,
      );

      if (op.expenseCategoryName) {
        console.log(`   Категория: ${op.expenseCategoryName}`);
      }

      // if (op.supplie) {
      //   console.log(
      //     `   📦 Связанная поставка: ${op.supplie.supplier} (${op.supplie.date})`,
      //   );
      // }

      if (op.operationPositions.length > 0) {
        console.log(`   Позиций: ${op.operationPositions.length}`);
        op.operationPositions.forEach((pos, posIndex) => {
          console.log(`     ${posIndex + 1}. ${pos.amount.toFixed(2)} руб.`);
          if (pos.counterParty) {
            console.log(`        Контрагент: ${pos.counterParty.title}`);
          }
          if (pos.expenseCategory) {
            console.log(`        Категория: ${pos.expenseCategory.name}`);
          }
        });
      }

      console.log(`   ID операции: ${op.operationId}`);
      console.log('-'.repeat(120));
    });

    // Показываем последние 10 поставок
    if (supplies.length > 0) {
      console.log('\n📦 Последние 10 поставок:');
      console.log('='.repeat(120));

      supplies.slice(0, 10).forEach((supply, index) => {
        const totalAmount = supply.positions.reduce(
          (sum, pos) => sum + pos.priceForItem * pos.quantity,
          0,
        );

        console.log(`${index + 1}. ${supply.date} | ${supply.supplier}`);
        console.log(`   Статус заказа: ${supply.orderStatus}`);
        console.log(`   Статус оплаты: ${supply.paymentStatus}`);
        console.log(`   Способ доставки: ${supply.deliveryMethod}`);
        console.log(`   Способ оплаты: ${supply.paymentMethod}`);
        console.log(`   Позиций: ${supply.positions.length}`);
        console.log(`   Общая сумма: ${totalAmount.toFixed(2)} руб.`);

        if (supply.invoice) {
          console.log(`   Счет: ${supply.invoice}`);
        }
        if (supply.track) {
          console.log(`   Трек: ${supply.track}`);
        }

        if (supply.positions.length > 0) {
          console.log('   Позиции:');
          supply.positions.forEach((pos, posIndex) => {
            const posTotal = pos.priceForItem * pos.quantity;
            console.log(
              `     ${posIndex + 1}. ${pos.name} - ${pos.quantity} шт. × ${pos.priceForItem.toFixed(2)} руб. = ${posTotal.toFixed(2)} руб.`,
            );
            if (pos.category) {
              console.log(`        Категория: ${pos.category}`);
            }
          });
        }

        console.log(`   ID поставки: ${supply.id}`);
        console.log('-'.repeat(120));
      });
    }

    // Статистика по категориям
    const categoryStats = operations.reduce(
      (acc, op) => {
        if (op.expenseCategoryName) {
          acc[op.expenseCategoryName] = (acc[op.expenseCategoryName] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    if (Object.keys(categoryStats).length > 0) {
      console.log('\n📊 Статистика по категориям:');
      Object.entries(categoryStats)
        .sort(([, a], [, b]) => b - a)
        .forEach(([category, count]) => {
          console.log(`  ${category}: ${count} операций`);
        });
    }

    // Статистика по контрагентам
    const counterpartyStats = operations.reduce(
      (acc, op) => {
        acc[op.counterPartyTitle] = (acc[op.counterPartyTitle] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    console.log('\n👥 Топ-10 контрагентов:');
    Object.entries(counterpartyStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([counterparty, count]) => {
        console.log(`  ${counterparty}: ${count} операций`);
      });

    // Операции без категорий
    const operationsWithoutCategories = operations.filter(
      (op) => !op.expenseCategoryName,
    );
    if (operationsWithoutCategories.length > 0) {
      console.log(
        `\n⚠️  Операций без категорий: ${operationsWithoutCategories.length}`,
      );
    }

    // Операции без позиций
    const operationsWithoutPositions = operations.filter(
      (op) => op.operationPositions.length === 0,
    );
    if (operationsWithoutPositions.length > 0) {
      console.log(
        `⚠️  Операций без позиций: ${operationsWithoutPositions.length}`,
      );
    }

    console.log('\n✅ Просмотр операций и поставок завершен');
  } catch (error) {
    console.error('❌ Ошибка при получении операций:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ Критическая ошибка:', e);
  process.exit(1);
});
