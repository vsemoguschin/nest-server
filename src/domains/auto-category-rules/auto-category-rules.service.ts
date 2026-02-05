import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type CreateRuleInput = {
  enabled?: boolean;
  priority?: number;
  name: string;
  description?: string;
  keywords: string[];
  operationType: 'Debit' | 'Credit' | 'Any';
  accountIds?: number[];
  counterPartyIds?: number[];
  expenseCategoryId: number;
};

type UpdateRuleInput = Partial<CreateRuleInput>;

@Injectable()
export class AutoCategoryRulesService {
  constructor(private readonly prisma: PrismaService) {}

  // === CRUD ===
  async create(data: CreateRuleInput) {
    // Проверяем на дубликат по keywords + operationType + expenseCategoryId
    const existing = await (this.prisma as any).autoCategoryRule.findFirst({
      where: {
        operationType: data.operationType,
        expenseCategoryId: data.expenseCategoryId,
        keywords: { equals: data.keywords },
      },
    });

    if (existing) {
      throw new Error(
        `Правило с такими ключевыми словами, типом операции и категорией уже существует (ID: ${existing.id})`,
      );
    }

    const rule = await (
      this.prisma as unknown as {
        autoCategoryRule: {
          create: (args: { data: any }) => Promise<any>;
        };
      }
    ).autoCategoryRule.create({
      data: {
        enabled: data.enabled ?? true,
        priority: data.priority ?? 100,
        name: data.name,
        description: data.description ?? '',
        keywords: data.keywords,
        operationType: data.operationType,
        accountIds: data.accountIds ?? [],
        counterPartyIds: data.counterPartyIds ?? [],
        expenseCategoryId: data.expenseCategoryId,
      },
    });

    // Применяем к существующим операциям
    await this.applyRuleToExisting(rule.id);
    return rule;
  }

  async findAll() {
    return (this.prisma as any).autoCategoryRule.findMany({
      orderBy: [{ enabled: 'desc' }, { priority: 'asc' }, { id: 'asc' }],
    });
  }

  async findOne(id: number) {
    return (this.prisma as any).autoCategoryRule.findUnique({ where: { id } });
  }

  async update(id: number, data: UpdateRuleInput) {
    // Если меняются ключевые поля, проверяем на дубликат
    if (
      data.keywords !== undefined ||
      data.operationType !== undefined ||
      data.expenseCategoryId !== undefined
    ) {
      const current = await (this.prisma as any).autoCategoryRule.findUnique({
        where: { id },
      });

      const newKeywords =
        data.keywords !== undefined ? data.keywords : current.keywords;
      const newOperationType =
        data.operationType !== undefined
          ? data.operationType
          : current.operationType;
      const newExpenseCategoryId =
        data.expenseCategoryId !== undefined
          ? data.expenseCategoryId
          : current.expenseCategoryId;

      const existing = await (this.prisma as any).autoCategoryRule.findFirst({
        where: {
          id: { not: id }, // исключаем текущее правило
          operationType: newOperationType,
          expenseCategoryId: newExpenseCategoryId,
          keywords: { equals: newKeywords },
        },
      });

      if (existing) {
        throw new Error(
          `Правило с такими ключевыми словами, типом операции и категорией уже существует (ID: ${existing.id})`,
        );
      }
    }

    const rule = await (this.prisma as any).autoCategoryRule.update({
      where: { id },
      data: {
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.keywords !== undefined ? { keywords: data.keywords } : {}),
        ...(data.operationType !== undefined
          ? { operationType: data.operationType }
          : {}),
        ...(data.accountIds !== undefined
          ? { accountIds: data.accountIds }
          : {}),
        ...(data.counterPartyIds !== undefined
          ? { counterPartyIds: data.counterPartyIds }
          : {}),
        ...(data.expenseCategoryId !== undefined
          ? { expenseCategoryId: data.expenseCategoryId }
          : {}),
      },
    });

    // Применяем к существующим операциям после обновления
    await this.applyRuleToExisting(rule.id);
    return rule;
  }

  async remove(id: number) {
    return (this.prisma as any).autoCategoryRule.delete({ where: { id } });
  }

  // === Мэчинг ===
  private matchesPayPurposeInOrder(
    haystackRaw: string,
    keywords: string[],
  ): boolean {
    const haystack = (haystackRaw || '').toLowerCase();
    let fromIndex = 0;
    for (const kwRaw of keywords) {
      const kw = (kwRaw || '').toLowerCase().trim();
      if (!kw) return false;
      const idx = haystack.indexOf(kw, fromIndex);
      if (idx === -1) return false;
      fromIndex = idx + kw.length;
    }
    return true;
  }

  private matchRuleWithOriginal(
    op: {
      id: number;
      typeOfOperation: string;
      payPurpose: string;
      accountId?: number;
      counterPartyId?: number | null;
    },
    rule: {
      operationType: string;
      keywords: string[];
      accountIds?: number[];
      counterPartyIds?: number[];
    },
  ): boolean {
    // Проверка типа операции
    if (
      rule.operationType !== 'Any' &&
      rule.operationType !== op.typeOfOperation
    ) {
      return false;
    }

    // Проверка счетов (если указаны в правиле)
    if (rule.accountIds && rule.accountIds.length > 0) {
      if (!op.accountId || !rule.accountIds.includes(op.accountId)) {
        return false;
      }
    }

    // Проверка контрагентов (если указаны в правиле)
    if (rule.counterPartyIds && rule.counterPartyIds.length > 0) {
      if (
        !op.counterPartyId ||
        !rule.counterPartyIds.includes(op.counterPartyId)
      ) {
        return false;
      }
    }

    // Проверка ключевых слов
    return this.matchesPayPurposeInOrder(op.payPurpose || '', rule.keywords);
  }

  // === Тестирование правила ===
  async testRule(id: number, take = 50, skip = 0) {
    const rule = await (this.prisma as any).autoCategoryRule.findUnique({
      where: { id },
    });
    if (!rule) return { items: [], total: 0 };

    // Берем кандидатов по типу операции для ускорения
    const where: any = {};
    if (rule.operationType !== 'Any') {
      where.typeOfOperation = rule.operationType;
    }
    // Фильтр по счетам, если указаны
    if (rule.accountIds && rule.accountIds.length > 0) {
      where.accountId = { in: rule.accountIds };
    }

    // Предзагрузка контрагентов для маппинга
    const counterParties = await this.prisma.counterParty.findMany({
      select: { id: true, account: true },
    });
    const accountToCounterPartyId = new Map(
      counterParties.map((c) => [c.account || '', c.id]),
    );

    // Загружаем ВСЕ операции по типу (без пагинации на уровне SQL)
    const allRows = await (
      this.prisma as any
    ).originalOperationFromTbank.findMany({
      where,
      orderBy: { operationDate: 'desc' },
      select: {
        id: true,
        typeOfOperation: true,
        payPurpose: true,
        accountAmount: true,
        accountId: true,
        counterPartyAccount: true,
        expenseCategoryName: true,
        counterPartyTitle: true,
        operationPositions: true,
        account: {
          select: {
            id: true,
            name: true,
            accountNumber: true,
          },
        },
      },
    });

    // Фильтруем по правилу
    const matched = allRows
      .map((op: any) => ({
        ...op,
        counterPartyId:
          accountToCounterPartyId.get(op.counterPartyAccount || '') || null,
      }))
      .filter((op: any) => this.matchRuleWithOriginal(op, rule));

    // Применяем пагинацию к РЕЗУЛЬТАТУ фильтрации
    const paginated = matched.slice(skip, skip + take);

    return { items: paginated, total: matched.length };
  }

  async testRuleByParams(
    data: {
      operationType: 'Debit' | 'Credit' | 'Any';
      keywords: string[];
      accountIds?: number[];
      counterPartyIds?: number[];
    },
    take = 50,
    skip = 0,
  ) {
    // Берем кандидатов по типу операции для ускорения
    const where: any = {};
    if (data.operationType !== 'Any') {
      where.typeOfOperation = data.operationType;
    }
    // Фильтр по счетам, если указаны
    if (data.accountIds && data.accountIds.length > 0) {
      where.accountId = { in: data.accountIds };
    }

    // Предзагрузка контрагентов для маппинга
    const counterParties = await this.prisma.counterParty.findMany({
      select: { id: true, account: true },
    });
    const accountToCounterPartyId = new Map(
      counterParties.map((c) => [c.account || '', c.id]),
    );

    // Загружаем ВСЕ операции по типу (без пагинации на уровне SQL)
    const allRows = await this.prisma.originalOperationFromTbank.findMany({
      where,
      orderBy: { operationDate: 'desc' },
      select: {
        id: true,
        typeOfOperation: true,
        payPurpose: true,
        accountAmount: true,
        accountId: true,
        counterPartyAccount: true,
        expenseCategoryName: true,
        counterPartyTitle: true,
        operationPositions: {
          select: {
            expenseCategory: {
              select: {
                name: true,
              },
            },
          },
        },
        account: {
          select: {
            id: true,
            name: true,
            accountNumber: true,
          },
        },
      },
    });

    // Фильтруем по правилу
    const matched = allRows
      .map((op: any) => ({
        ...op,
        counterPartyId:
          accountToCounterPartyId.get(op.counterPartyAccount || '') || null,
      }))
      .filter((op: any) =>
        this.matchRuleWithOriginal(op, {
          operationType: data.operationType,
          keywords: data.keywords,
          accountIds: data.accountIds,
          counterPartyIds: data.counterPartyIds,
        }),
      );

    // Применяем пагинацию к РЕЗУЛЬТАТУ фильтрации
    const paginated = matched.slice(skip, skip + take);

    return { items: paginated, total: matched.length };
  }

  // === Применение к существующим операциям ===
  async applyRuleToExisting(ruleId: number) {
    const rule = await (this.prisma as any).autoCategoryRule.findUnique({
      where: { id: ruleId },
    });
    if (!rule || !rule.enabled) return { updated: 0, created: 0 };

    const where: any = {};
    if (rule.operationType !== 'Any') {
      where.typeOfOperation = rule.operationType;
    }
    // Фильтр по счетам, если указаны
    if (rule.accountIds && rule.accountIds.length > 0) {
      where.accountId = { in: rule.accountIds };
    }

    // Загружаем порциями, чтобы не перегружать память
    const batchSize = 500;
    let skip = 0;
    let updated = 0;
    let created = 0;

    // Предзагрузка всех контрагентов по аккаунту для ускорения (карта account -> id)
    const counterParties = await this.prisma.counterParty.findMany({
      select: { id: true, account: true },
    });
    const accountToCounterPartyId = new Map(
      counterParties.map((c) => [c.account || '', c.id]),
    );

    for (;;) {
      const originals = await (
        this.prisma as any
      ).originalOperationFromTbank.findMany({
        where,
        orderBy: { id: 'asc' },
        skip,
        take: batchSize,
        select: {
          id: true,
          typeOfOperation: true,
          payPurpose: true,
          accountAmount: true,
          accountId: true,
          counterPartyAccount: true,
          operationDate: true,
        },
      });
      if (!originals.length) break;

      const matchIds: number[] = [];
      for (const op of originals) {
        const opWithCounterParty = {
          ...op,
          counterPartyId:
            accountToCounterPartyId.get(op.counterPartyAccount || '') || null,
        };
        if (this.matchRuleWithOriginal(opWithCounterParty, rule)) {
          matchIds.push(op.id);
        }
      }
      if (matchIds.length) {
        // Обновим существующие позиции
        const updatedRes = await this.prisma.operationPosition.updateMany({
          where: { originalOperationId: { in: matchIds } },
          data: { expenseCategoryId: rule.expenseCategoryId },
        });
        updated += updatedRes.count;

        // Создадим позиции там, где их нет
        const withCounts = await this.prisma.operationPosition.groupBy({
          by: ['originalOperationId'],
          _count: { _all: true },
          where: { originalOperationId: { in: matchIds } },
        });
        const hasPositions = new Set(
          withCounts.map((x) => x.originalOperationId),
        );
        for (const id of matchIds) {
          if (!hasPositions.has(id)) {
            const op = originals.find((o: any) => o.id === id);
            if (!op) continue;
            const counterPartyId = accountToCounterPartyId.get(
              op.counterPartyAccount || '',
            );
            await this.prisma.operationPosition.create({
              data: {
                amount: op.accountAmount,
                period: op.operationDate?.slice(0, 7),
                originalOperationId: id,
                counterPartyId: counterPartyId ?? null,
                expenseCategoryId: rule.expenseCategoryId,
              },
            });
            created += 1;
          }
        }
      }

      skip += originals.length;
      if (originals.length < batchSize) break;
    }

    return { updated, created };
  }

  // Для интеграции: применить все включенные правила к операции
  async applyAllEnabledRulesToOriginal(originalOperationId: number) {
    const op = await (this.prisma as any).originalOperationFromTbank.findUnique(
      {
        where: { id: originalOperationId },
        select: {
          id: true,
          typeOfOperation: true,
          payPurpose: true,
          accountAmount: true,
          accountId: true,
          counterPartyAccount: true,
          operationDate: true,
        },
      },
    );
    if (!op) return { applied: 0 };

    // Получаем ID контрагента
    const counterParty = await this.prisma.counterParty.findFirst({
      where: { account: op.counterPartyAccount || '' },
      select: { id: true },
    });

    const opWithCounterParty = {
      ...op,
      counterPartyId: counterParty?.id ?? null,
    };

    const rules = await (this.prisma as any).autoCategoryRule.findMany({
      where: { enabled: true },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    });

    for (const rule of rules) {
      if (this.matchRuleWithOriginal(opWithCounterParty, rule)) {
        const { count } = await this.prisma.operationPosition.updateMany({
          where: { originalOperationId: op.id },
          data: { expenseCategoryId: rule.expenseCategoryId },
        });
        if (count === 0) {
          await this.prisma.operationPosition.create({
            data: {
              amount: op.accountAmount,
              period: op.operationDate?.slice(0, 7),
              originalOperationId: op.id,
              counterPartyId: counterParty?.id ?? null,
              expenseCategoryId: rule.expenseCategoryId,
            },
          });
        }

        // Останавливаемся на первом совпавшем правиле (жесткая логика)
        return { applied: 1 };
      }
    }
    return { applied: 0 };
  }
}
