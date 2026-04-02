import { Injectable, Logger } from '@nestjs/common';
import { CrmCustomer, CrmVk, CrmTag } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type SyncIntegration = {
  id: number;
  accountId: number;
  initialCrmStatusId?: number | null;
};

type MessageNewPayload = {
  id: number;
  from_id: number;
  peer_id?: number;
  conversation_message_id?: number;
  date?: number;
  ref_source?: string;
};

type SyncParams = {
  integration: SyncIntegration;
  crmVk: CrmVk;
  message: MessageNewPayload;
  callbackEventId?: number;
};

type SyncResult = {
  crmCustomer: CrmCustomer;
  action: 'created' | 'found' | 'updated';
};

const TECHNICAL_VK_FULL_NAME = 'Пользователь VK';
const MESSAGE_NEW_FIXED_STATUS_ACCOUNT_ID = 19;
const MESSAGE_NEW_FIXED_STATUS_ID = 366764;

@Injectable()
export class VkCallbackMessageCustomerSyncService {
  private readonly logger = new Logger(VkCallbackMessageCustomerSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async syncMessageNewCustomer(params: SyncParams): Promise<SyncResult> {
    const { integration, crmVk, message, callbackEventId } = params;
    const accountId = integration.accountId;

    if (!accountId || !crmVk?.id) {
      throw new Error(
        'VK message_new customer sync requires accountId and crmVk.id',
      );
    }

    const messageTimestamp = this.formatMessageTimestamp(message.date);
    const refSource = this.normalizeRefSource(message.ref_source);
    const existingCustomer = await this.prisma.crmCustomer.findFirst({
      where: {
        accountId,
        vkId: crmVk.id,
      },
    });

    if (existingCustomer) {
      const patch: Record<string, string | number> = {};

      if (messageTimestamp && existingCustomer.lastContactDate !== messageTimestamp) {
        patch.lastContactDate = messageTimestamp;
      }

      let crmCustomer = existingCustomer;
      if (Object.keys(patch).length > 0) {
        crmCustomer = await this.prisma.crmCustomer.update({
          where: {
            id: existingCustomer.id,
          },
          data: patch,
        });
      }

      return {
        crmCustomer,
        action: Object.keys(patch).length > 0 ? 'updated' : 'found',
      };
    }

    const status = await this.resolveInitialStatus({
      accountId,
      callbackEventId,
      integrationId: integration.id,
      configuredStatusId: integration.initialCrmStatusId ?? null,
    });

    const crmCustomer = await this.prisma.crmCustomer.create({
      data: {
        accountId,
        vkId: crmVk.id,
        fullName: this.pickCustomerFullName(crmVk.name),
        ...(messageTimestamp
          ? {
              firstContactDate: messageTimestamp,
              lastContactDate: messageTimestamp,
            }
          : {}),
        ...(status ? { crmStatusId: status.id } : {}),
      },
    });

    if (refSource) {
      await this.ensureCustomerTag({
        accountId,
        customerId: crmCustomer.id,
        tagName: refSource,
        callbackEventId,
        integrationId: integration.id,
      });
    }

    return {
      crmCustomer,
      action: 'created',
    };
  }

  private pickCustomerFullName(value: string | null | undefined): string {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : TECHNICAL_VK_FULL_NAME;
  }

  private normalizeRefSource(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private formatMessageTimestamp(value?: number): string | null {
    if (!value || !Number.isFinite(value) || value <= 0) {
      return null;
    }

    const date = new Date(value * 1000);
    if (!Number.isFinite(date.getTime())) {
      return null;
    }

    return date.toISOString().slice(0, 10);
  }

  private async resolveInitialStatus(params: {
    accountId: number;
    callbackEventId?: number;
    integrationId: number;
    configuredStatusId: number | null;
  }): Promise<{ id: number } | null> {
    const { accountId, callbackEventId, integrationId, configuredStatusId } = params;
    const targetStatusId =
      accountId === MESSAGE_NEW_FIXED_STATUS_ACCOUNT_ID
        ? MESSAGE_NEW_FIXED_STATUS_ID
        : configuredStatusId;

    if (!targetStatusId) {
      return null;
    }

    const status = await this.prisma.crmStatus.findUnique({
      where: {
        id: targetStatusId,
      },
      select: {
        id: true,
        accountId: true,
      },
    });

    if (status?.accountId === accountId) {
      return { id: status.id };
    }

    this.logger.warn(
      JSON.stringify({
        scope: 'vk-callback-message-customer-sync',
        event: 'missing_initial_status',
        callbackEventId: callbackEventId ?? null,
        integrationId,
        accountId,
        targetStatusId,
        configuredStatusId,
      }),
    );

    return null;
  }

  private async ensureCustomerTag(params: {
    accountId: number;
    customerId: number;
    tagName: string;
    callbackEventId?: number;
    integrationId: number;
  }): Promise<void> {
    const { accountId, customerId, tagName, callbackEventId, integrationId } = params;
    const tag = await this.findOrCreateTag(accountId, tagName);

    if (tag.accountId !== accountId) {
      this.logger.warn(
        JSON.stringify({
          scope: 'vk-callback-message-customer-sync',
          event: 'tag_account_mismatch',
          callbackEventId: callbackEventId ?? null,
          integrationId,
          accountId,
          tagId: tag.id,
          tagAccountId: tag.accountId ?? null,
          tagName,
        }),
      );
      return;
    }

    await this.prisma.crmCustomerTag.upsert({
      where: {
        customerId_tagId: {
          customerId,
          tagId: tag.id,
        },
      },
      update: {
        accountId,
      },
      create: {
        accountId,
        customerId,
        tagId: tag.id,
      },
    });
  }

  private async findOrCreateTag(accountId: number, tagName: string): Promise<CrmTag> {
    const existingTag = await this.prisma.crmTag.findFirst({
      where: {
        accountId,
        name: tagName,
      },
    });

    if (existingTag) {
      return existingTag;
    }

    return this.prisma.crmTag.create({
      data: {
        accountId,
        name: tagName,
      },
    });
  }
}
