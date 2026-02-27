import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AutoCategoryRulesService } from '../domains/auto-category-rules/auto-category-rules.service';
import { TelegramService } from './telegram.service';
import axios from 'axios';

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

interface ReconcileOperationsResult {
  from: string;
  to: string;
  accountsTotal: number;
  accountsProcessed: number;
  apiOperationsTotal: number;
  dbOperationsTotal: number;
  apiOnlyTotal: number;
  dbOnlyTotal: number;
  createdTotal: number;
  deletedTotal: number;
  accountSummaries: Array<{
    accountId: number;
    accountName: string;
    accountNumber: string;
    apiOperations: number;
    dbOperations: number;
    apiOnly: number;
    dbOnly: number;
    created: number;
    deleted: number;
    status: 'success' | 'error';
    errorMessage?: string;
  }>;
}

@Injectable()
export class TbankSyncService {
  private readonly logger = new Logger(TbankSyncService.name);
  private readonly env = process.env.NODE_ENV as 'development' | 'production';

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly autoRules: AutoCategoryRulesService,
  ) {}

  private async getProjectIds() {
    const projects = await this.prisma.project.findMany({
      where: {
        code: { in: ['general', 'easyneon', 'easybook'] },
      },
      select: {
        id: true,
        code: true,
      },
    });

    const byCode = new Map(
      projects.map((project) => [project.code, project.id]),
    );

    const generalId = byCode.get('general');
    if (!generalId) {
      throw new Error(
        'Проект с code="general" не найден. Запусти seed-projects.ts',
      );
    }

    return {
      generalId,
      easyneonId: byCode.get('easyneon') ?? generalId,
      easybookId: byCode.get('easybook') ?? generalId,
    };
  }

  private resolveProjectIdForAccount(
    accountId: number,
    ids: { generalId: number; easyneonId: number; easybookId: number },
  ) {
    if (accountId === 1) return ids.easyneonId;
    if (accountId === 3) return ids.easybookId;
    return ids.generalId;
  }

  private chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  // Функция для определения категории на основе условий
  private determineExpenseCategory(
    typeOfOperation: string,
    category: string,
  ): { incomeCategoryId: number | null; outcomeCategoryId: number | null } {
    const incomeCategoryId: number | null = null;
    let outcomeCategoryId: number | null = null;

    // Оставляем только правило комиссии (не по payPurpose)
    if (typeOfOperation === 'Debit' && category === 'fee') {
      outcomeCategoryId = 48;
    }

    return { incomeCategoryId, outcomeCategoryId };
  }

  private async notifyAdmins(text: string) {
    // Send only in production to avoid spam in dev
    if (this.env !== 'production') return;
    const adminIds = ['317401874'];
    for (const id of adminIds) {
      try {
        await this.telegramService.sendToChat(id, text);
      } catch (e: unknown) {
        this.logger.error(
          `Failed to notify ${id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  async getOrCreateCounterParty(
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
    const existingCounterParty = await this.prisma.counterParty.findFirst({
      where: { account: counterPartyData.account },
      include: {
        incomeExpenseCategory: true,
        outcomeExpenseCategory: true,
        incomeProject: true,
        outcomeProject: true,
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
        const updatedCounterParty = await this.prisma.counterParty.update({
          where: { id: existingCounterParty.id },
          data: updateData,
          include: {
            incomeExpenseCategory: true,
            outcomeExpenseCategory: true,
            incomeProject: true,
            outcomeProject: true,
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

        this.logger.log(
          `Контрагенту "${existingCounterParty.title}" присвоена ${categoryInfo.join(' и ')}`,
        );

        return updatedCounterParty;
      }
      return existingCounterParty;
    }

    const counterParty = await this.prisma.counterParty.create({
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
        incomeProject: true,
        outcomeProject: true,
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

      this.logger.log(
        `Новому контрагенту "${counterParty.title}" присвоена ${categoryInfo.join(' и ')}`,
      );
    }

    return counterParty;
  }

  async fetchOperationsFromTbank(
    accountNumber: string,
    from: string,
    to: string,
    limit: number = 1000,
    categories?: string[],
    inns?: string[],
    options?: { verbose?: boolean },
  ) {
    const tToken = process.env.TB_TOKEN;
    if (!tToken) {
      throw new Error('TB_TOKEN не установлен в переменных окружения');
    }

    const allOperations: OperationFromApi[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;
    const verbose = options?.verbose ?? true;

    try {
      while (hasMore) {
        const params: Record<string, string | number | boolean | string[]> = {
          accountNumber,
          operationStatus: 'Transaction',
          from: `${from}T00:00:00.000Z`,
          to: `${to}T23:59:59.999Z`,
          withBalances: cursor ? false : true,
          limit: Math.min(limit, 5000),
        };

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

        cursor = response.data.nextCursor;
        hasMore = !!cursor && operations.length > 0;

        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        if (verbose) {
          this.logger.log(
            `Получено ${operations.length} операций, всего: ${allOperations.length}`,
          );
        }
      }

      return allOperations;
    } catch (error) {
      this.logger.error(
        `Ошибка при получении операций для счета ${accountNumber}:`,
        error,
      );
      throw error;
    }
  }

  async saveOriginalOperations(
    operations: OperationFromApi[],
    accountId: number,
    projectId: number,
    options?: { verbose?: boolean },
  ) {
    let savedCount = 0;
    let lastOperationDate = '';
    const verbose = options?.verbose ?? true;

    // Подготовим правила из БД для payPurpose
    const rules: Array<{
      id: number;
      enabled: boolean;
      priority: number;
      name: string;
      operationType: string;
      keywords: string[];
      accountIds: number[];
      counterPartyIds: number[];
      expenseCategoryId: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }> = await (this.prisma as any).autoCategoryRule.findMany({
      where: { enabled: true },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        enabled: true,
        priority: true,
        name: true,
        operationType: true,
        keywords: true,
        accountIds: true,
        counterPartyIds: true,
        expenseCategoryId: true,
      },
    });

    const matchInOrder = (haystack: string, words: string[]) => {
      const text = (haystack || '').toLowerCase();
      let from = 0;
      for (const w of words) {
        const needle = (w || '').toLowerCase().trim();
        if (!needle) return false;
        const idx = text.indexOf(needle, from);
        if (idx === -1) return false;
        from = idx + needle.length;
      }
      return true;
    };

    if (verbose) {
      this.logger.log(
        `✅ Загружено ${rules.length} правил из БД для автокатегоризации`,
      );
    }

    const applyRules = (
      op: OperationFromApi,
      opAccountId: number,
      opCounterPartyId: number | null,
    ): number | null => {
      for (const rule of rules) {
        // Проверка типа операции
        if (
          rule.operationType !== 'Any' &&
          rule.operationType !== op.typeOfOperation
        ) {
          continue;
        }

        // Проверка счетов (если указаны в правиле)
        if (rule.accountIds && rule.accountIds.length > 0) {
          if (!rule.accountIds.includes(opAccountId)) {
            continue;
          }
        }

        // Проверка контрагентов (если указаны в правиле)
        if (rule.counterPartyIds && rule.counterPartyIds.length > 0) {
          if (
            !opCounterPartyId ||
            !rule.counterPartyIds.includes(opCounterPartyId)
          ) {
            continue;
          }
        }

        // Проверка ключевых слов
        if (matchInOrder(op.payPurpose || '', rule.keywords)) {
          return rule.expenseCategoryId; // первый матч
        }
      }
      return null;
    };

    for (const op of operations) {
      try {
        // Определяем категорию на основе условий перед созданием контрагента
        let incomeCategoryId: number | null = null;
        let outcomeCategoryIdFromRules: number | null = null;
        const { outcomeCategoryId } = this.determineExpenseCategory(
          op.typeOfOperation,
          op.category,
        );

        // Первая попытка применения правил БД (без учета контрагента, т.к. он еще не создан)
        // Применяем только правила без фильтра по контрагентам
        const matchedCategoryIdWithoutCounterParty = applyRules(
          op,
          accountId,
          null, // counterPartyId еще неизвестен
        );
        if (matchedCategoryIdWithoutCounterParty) {
          if (op.typeOfOperation === 'Credit') {
            incomeCategoryId = matchedCategoryIdWithoutCounterParty;
          } else if (op.typeOfOperation === 'Debit') {
            outcomeCategoryIdFromRules = matchedCategoryIdWithoutCounterParty;
          }
        }

        // Проверка на начало counterPartyTitle с ООО/ИП/etc (только для Credit операций)
        if (
          !incomeCategoryId &&
          op.typeOfOperation === 'Credit' &&
          op.counterParty.name
        ) {
          const counterPartyTitle = op.counterParty.name.toLowerCase();
          if (
            counterPartyTitle.startsWith('ооо') ||
            counterPartyTitle.startsWith('ип') ||
            counterPartyTitle.startsWith(
              'общество с ограниченной ответственностью',
            ) ||
            counterPartyTitle.startsWith('индивидуальный предприниматель')
          ) {
            // Список исключений
            const exceptions = [
              'индивидуальный предприниматель мазунин максим евгеньевич',
              'общество с ограниченной ответственностью "экспресс курьер"',
              'общество с ограниченной ответственностью "рвб"',
            ];
            const isException = exceptions.some((exception) =>
              counterPartyTitle.includes(exception.toLowerCase()),
            );
            if (!isException) {
              incomeCategoryId = 1;
            }
          }
        }

        // Создаем или находим контрагента с определенной категорией
        // Для Debit используем категорию из правил, если она есть, иначе из determineExpenseCategory
        const finalOutcomeCategoryId =
          outcomeCategoryIdFromRules || outcomeCategoryId;
        const counterParty = await this.getOrCreateCounterParty(
          {
            account: op.counterParty.account || '',
            inn: op.counterParty.inn || '',
            kpp: op.counterParty.kpp || '',
            name: op.counterParty.name || '',
            bankName: op.counterParty.bankName || '',
            bankBic: op.counterParty.bankBic || '',
          },
          incomeCategoryId,
          finalOutcomeCategoryId,
        );

        // Теперь применяем правила БД с учетом accountId и counterPartyId
        // Это может переопределить предыдущий результат, если есть правила с фильтром по контрагентам
        const matchedCategoryIdWithCounterParty = applyRules(
          op,
          accountId,
          counterParty.id,
        );
        if (matchedCategoryIdWithCounterParty) {
          if (op.typeOfOperation === 'Credit') {
            incomeCategoryId = matchedCategoryIdWithCounterParty;
          } else if (op.typeOfOperation === 'Debit') {
            outcomeCategoryIdFromRules = matchedCategoryIdWithCounterParty;
          }
        }

        // Всегда делаем upsert для операции
        const originalOperation = await (
          this.prisma as unknown as {
            originalOperationFromTbank: {
              upsert: (args: {
                where: { operationId: string };
                update: Record<string, unknown>;
                create: Record<string, unknown>;
              }) => Promise<{ id: number }>;
            };
          }
        ).originalOperationFromTbank.upsert({
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
        const existingPositions = await this.prisma.operationPosition.findMany({
          where: {
            originalOperationId: originalOperation.id,
          },
        });

        // Если позиции уже есть, пропускаем создание новых
        if (existingPositions.length > 0) {
        if (verbose) {
          this.logger.log(
            `Операция ${op.operationId} уже имеет позиции, пропускаем создание позиций`,
          );
        }
        savedCount++;
        continue;
      }

        // Определяем категорию: 1) правила БД по payPurpose (приоритет); 2) по типу операции/категории контрагента
        let expenseCategoryId: number | null = null;

        // Сначала проверяем правила БД (высший приоритет)
        if (op.typeOfOperation === 'Credit' && incomeCategoryId) {
          expenseCategoryId = incomeCategoryId;
          if (verbose) {
            this.logger.log(
              `Операция ${op.operationId}: присвоена категория ${expenseCategoryId} по правилу БД (Credit)`,
            );
          }
        } else if (
          op.typeOfOperation === 'Debit' &&
          outcomeCategoryIdFromRules
        ) {
          expenseCategoryId = outcomeCategoryIdFromRules;
          if (verbose) {
            this.logger.log(
              `Операция ${op.operationId}: присвоена категория ${expenseCategoryId} по правилу БД (Debit)`,
            );
          }
        } else {
          // Если правила не сработали, используем категорию контрагента
          if (
            op.typeOfOperation === 'Credit' &&
            counterParty.incomeExpenseCategory
          ) {
            expenseCategoryId = counterParty.incomeExpenseCategory.id;
            if (verbose) {
              this.logger.log(
                `Операция ${op.operationId}: присвоена входящая категория "${counterParty.incomeExpenseCategory.name}" для контрагента "${counterParty.title}"`,
              );
            }
          } else if (
            op.typeOfOperation === 'Debit' &&
            counterParty.outcomeExpenseCategory
          ) {
            // Для Debit - используем исходящую категорию контрагента
            expenseCategoryId = counterParty.outcomeExpenseCategory.id;
            if (verbose) {
              this.logger.log(
                `Операция ${op.operationId}: присвоена исходящая категория "${counterParty.outcomeExpenseCategory.name}" для контрагента "${counterParty.title}"`,
              );
            }
          }
        }

        let positionProjectId = projectId;
        if (op.typeOfOperation === 'Credit' && counterParty.incomeProject) {
          positionProjectId = counterParty.incomeProject.id;
        } else if (
          op.typeOfOperation === 'Debit' &&
          counterParty.outcomeProject
        ) {
          positionProjectId = counterParty.outcomeProject.id;
        }

        // Создаем позицию (только если её еще нет)
        await this.prisma.operationPosition.create({
          data: {
            amount: op.accountAmount,
            period: op.operationDate?.slice(0, 7),
            originalOperationId: originalOperation.id,
            counterPartyId: counterParty.id,
            expenseCategoryId: expenseCategoryId,
            projectId: positionProjectId,
          },
        });

        savedCount++;
        if (op.operationDate > lastOperationDate) {
          lastOperationDate = op.operationDate;
        }
      } catch (error) {
        this.logger.error(
          `Ошибка при сохранении операции ${op.operationId}:`,
          error,
        );
      }
    }

    // Обновляем статус синхронизации
    await this.updateSyncStatus(
      accountId,
      lastOperationDate,
      savedCount,
      'success',
    );

    return { savedCount, lastOperationDate };
  }

  async updateSyncStatus(
    accountId: number,
    lastOperationDate: string,
    totalOperations: number,
    status: 'success' | 'error' | 'in_progress',
    errorMessage?: string,
  ) {
    try {
      await (
        this.prisma as unknown as {
          tbankSyncStatus: {
            upsert: (args: {
              where: { accountId: number };
              update: Record<string, unknown>;
              create: Record<string, unknown>;
            }) => Promise<unknown>;
          };
        }
      ).tbankSyncStatus.upsert({
        where: { accountId },
        update: {
          lastSyncDate: new Date(),
          lastOperationDate: lastOperationDate.slice(0, 10),
          totalOperations: {
            increment: totalOperations,
          },
          syncStatus: status,
          errorMessage: errorMessage || null,
        },
        create: {
          accountId,
          lastSyncDate: new Date(),
          lastOperationDate: lastOperationDate.slice(0, 10),
          totalOperations,
          syncStatus: status,
          errorMessage: errorMessage || null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Ошибка при обновлении статуса синхронизации для аккаунта ${accountId}:`,
        error,
      );
    }
  }

  async reconcileOperationsByPeriod(
    from: string,
    to: string,
  ): Promise<ReconcileOperationsResult> {
    const result: ReconcileOperationsResult = {
      from,
      to,
      accountsTotal: 0,
      accountsProcessed: 0,
      apiOperationsTotal: 0,
      dbOperationsTotal: 0,
      apiOnlyTotal: 0,
      dbOnlyTotal: 0,
      createdTotal: 0,
      deletedTotal: 0,
      accountSummaries: [],
    };

    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    const projectIds = await this.getProjectIds();
    const accounts = await this.prisma.planFactAccount.findMany({
      where: { isReal: true },
      select: {
        id: true,
        name: true,
        accountNumber: true,
      },
      orderBy: { id: 'asc' },
    });

    result.accountsTotal = accounts.length;

    const originalOperationRepo = this.prisma as unknown as {
      originalOperationFromTbank: {
        findMany: (args: {
          where: Record<string, unknown>;
          select: { id: true; operationId: true };
          orderBy?: Record<string, 'asc' | 'desc'>;
        }) => Promise<Array<{ id: number; operationId: string }>>;
        deleteMany: (args: {
          where: { id: { in: number[] } };
        }) => Promise<{ count: number }>;
      };
    };

    for (const account of accounts) {
      try {
        const apiOperations = await this.fetchOperationsFromTbank(
          account.accountNumber,
          from,
          to,
          1000,
          undefined,
          undefined,
          { verbose: false },
        );
        result.apiOperationsTotal += apiOperations.length;

        const dbOperations = await originalOperationRepo.originalOperationFromTbank.findMany(
          {
            where: {
              accountId: account.id,
              operationDate: {
                gte: fromDate,
                lte: toDate,
              },
            },
            select: {
              id: true,
              operationId: true,
            },
            orderBy: {
              id: 'asc',
            },
          },
        );
        result.dbOperationsTotal += dbOperations.length;

        const dbOperationIds = new Set(dbOperations.map((item) => item.operationId));
        const apiOperationIds = new Set(apiOperations.map((item) => item.operationId));

        const apiOnlyOperations = apiOperations.filter(
          (item) => !dbOperationIds.has(item.operationId),
        );
        const dbOnlyIds = dbOperations
          .filter((item) => !apiOperationIds.has(item.operationId))
          .map((item) => item.id);

        result.apiOnlyTotal += apiOnlyOperations.length;
        result.dbOnlyTotal += dbOnlyIds.length;

        let createdCount = 0;
        if (apiOnlyOperations.length > 0) {
          const projectId = this.resolveProjectIdForAccount(account.id, projectIds);
          const saveResult = await this.saveOriginalOperations(
            apiOnlyOperations,
            account.id,
            projectId,
            { verbose: false },
          );
          createdCount = saveResult.savedCount;
          result.createdTotal += saveResult.savedCount;
        } else {
          await this.updateSyncStatus(account.id, to, 0, 'success');
        }

        let deletedCount = 0;
        if (dbOnlyIds.length > 0) {
          const chunks = this.chunkArray(dbOnlyIds, 500);
          for (const idsChunk of chunks) {
            await this.prisma.$transaction(async (tx) => {
              await tx.operationPosition.deleteMany({
                where: { originalOperationId: { in: idsChunk } },
              });
              await (
                tx as unknown as {
                  originalOperationFromTbank: {
                    deleteMany: (args: {
                      where: { id: { in: number[] } };
                    }) => Promise<{ count: number }>;
                  };
                }
              ).originalOperationFromTbank.deleteMany({
                where: { id: { in: idsChunk } },
              });
            });
            deletedCount += idsChunk.length;
          }
          result.deletedTotal += deletedCount;
        }

        result.accountsProcessed += 1;

        if (apiOnlyOperations.length > 0 || dbOnlyIds.length > 0) {
          this.logger.log(
            `[T-Bank Reconcile] accountId=${account.id} (${account.accountNumber}) db=${dbOperations.length} api=${apiOperations.length} create=${apiOnlyOperations.length} saved=${createdCount} delete=${deletedCount}`,
          );
        }

        result.accountSummaries.push({
          accountId: account.id,
          accountName: account.name,
          accountNumber: account.accountNumber,
          apiOperations: apiOperations.length,
          dbOperations: dbOperations.length,
          apiOnly: apiOnlyOperations.length,
          dbOnly: dbOnlyIds.length,
          created: createdCount,
          deleted: deletedCount,
          status: 'success',
        });
      } catch (error) {
        this.logger.error(
          `[T-Bank Reconcile] accountId=${account.id} (${account.accountNumber}) failed: ${error instanceof Error ? error.message : error}`,
        );
        await this.updateSyncStatus(
          account.id,
          to,
          0,
          'error',
          error instanceof Error ? error.message : 'Неизвестная ошибка',
        );
        result.accountSummaries.push({
          accountId: account.id,
          accountName: account.name,
          accountNumber: account.accountNumber,
          apiOperations: 0,
          dbOperations: 0,
          apiOnly: 0,
          dbOnly: 0,
          created: 0,
          deleted: 0,
          status: 'error',
          errorMessage:
            error instanceof Error ? error.message : 'Неизвестная ошибка',
        });
      }
    }

    this.logger.log(
      `[T-Bank Reconcile] done ${from}..${to}: accounts=${result.accountsProcessed}/${result.accountsTotal}, db=${result.dbOperationsTotal}, api=${result.apiOperationsTotal}, apiOnly=${result.apiOnlyTotal}, dbOnly=${result.dbOnlyTotal}, created=${result.createdTotal}, deleted=${result.deletedTotal}`,
    );

    return result;
  }

  async syncOperations(from?: string, to?: string) {
    this.logger.log('Starting T-Bank operations sync...');
    await this.notifyAdmins('▶️ Старт синхронизации операций Т-Банка');

    try {
      // Параметры по умолчанию - сегодняшний день
      const today = new Date();
      const fromDate = from || today.toISOString().split('T')[0];
      const toDate = to || today.toISOString().split('T')[0];

      this.logger.log(`Синхронизация операций с ${fromDate} по ${toDate}`);

      const { generalId, easyneonId, easybookId } =
        await this.getProjectIds();

      // Получаем все аккаунты с доступом к API
      const accounts = await this.prisma.planFactAccount.findMany({
        where: {
          isReal: true,
        },
      });

      this.logger.log(`Найдено ${accounts.length} аккаунтов с API доступом`);

      let totalSaved = 0;
      for (const account of accounts) {
        this.logger.log(
          `Обрабатываем аккаунт: ${account.name} (${account.accountNumber})`,
        );

        try {
          // Устанавливаем статус "в процессе"
          await this.updateSyncStatus(account.id, '', 0, 'in_progress');

          const operations = await this.fetchOperationsFromTbank(
            account.accountNumber,
            fromDate,
            toDate,
            1000,
          );

          this.logger.log(
            `Получено ${operations.length} операций для аккаунта ${account.name}`,
          );

          if (operations.length > 0) {
            const projectId = this.resolveProjectIdForAccount(account.id, {
              generalId,
              easyneonId,
              easybookId,
            });

            const result = await this.saveOriginalOperations(
              operations,
              account.id,
              projectId,
            );
            this.logger.log(
              `Сохранено ${result.savedCount} операций для аккаунта ${account.name}. Последняя операция: ${result.lastOperationDate}`,
            );
            totalSaved += result.savedCount;
          } else {
            await this.updateSyncStatus(account.id, '', 0, 'success');
            this.logger.log(`Операций не найдено для аккаунта ${account.name}`);
          }
        } catch (error) {
          this.logger.error(
            `Ошибка при обработке аккаунта ${account.name}:`,
            error,
          );
          await this.updateSyncStatus(
            account.id,
            '',
            0,
            'error',
            error instanceof Error ? error.message : 'Неизвестная ошибка',
          );
        }
      }

      this.logger.log(
        `Синхронизация завершена. Всего сохранено: ${totalSaved} операций`,
      );
      await this.notifyAdmins(
        `✅ Синхронизация завершена. Сохранено: ${totalSaved} операций`,
      );
    } catch (error) {
      this.logger.error('Ошибка выполнения синхронизации:', error);
      await this.notifyAdmins(`❌ Ошибка синхронизации: ${error.message}`);
    }
  }
}
