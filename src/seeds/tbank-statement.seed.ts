import 'dotenv/config';
import axios, { AxiosError } from 'axios';
import { PrismaClient, CounterParty } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const T_ENDPOINT = 'https://business.tbank.ru/openapi/api/v1/statement';
const TB_TOKEN = process.env.TB_TOKEN;
if (!TB_TOKEN) {
  console.error('✖ Env TB_TOKEN не задан');
  process.exit(1);
}

type OperationFromApi = {
  operationId: string;
  operationDate: string; // ISO
  typeOfOperation?: string;
  category?: string;
  description?: string;
  payPurpose?: string;
  accountAmount: number;
  counterParty: {
    account?: string;
    inn?: string;
    kpp?: string;
    name?: string;
    bankName?: string;
    bankBic?: string;
  };
};

type StatementResponse = {
  operations: OperationFromApi[];
  nextCursor?: string | null;
  openingBalance?: number;
  closingBalance?: number;
};

function startOfCurrentYearUTC() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
  return d.toISOString();
}

function nowUTC() {
  return new Date().toISOString();
}

function mapOperationType(category?: string): string {
  if (!category) return 'Unknown';

  if (category === 'selfTransferInner') return 'Перемещение';

  if (['incomePeople', 'income', 'creditPaymentInner'].includes(category)) {
    return 'Поступление';
  }

  if (
    [
      'salary',
      'fee',
      'selfTransferOuter',
      'cardOperation',
      'contragentPeople',
      'contragentOutcome',
      'creditPaymentOuter',
      'tax',
    ].includes(category)
  ) {
    return 'Выплата';
  }

  return category;
}

function n(s?: string) {
  return (s && s.trim()) || '';
}

/**
 * БОлее надёжный поиск контрагента:
 * 1) Если указан расчётный счёт — ищем по нему.
 * 2) Иначе ищем по (inn, kpp, name, bankBic) — это часто достаточно уникально.
 * Если не нашли — создаём.
 */
async function getOrCreateCounterParty(counterPartyData: {
  account?: string;
  inn?: string;
  kpp?: string;
  name?: string;
  bankName?: string;
  bankBic?: string;
}): Promise<CounterParty> {
  const account = n(counterPartyData.account);
  const inn = n(counterPartyData.inn);
  const kpp = n(counterPartyData.kpp);
  const name = n(counterPartyData.name);
  const bankName = n(counterPartyData.bankName);
  const bankBic = n(counterPartyData.bankBic);

  // 1) Пробуем по расчётному счёту, если он есть
  if (account) {
    const byAccount = await prisma.counterParty.findFirst({
      where: { account },
    });
    if (byAccount) return byAccount;
  }

  // 2) Иначе — по комбинации полей (если есть хотя бы inn+name или name+bankBic)
  if (name || inn || kpp || bankBic) {
    const candidate = await prisma.counterParty.findFirst({
      where: {
        AND: [
          name ? { title: name } : {},
          inn ? { inn } : {},
          kpp ? { kpp } : {},
          bankBic ? { bankBic } : {},
        ],
      },
    });
    if (candidate) return candidate;
  }

  // 3) Создаём нового
  return prisma.counterParty.create({
    data: {
      title: name || 'Неизвестный контрагент',
      type: 'Получатель', // при создании по умолчанию; направление лучше хранить в позиции операции
      inn,
      kpp,
      account,
      bankBic,
      bankName,
      contrAgentGroup: 'Контрагенты без группы',
    },
  });
}

async function fetchPage(params: {
  accountNumber: string;
  from: string; // ISO (inclusive)
  to: string; // ISO (exclusive)
  cursor?: string;
  withBalances?: boolean;
  limit?: number; // 1..5000
}): Promise<StatementResponse> {
  const {
    accountNumber,
    from,
    to,
    cursor,
    withBalances = !cursor, // баланс просим только в первом запросе
    limit = 1000,
  } = params;

  const headers = {
    Authorization: `Bearer ${TB_TOKEN}`,
    'X-Request-Id': randomUUID(),
  };

  const search = new URLSearchParams({
    accountNumber,
    from,
    to,
    limit: String(limit),
  });
  if (cursor) search.set('cursor', cursor);
  if (withBalances) search.set('withBalances', 'true');

  const url = `${T_ENDPOINT}?${search.toString()}`;

  // простая обертка с ретраями на 429/5xx
  const maxRetries = 5;
  let attempt = 0;
  // экспоненциальная пауза (200ms * 2^n) + джиттер + поддержка Retry-After
  while (true) {
    try {
      const { data } = await axios.get<StatementResponse>(url, {
        headers,
        timeout: 30000,
      });
      return data;
    } catch (e) {
      const err = e as AxiosError<any>;
      const status = err.response?.status;
      const retriable =
        status === 429 ||
        (status && status >= 500) ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT';

      if (retriable && attempt < maxRetries) {
        attempt++;
        let backoff =
          200 * Math.pow(2, attempt) + Math.floor(Math.random() * 100);

        // поддержка Retry-After (в секундах)
        const retryAfterHeader = (
          err.response?.headers as Record<string, string> | undefined
        )?.['retry-after'];
        const retryAfterMs =
          retryAfterHeader && !Number.isNaN(Number(retryAfterHeader))
            ? Number(retryAfterHeader) * 1000
            : NaN;
        if (!Number.isNaN(retryAfterMs) && retryAfterMs > backoff) {
          backoff = retryAfterMs;
        }

        console.warn(
          `↻ Retry ${attempt}/${maxRetries} after ${backoff}ms (status ${status ?? err.code})`,
        );
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      console.error(
        '✖ Ошибка запроса выписки:',
        status,
        err.message,
        err.response?.data,
      );
      throw err;
    }
  }
}

async function processAccount(account: { id: number; accountNumber: string }) {
  const accountNumber = account.accountNumber;
  const accountId = account.id;

  const from = '2025-10-01T00:00:00.000Z';
  //   const from = startOfCurrentYearUTC();
  const to = nowUTC();
  // return console.log(typeof from);

  console.log(
    `→ Загружаем операции по ${accountNumber} (PlanFactAccount id=${accountId}) за период ${from} .. ${to}`,
  );

  let cursor: string | undefined = undefined;
  let total = 0;
  let page = 0;

  while (true) {
    page++;
    const data = await fetchPage({
      accountNumber,
      from,
      to,
      cursor,
      withBalances: !cursor,
      limit: 1000,
    });
    const ops = data.operations ?? [];
    console.log(
      `  • Страница ${page}: ${ops.length} операций${data.nextCursor ? ' (+ есть продолжение)' : ''}`,
    );

    // --- Сохранение операций (последовательно, чтобы не бить базу и лимиты)
    for (const op of ops) {
      const counterParty = await getOrCreateCounterParty(op.counterParty ?? {});
      const operationType = mapOperationType(op.category);
      const isIncome = operationType === 'Поступление';

      // upsert Operation
      const operation = await prisma.operation.upsert({
        where: { operationId: op.operationId },
        update: {},
        create: {
          operationId: op.operationId,
          operationDate: op.operationDate.slice(0, 10),
          operationDateTime: new Date(op.operationDate),
          typeOfOperation: op.typeOfOperation || 'Unknown',
          operationType,
          category: op.category || '',
          description: op.description || '',
          payPurpose: op.payPurpose || '',
          accountId: accountId,
        },
        include: {
          operationPositions: { include: { counterParty: true } },
        },
      });

      // Если не было позиций — создаём одну базовую
      if (!operation.operationPositions.length) {
        // Если API всегда отдаёт положительное число, добавьте знак в зависимости от направления:
        const amount = op.accountAmount; // при необходимости: const amount = isIncome ? Math.abs(op.accountAmount) : -Math.abs(op.accountAmount);
        await prisma.operationPosition.create({
          data: {
            operationId: operation.id,
            amount,
            counterPartyId: counterParty.id,
          },
        });
      }

      // Бизнес-правила автоклассификации
      // 1) Продажа через СБП
      if (
        operation.operationType === 'Поступление' &&
        (operation.payPurpose || '').startsWith('Пополнение по операции СБП')
      ) {
        const ids = operation.operationPositions.map((p) => p.id);
        if (ids.length) {
          await prisma.operationPosition.updateMany({
            where: { id: { in: ids } },
            data: { expenseCategoryId: 2 },
          });
        }
      }

      // 2) Продажа "Долями" (counterPartyId === 495)
      if (
        operation.operationType === 'Поступление' &&
        operation.operationPositions.find((p) => p.counterPartyId === 495)
      ) {
        const ids = operation.operationPositions.map((p) => p.id);
        if (ids.length) {
          await prisma.operationPosition.updateMany({
            where: { id: { in: ids } },
            data: { expenseCategoryId: 3 },
          });
        }
      }

      // 3) Наложка от СДЭК (counterPartyId === 526)
      if (
        operation.operationType === 'Поступление' &&
        operation.operationPositions.find((p) => p.counterPartyId === 526)
      ) {
        const ids = operation.operationPositions.map((p) => p.id);
        if (ids.length) {
          await prisma.operationPosition.updateMany({
            where: { id: { in: ids } },
            data: { expenseCategoryId: 10 },
          });
        }
      }

      total++;
    }

    if (!data.nextCursor) {
      console.log(
        `✓ Готово по счёту ${accountNumber}. Загружено/обновлено операций: ${total}`,
      );
      break;
    }
    cursor = data.nextCursor || undefined;
  }
}

async function main() {
  // --- 1) Определяем список счётов
  await prisma.operation.deleteMany();
  const argv = process.argv.slice(2);
  const accountIdArgIndex = argv.findIndex((a) => a === '--accountId');

  if (accountIdArgIndex >= 0 && argv[accountIdArgIndex + 1]) {
    // Режим работы по одному счёту
    const accountId = Number(argv[accountIdArgIndex + 1]);
    const accountRecord = await prisma.planFactAccount.findUnique({
      where: { id: accountId },
      select: { id: true, accountNumber: true },
    });
    if (!accountRecord) {
      throw new Error(`Счёт PlanFactAccount id=${accountId} не найден`);
    }
    await processAccount(accountRecord);
  } else {
    // Режим работы по всем счётам
    const accounts = await prisma.planFactAccount.findMany({
      select: { id: true, accountNumber: true },
      orderBy: { id: 'asc' },
    });

    if (!accounts.length) {
      throw new Error('В базе нет ни одного счёта в PlanFactAccount');
    }

    console.log(
      `Найдено счетов: ${accounts.length}. Последовательно загрузим операции по каждому.`,
    );

    for (const acc of accounts) {
      try {
        await processAccount(acc);
      } catch (e) {
        console.error(
          `✖ Ошибка при обработке счёта id=${acc.id}, ${acc.accountNumber}:`,
          (e as Error).message,
        );
        // продолжаем остальные счета
      }
    }

    console.log('✓ Все счета обработаны.');
  }
}

main()
  .catch((e) => {
    console.error('✖ Загрузка выписок упала:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
