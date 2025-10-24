import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';
import axios from 'axios';

@Injectable()
export class TbankSyncService {
  private readonly logger = new Logger(TbankSyncService.name);
  private readonly env = process.env.NODE_ENV as 'development' | 'production';

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
  ) {}

  private async notifyAdmins(text: string) {
    // Send only in production to avoid spam in dev
    if (this.env !== 'production') return;
    const adminIds = ['317401874'];
    for (const id of adminIds) {
      try {
        await this.telegramService.sendToChat(id, text);
      } catch (e: any) {
        this.logger.error(`Failed to notify ${id}: ${e?.message || e}`);
      }
    }
  }

  async getOrCreateCounterParty(counterPartyData: {
    account: string;
    inn: string;
    kpp: string;
    name: string;
    bankName: string;
    bankBic: string;
  }) {
    const existingCounterParty = await this.prisma.counterParty.findFirst({
      where: { account: counterPartyData.account },
    });

    if (existingCounterParty) {
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
      },
    });

    return counterParty;
  }

  async fetchOperationsFromTbank(
    accountNumber: string,
    from: string,
    to: string,
    limit: number = 1000,
    categories?: string[],
    inns?: string[],
  ) {
    const tToken = process.env.TB_TOKEN;
    if (!tToken) {
      throw new Error('TB_TOKEN не установлен в переменных окружения');
    }

    const allOperations: any[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    try {
      while (hasMore) {
        const params: Record<string, string | number | boolean | string[]> = {
          accountNumber,
          operationStatus: 'Transaction',
          from: new Date(from).toISOString(),
          to: new Date(to + 'T23:59:59.999Z').toISOString(),
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

        this.logger.log(
          `Получено ${operations.length} операций, всего: ${allOperations.length}`,
        );
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

  async saveOriginalOperations(operations: any[], accountId: number) {
    let savedCount = 0;
    let lastOperationDate = '';

    for (const op of operations) {
      try {
        // Создаем или находим контрагента
        const counterParty = await this.getOrCreateCounterParty({
          account: op.counterParty.account || '',
          inn: op.counterParty.inn || '',
          kpp: op.counterParty.kpp || '',
          name: op.counterParty.name || '',
          bankName: op.counterParty.bankName || '',
          bankBic: op.counterParty.bankBic || '',
        });

        // Всегда делаем upsert для операции
        const originalOperation = await (
          this.prisma as any
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

        if (existingPositions.length > 0) {
          this.logger.log(
            `Операция ${op.operationId} уже имеет позиции, пропускаем создание позиций`,
          );
          savedCount++;
          continue;
        }

        // Создаем позицию (только если её еще нет)
        await this.prisma.operationPosition.create({
          data: {
            amount: op.accountAmount,
            originalOperationId: originalOperation.id,
            counterPartyId: counterParty.id,
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
      await (this.prisma as any).tbankSyncStatus.upsert({
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

  async syncOperations(from?: string, to?: string) {
    this.logger.log('Starting T-Bank operations sync...');
    await this.notifyAdmins('▶️ Старт синхронизации операций Т-Банка');

    try {
      // Параметры по умолчанию - сегодняшний день
      const today = new Date();
      const fromDate = from || today.toISOString().split('T')[0];
      const toDate = to || today.toISOString().split('T')[0];

      this.logger.log(`Синхронизация операций с ${fromDate} по ${toDate}`);

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
            const result = await this.saveOriginalOperations(
              operations,
              account.id,
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
