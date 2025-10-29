import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { TelegramService } from '../services/telegram.service';
import { PrismaService } from '../prisma/prisma.service';

const prisma = new PrismaClient();
const prismaService = new PrismaService();

// Используем any для обхода проблемы с типами до генерации Prisma
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extendedPrisma = prisma as any;

// Инициализируем Telegram сервис
const telegramService = new TelegramService(prismaService);
const env = process.env.NODE_ENV as 'development' | 'production';

// Функция для отправки уведомлений админам
async function notifyAdmins(text: string) {
  // Отправляем только в production чтобы избежать спама в dev
  if (env !== 'production') return;
  const adminIds = ['317401874'];
  for (const id of adminIds) {
    try {
      await telegramService.sendToChat(id, text);
    } catch (e: unknown) {
      console.error(
        `Failed to notify ${id}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}

interface OperationFromApi {
  operationId: string;
  operationDate: string;
  typeOfOperation: string;
  category: string;
  description: string;
  payPurpose: string;
  accountAmount: number;
  counterParty: {
    account: string;
    inn: string;
    kpp: string;
    bankBic: string;
    bankName: string;
    name: string;
  };
  expenseCategoryId: number | null;
  expenseCategoryName: string | null;
}

const tToken = process.env.TB_TOKEN;

// Функция для определения категории на основе условий
function determineExpenseCategory(
  typeOfOperation: string,
  category: string,
  payPurpose: string,
  counterPartyTitle: string,
): { incomeCategoryId: number | null; outcomeCategoryId: number | null } {
  let incomeCategoryId: number | null = null;
  let outcomeCategoryId: number | null = null;

  // Логика для операций Credit (входящие)
  if (typeOfOperation === 'Credit') {
    // 1. Проверка на "Пополнение по операции СБП Терминал"
    // Ищем каждое слово из фразы в payPurpose
    const sbpWords = ['пополнение', 'операции', 'сбп', 'терминал'];
    if (
      payPurpose &&
      sbpWords.every((word) => payPurpose.toLowerCase().includes(word))
    ) {
      incomeCategoryId = 2;
    }
    // 2. Проверка на "Перевод средств по договору 7035739486"
    // Ищем ключевые слова из фразы
    else if (
      payPurpose &&
      ['перевод', 'средств', 'договору', '7035739486'].every((word) =>
        payPurpose.toLowerCase().includes(word),
      )
    ) {
      incomeCategoryId = 4;
    }
    // 3. Проверка на начало counterPartyTitle с "ООО", "ИП", "ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ" или "Индивидуальный предприниматель" (независимо от регистра)
    else if (
      counterPartyTitle &&
      (counterPartyTitle.toLowerCase().startsWith('ооо') ||
        counterPartyTitle.toLowerCase().startsWith('ип') ||
        counterPartyTitle
          .toLowerCase()
          .startsWith('общество с ограниченной ответственностью') ||
        counterPartyTitle
          .toLowerCase()
          .startsWith('индивидуальный предприниматель'))
    ) {
      // Список исключений - контрагенты, которые НЕ должны получать категорию 1
      const exceptions = [
        'индивидуальный предприниматель мазунин максим евгеньевич',
        'общество с ограниченной ответственностью "экспресс курьер"',
        'общество с ограниченной ответственностью "рвб"',
      ];

      // Проверяем, не является ли контрагент исключением
      const isException = exceptions.some((exception) =>
        counterPartyTitle.toLowerCase().includes(exception.toLowerCase()),
      );

      if (!isException) {
        incomeCategoryId = 1;
      }
    }
  }

  // Логика для операций Debit (исходящие)
  if (typeOfOperation === 'Debit' && category === 'fee') {
    outcomeCategoryId = 48;
  }

  return { incomeCategoryId, outcomeCategoryId };
}

async function getOrCreateCounterParty(
  counterPartyData: {
    account: string;
    inn: string;
    kpp: string;
    name: string;
    bankName: string;
    bankBic: string;
  },
  incomeExpenseCategoryId?: number | null,
  outcomeExpenseCategoryId?: number | null,
) {
  const existingCounterParty = await prisma.counterParty.findFirst({
    where: { account: counterPartyData.account },
    include: {
      incomeExpenseCategory: true,
      outcomeExpenseCategory: true,
    },
  });

  if (existingCounterParty) {
    // Если у контрагента нет категории и мы определили категорию, присваиваем её
    const updateData: {
      incomeExpenseCategoryId?: number;
      outcomeExpenseCategoryId?: number;
    } = {};
    let categoryAssigned = false;

    if (
      !existingCounterParty.incomeExpenseCategory &&
      incomeExpenseCategoryId
    ) {
      updateData.incomeExpenseCategoryId = incomeExpenseCategoryId;
      categoryAssigned = true;
    }

    if (
      !existingCounterParty.outcomeExpenseCategory &&
      outcomeExpenseCategoryId
    ) {
      updateData.outcomeExpenseCategoryId = outcomeExpenseCategoryId;
      categoryAssigned = true;
    }

    if (categoryAssigned) {
      const updatedCounterParty = await prisma.counterParty.update({
        where: { id: existingCounterParty.id },
        data: updateData,
        include: {
          incomeExpenseCategory: true,
          outcomeExpenseCategory: true,
        },
      });

      const categoryInfo: string[] = [];
      if (updateData.incomeExpenseCategoryId) {
        categoryInfo.push(
          `входящая категория ${updateData.incomeExpenseCategoryId}`,
        );
      }
      if (updateData.outcomeExpenseCategoryId) {
        categoryInfo.push(
          `исходящая категория ${updateData.outcomeExpenseCategoryId}`,
        );
      }

      console.log(
        `Контрагенту "${existingCounterParty.title}" присвоена ${categoryInfo.join(' и ')}`,
      );
      await notifyAdmins(
        `✅ Контрагенту "${existingCounterParty.title}" присвоена ${categoryInfo.join(' и ')}`,
      );

      return updatedCounterParty;
    }
    return existingCounterParty;
  }

  const counterParty = await prisma.counterParty.create({
    data: {
      title: counterPartyData.name || 'Неизвестный контрагент',
      type: 'Получатель',
      inn: counterPartyData.inn || '',
      kpp: counterPartyData.kpp || '',
      account: counterPartyData.account || '',
      bankBic: counterPartyData.bankBic || '',
      bankName: counterPartyData.bankName || '',
      contrAgentGroup: 'Контрагенты без группы',
      incomeExpenseCategoryId: incomeExpenseCategoryId || null,
      outcomeExpenseCategoryId: outcomeExpenseCategoryId || null,
    },
    include: {
      incomeExpenseCategory: true,
      outcomeExpenseCategory: true,
    },
  });

  if (incomeExpenseCategoryId || outcomeExpenseCategoryId) {
    const categoryInfo: string[] = [];
    if (incomeExpenseCategoryId) {
      categoryInfo.push(`входящая категория ${incomeExpenseCategoryId}`);
    }
    if (outcomeExpenseCategoryId) {
      categoryInfo.push(`исходящая категория ${outcomeExpenseCategoryId}`);
    }

    console.log(
      `Новому контрагенту "${counterParty.title}" присвоена ${categoryInfo.join(' и ')}`,
    );
    await notifyAdmins(
      `✅ Новому контрагенту "${counterParty.title}" присвоена ${categoryInfo.join(' и ')}`,
    );
  }

  return counterParty;
}

async function fetchOperationsFromTbank(
  accountNumber: string,
  from: string,
  to: string,
  limit: number = 1000,
  categories?: string[],
  inns?: string[],
) {
  const allOperations: OperationFromApi[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;

  try {
    while (hasMore) {
      const params: Record<string, string | number | boolean | string[]> = {
        accountNumber,
        operationStatus: 'Transaction',
        from: new Date(from).toISOString(),
        to: new Date(to + 'T23:59:59.999Z').toISOString(),
        withBalances: cursor ? false : true, // Балансы только в первом запросе
        limit: Math.min(limit, 5000), // Максимум 5000 за запрос
      };

      // Добавляем дополнительные фильтры если указаны
      if (categories && categories.length > 0) {
        params.categories = categories;
      }
      if (inns && inns.length > 0) {
        params.inns = inns;
      }

      if (cursor) {
        params.cursor = cursor;
      }

      const response = await axios.get(
        'https://business.tbank.ru/openapi/api/v1/statement',
        {
          proxy: false,
          headers: {
            Authorization: 'Bearer ' + tToken,
            'Content-Type': 'application/json',
          },
          params,
          maxBodyLength: Infinity,
        },
      );

      const operations = response.data.operations || [];
      allOperations.push(...operations);

      // Проверяем, есть ли еще данные
      cursor = response.data.nextCursor;
      hasMore = !!cursor && operations.length > 0;

      // Ограничение RPS - максимум 20 запросов в секунду
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms = 10 RPS для безопасности
      }

      console.log(
        `Получено ${operations.length} операций, всего: ${allOperations.length}`,
      );
    }

    return allOperations;
  } catch (error) {
    console.error(
      `Ошибка при получении операций для счета ${accountNumber}:`,
      error,
    );
    throw error;
  }
}

async function saveOriginalOperations(
  operations: OperationFromApi[],
  accountId: number,
) {
  let savedCount = 0;
  let lastOperationDate = '';

  for (const op of operations) {
    try {
      // Определяем категорию на основе условий перед созданием контрагента
      const { incomeCategoryId, outcomeCategoryId } = determineExpenseCategory(
        op.typeOfOperation,
        op.category,
        op.payPurpose,
        op.counterParty.name,
      );

      // Создаем или находим контрагента с определенной категорией
      const counterParty = await getOrCreateCounterParty(
        {
          account: op.counterParty.account || '',
          inn: op.counterParty.inn || '',
          kpp: op.counterParty.kpp || '',
          name: op.counterParty.name || '',
          bankName: op.counterParty.bankName || '',
          bankBic: op.counterParty.bankBic || '',
        },
        incomeCategoryId,
        outcomeCategoryId,
      );

      // Всегда делаем upsert для операции
      const originalOperation = await prisma.originalOperationFromTbank.upsert({
        where: { operationId: op.operationId },
        update: {
          operationDate: op.operationDate,
          typeOfOperation: op.typeOfOperation || 'Unknown',
          category: op.category || '',
          description: op.description || '',
          payPurpose: op.payPurpose || '',
          accountAmount: op.accountAmount,
          counterPartyAccount: op.counterParty.account || '',
          counterPartyInn: op.counterParty.inn || '',
          counterPartyKpp: op.counterParty.kpp || '',
          counterPartyBic: op.counterParty.bankBic || '',
          counterPartyBankName: op.counterParty.bankName || '',
          counterPartyTitle: op.counterParty.name || '',
          expenseCategoryId: op.expenseCategoryId,
          expenseCategoryName: op.expenseCategoryName,
          accountId: accountId,
        },
        create: {
          operationId: op.operationId,
          operationDate: op.operationDate,
          typeOfOperation: op.typeOfOperation || 'Unknown',
          category: op.category || '',
          description: op.description || '',
          payPurpose: op.payPurpose || '',
          accountAmount: op.accountAmount,
          counterPartyAccount: op.counterParty.account || '',
          counterPartyInn: op.counterParty.inn || '',
          counterPartyKpp: op.counterParty.kpp || '',
          counterPartyBic: op.counterParty.bankBic || '',
          counterPartyBankName: op.counterParty.bankName || '',
          counterPartyTitle: op.counterParty.name || '',
          expenseCategoryId: op.expenseCategoryId,
          expenseCategoryName: op.expenseCategoryName,
          accountId: accountId,
        },
      });

      // Проверяем, есть ли уже позиции у операции
      const existingPositions = await prisma.operationPosition.findMany({
        where: {
          originalOperationId: originalOperation.id,
        },
      });

      // Обязательная проверка для selfTransferOuter операций с конкретным счетом
      // Выполняется независимо от наличия позиций
      if (
        op.category === 'selfTransferOuter' &&
        op.counterParty.account === '40802810600008448575'
      ) {
        const mustHaveCategoryId = 137;

        if (existingPositions.length > 0) {
          // Обновляем все существующие позиции
          await prisma.operationPosition.updateMany({
            where: {
              originalOperationId: originalOperation.id,
            },
            data: {
              expenseCategoryId: mustHaveCategoryId,
            },
          });
          console.log(
            `Операция ${op.operationId}: обновлена категория 137 для ${existingPositions.length} существующих позиций (selfTransferOuter с счетом 40802810600008448575)`,
          );
          await notifyAdmins(
            `✅ Операция ${op.operationId}: обновлена категория 137 для ${existingPositions.length} существующих позиций (selfTransferOuter с счетом 40802810600008448575)`,
          );
        } else {
          // Создаем новую позицию с обязательной категорией
          await prisma.operationPosition.create({
            data: {
              amount: op.accountAmount,
              originalOperationId: originalOperation.id,
              counterPartyId: counterParty.id,
              expenseCategoryId: mustHaveCategoryId,
            },
          });
          console.log(
            `Операция ${op.operationId}: присвоена категория 137 для selfTransferOuter операции с счетом 40802810600008448575`,
          );
          await notifyAdmins(
            `✅ Операция ${op.operationId}: присвоена категория 137 для selfTransferOuter операции с счетом 40802810600008448575`,
          );
        }
        savedCount++;
        continue;
      }

      // Если позиции уже есть, пропускаем создание новых
      if (existingPositions.length > 0) {
        console.log(
          `Операция ${op.operationId} уже имеет позиции, пропускаем создание позиций`,
        );
        savedCount++;
        continue;
      }

      // Определяем категорию на основе типа операции и контрагента
      let expenseCategoryId: number | null = null;

      if (
        op.typeOfOperation === 'Credit' &&
        counterParty.incomeExpenseCategory
      ) {
        // Входящая операция - используем входящую категорию контрагента
        expenseCategoryId = counterParty.incomeExpenseCategory.id;
        console.log(
          `Операция ${op.operationId}: присвоена входящая категория "${counterParty.incomeExpenseCategory.name}" для контрагента "${counterParty.title}"`,
        );
        await notifyAdmins(
          `✅ Операция ${op.operationId}: присвоена входящая категория "${counterParty.incomeExpenseCategory.name}" для контрагента "${counterParty.title}"`,
        );
      } else if (
        op.typeOfOperation === 'Debit' &&
        counterParty.outcomeExpenseCategory
      ) {
        // Исходящая операция - используем исходящую категорию контрагента
        expenseCategoryId = counterParty.outcomeExpenseCategory.id;
        console.log(
          `Операция ${op.operationId}: присвоена исходящая категория "${counterParty.outcomeExpenseCategory.name}" для контрагента "${counterParty.title}"`,
        );
        await notifyAdmins(
          `✅ Операция ${op.operationId}: присвоена исходящая категория "${counterParty.outcomeExpenseCategory.name}" для контрагента "${counterParty.title}"`,
        );
      } else if (!expenseCategoryId) {
        console.log(
          `Операция ${op.operationId}: у контрагента "${counterParty.title}" нет соответствующей категории для типа операции "${op.typeOfOperation}"`,
        );
      }

      // Создаем позицию (только если её еще нет)
      await prisma.operationPosition.create({
        data: {
          amount: op.accountAmount,
          originalOperationId: originalOperation.id,
          counterPartyId: counterParty.id,
          expenseCategoryId: expenseCategoryId,
        },
      });

      savedCount++;
      // Обновляем дату последней операции (сортируем по дате)
      if (op.operationDate > lastOperationDate) {
        lastOperationDate = op.operationDate;
      }
    } catch (error) {
      console.error(`Ошибка при сохранении операции ${op.operationId}:`, error);
    }
  }

  // Обновляем статус синхронизации
  await updateSyncStatus(accountId, lastOperationDate, savedCount, 'success');

  return { savedCount, lastOperationDate };
}

async function updateSyncStatus(
  accountId: number,
  lastOperationDate: string,
  totalOperations: number,
  status: 'success' | 'error' | 'in_progress',
  errorMessage?: string,
) {
  try {
    await extendedPrisma.tbankSyncStatus.upsert({
      where: { accountId },
      update: {
        lastSyncDate: new Date(),
        lastOperationDate: lastOperationDate.slice(0, 10), // YYYY-MM-DD
        totalOperations: {
          increment: totalOperations,
        },
        syncStatus: status,
        errorMessage: errorMessage || null,
      },
      create: {
        accountId,
        lastSyncDate: new Date(),
        lastOperationDate: lastOperationDate.slice(0, 10), // YYYY-MM-DD
        totalOperations,
        syncStatus: status,
        errorMessage: errorMessage || null,
      },
    });
  } catch (error) {
    console.error(
      `Ошибка при обновлении статуса синхронизации для аккаунта ${accountId}:`,
      error,
    );
  }
}

async function upsertPlanFactAccount() {
  try {
    const account = await prisma.planFactAccount.upsert({
      where: { accountNumber: '40802810600008448575' },
      update: {
        name: 'Копилка',
        accountNumber: '40802810600008448575',
      },
      create: {
        name: 'Копилка',
        accountNumber: '40802810600008448575',
        balance: 0,
        type: '',
        balanceStartDate: '',
        comment: '',
        isReal: true,
      },
    });

    console.log(
      `PlanFactAccount успешно создан/обновлен: ${account.name} (${account.accountNumber})`,
    );
    await notifyAdmins(
      `✅ PlanFactAccount успешно создан/обновлен: ${account.name} (${account.accountNumber})`,
    );

    return account;
  } catch (error) {
    console.error('Ошибка при создании/обновлении PlanFactAccount:', error);
    await notifyAdmins(
      `❌ Ошибка при создании/обновлении PlanFactAccount: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    );
    throw error;
  }
}

async function getSyncStatus() {
  try {
    const statuses = (await extendedPrisma.tbankSyncStatus.findMany({
      include: {
        account: true,
      },
      orderBy: {
        lastSyncDate: 'desc',
      },
    })) as Array<{
      account: { name: string; accountNumber: string };
      lastSyncDate: Date;
      lastOperationDate: string;
      totalOperations: number;
      syncStatus: string;
      errorMessage?: string;
    }>;

    console.log('\n=== Статус синхронизации ===');
    statuses.forEach((status) => {
      console.log(
        `Аккаунт: ${status.account.name} (${status.account.accountNumber})`,
      );
      console.log(
        `  Последняя синхронизация: ${status.lastSyncDate.toISOString()}`,
      );
      console.log(`  Последняя операция: ${status.lastOperationDate}`);
      console.log(`  Всего операций: ${status.totalOperations}`);
      console.log(`  Статус: ${status.syncStatus}`);
      if (status.errorMessage) {
        console.log(`  Ошибка: ${status.errorMessage}`);
      }
      console.log('');
    });
  } catch (error) {
    console.error('Ошибка при получении статуса синхронизации:', error);
  }
}

async function main() {
  // Проверяем, если первый аргумент --status
  if (process.argv[2] === '--status') {
    await getSyncStatus();
    await prisma.$disconnect();
    return;
  }

  // Создаем/обновляем PlanFactAccount "Копилка"
  await upsertPlanFactAccount();

  // СЕКЦИЯ ОЧИСТКИ ДАННЫХ - ЗАКОММЕНТИРОВАТЬ ДЛЯ ОТКЛЮЧЕНИЯ
  // Раскомментируйте этот блок, если нужно очистить все данные перед синхронизацией

  // console.log('Очистка всех данных...');
  // await prisma.operationPosition.deleteMany({
  //   where: {
  //     originalOperationId: {
  //       not: null,
  //     },
  //   },
  // });
  // await prisma.originalOperationFromTbank.deleteMany({});
  // await prisma.tbankSyncStatus.deleteMany({});
  // await prisma.counterParty.deleteMany({});
  // console.log('Все данные очищены');
  // await prisma.$disconnect();

  // ---------------

  // Параметры по умолчанию - сегодняшний день
  const today = new Date();
  const from = process.argv[2] || today.toISOString().split('T')[0]; // YYYY-MM-DD
  const to = process.argv[3] || today.toISOString().split('T')[0]; // YYYY-MM-DD
  const limit = parseInt(process.argv[4]) || 1000;
  const categories = process.argv[5] ? process.argv[5].split(',') : undefined; // Категории операций
  const inns = process.argv[6] ? process.argv[6].split(',') : undefined; // ИНН контрагентов

  console.log(`Получение операций с ${from} по ${to}, лимит: ${limit}`);
  await notifyAdmins(
    `🔄 Старт синхронизации операций Т-Банка с ${from} по ${to}`,
  );

  if (!tToken) {
    throw new Error('TB_TOKEN не установлен в переменных окружения');
  }

  try {
    // Получаем все аккаунты с доступом к API
    const accounts = await prisma.planFactAccount.findMany({
      where: {
        isReal: true,
      },
    });

    console.log(`Найдено ${accounts.length} аккаунтов с API доступом`);
    await notifyAdmins(
      `📊 Найдено ${accounts.length} аккаунтов для синхронизации`,
    );

    for (const account of accounts) {
      console.log(
        `Обрабатываем аккаунт: ${account.name} (${account.accountNumber})`,
      );
      await notifyAdmins(
        `🏦 Обрабатываем аккаунт: ${account.name} (${account.accountNumber})`,
      );

      try {
        // Устанавливаем статус "в процессе"
        await updateSyncStatus(account.id, '', 0, 'in_progress');

        const operations = await fetchOperationsFromTbank(
          account.accountNumber,
          from,
          to,
          limit,
          categories,
          inns,
        );

        console.log(
          `Получено ${operations.length} операций для аккаунта ${account.name}`,
        );
        await notifyAdmins(
          `📥 Получено ${operations.length} операций для аккаунта ${account.name}`,
        );

        if (operations.length > 0) {
          const result = await saveOriginalOperations(operations, account.id);
          console.log(
            `Сохранено ${result.savedCount} операций для аккаунта ${account.name}. Последняя операция: ${result.lastOperationDate}`,
          );
          await notifyAdmins(
            `💾 Сохранено ${result.savedCount} операций для аккаунта ${account.name}. Последняя операция: ${result.lastOperationDate}`,
          );
        } else {
          // Обновляем статус даже если операций нет
          await updateSyncStatus(account.id, '', 0, 'success');
          console.log(`Операций не найдено для аккаунта ${account.name}`);
          await notifyAdmins(
            `ℹ️ Операций не найдено для аккаунта ${account.name}`,
          );
        }
      } catch (error) {
        console.error(`Ошибка при обработке аккаунта ${account.name}:`, error);
        await notifyAdmins(
          `❌ Ошибка при обработке аккаунта ${account.name}: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        );
        // Устанавливаем статус ошибки
        await updateSyncStatus(
          account.id,
          '',
          0,
          'error',
          error instanceof Error ? error.message : 'Неизвестная ошибка',
        );
      }
    }

    console.log('Скрипт завершен успешно');
    await notifyAdmins('🏁 Синхронизация операций Т-Банка завершена успешно');
  } catch (error) {
    console.error('Ошибка выполнения скрипта:', error);
    await notifyAdmins(
      `🔥 Критическая ошибка синхронизации: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск скрипта
main().catch((error) => {
  console.error('Критическая ошибка:', error);
  process.exit(1);
});
