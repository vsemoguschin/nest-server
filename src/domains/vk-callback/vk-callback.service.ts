import { Injectable } from '@nestjs/common';
import { CrmVk, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VkMessagesProxyService } from '../vk-messages/vk-messages.service';
import { VkCallbackCustomerSyncService } from './vk-callback-customer-sync.service';
import { VkCallbackMessageCustomerSyncService } from './vk-callback-message-customer-sync.service';
import { VkCallbackLoggerService } from './logger/vk-callback-logger.service';

type VkCallbackBody = Record<string, unknown> | null | undefined;

type VkIntegrationRecord = {
  id: number;
  accountId: number;
  groupId: number;
  callbackSecret: string;
  confirmationCode: string;
  isActive: boolean;
  initialCrmStatusId: number | null;
  defaultSourceId: number | null;
};

type VkUserProfile = {
  id: number;
  first_name?: string;
  last_name?: string;
  sex?: number;
  bdate?: string;
  photo_200?: string;
};

@Injectable()
export class VkCallbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vkMessagesProxyService: VkMessagesProxyService,
    private readonly vkCallbackLoggerService: VkCallbackLoggerService,
    private readonly vkCallbackCustomerSyncService: VkCallbackCustomerSyncService,
    private readonly vkCallbackMessageCustomerSyncService: VkCallbackMessageCustomerSyncService,
  ) {}

  async handleCallback(body: VkCallbackBody): Promise<string> {
    this.vkCallbackLoggerService.logIncomingEvent(body);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      this.vkCallbackLoggerService.logValidationError(
        body,
        'invalid_callback_body',
      );
      return 'ok';
    }

    const groupId = this.readNumber(body.group_id);
    if (!groupId) {
      this.vkCallbackLoggerService.logValidationError(body, 'missing_group_id');
      return 'ok';
    }

    const integration = await this.prisma.crmVkIntegration.findUnique({
      where: {
        groupId,
      },
      select: {
        id: true,
        accountId: true,
        groupId: true,
        callbackSecret: true,
        confirmationCode: true,
        isActive: true,
        initialCrmStatusId: true,
        defaultSourceId: true,
      },
    });

    if (!integration) {
      this.vkCallbackLoggerService.logValidationError(
        body,
        'integration_not_found',
        {
          groupId,
        },
      );
      return 'ok';
    }

    if (!integration.isActive) {
      this.vkCallbackLoggerService.logValidationError(
        body,
        'integration_inactive',
        {
          integrationId: integration.id,
          accountId: integration.accountId,
          groupId,
        },
      );
      return 'ok';
    }

    if (body.type === 'confirmation') {
      const confirmationCode = integration.confirmationCode.trim();
      this.vkCallbackLoggerService.logConfirmation(
        body,
        confirmationCode.length > 0,
      );
      if (!confirmationCode) {
        this.vkCallbackLoggerService.logUnexpectedCase(
          body,
          'confirmation_code_missing',
          {
            integrationId: integration.id,
            accountId: integration.accountId,
            groupId,
          },
        );
      }
      return confirmationCode;
    }

    if (!this.readString(body.type)) {
      this.vkCallbackLoggerService.logValidationError(body, 'missing_event_type');
      return 'ok';
    }

    const providedSecret = this.readString(body.secret);
    if (providedSecret !== integration.callbackSecret) {
      this.vkCallbackLoggerService.logValidationError(body, 'secret_mismatch');
      return 'ok';
    }

    this.vkCallbackLoggerService.logValidated(body, {
      integrationId: integration.id,
      accountId: integration.accountId,
      groupId: integration.groupId,
    });

    if (body.type === 'group_join') {
      await this.processGroupJoin(body, integration);
    }

    if (body.type === 'message_new') {
      await this.processMessageNew(body, integration);
    }

    this.vkCallbackLoggerService.logAcceptedEvent(body);

    return 'ok';
  }

  private async processGroupJoin(
    body: Record<string, unknown>,
    integration: VkIntegrationRecord,
  ): Promise<void> {
    const eventId = this.readString(body.event_id);
    if (!eventId) {
      this.vkCallbackLoggerService.logValidationError(body, 'missing_event_id', {
        integrationId: integration.id,
        accountId: integration.accountId,
        groupId: integration.groupId,
      });
      return;
    }

    const existingEvent = await this.prisma.vkCallbackEvent.findUnique({
      where: {
        vkIntegrationId_eventId: {
          vkIntegrationId: integration.id,
          eventId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existingEvent) {
      this.vkCallbackLoggerService.logDuplicate(body, {
        integrationId: integration.id,
        accountId: integration.accountId,
        callbackEventId: existingEvent.id,
        currentStatus: existingEvent.status,
      });
      return;
    }

    const vkUserId = this.readGroupJoinUserId(body);
    const callbackEvent = await this.prisma.vkCallbackEvent.create({
      data: {
        accountId: integration.accountId,
        vkIntegrationId: integration.id,
        eventId,
        eventType: this.readString(body.type) ?? 'unknown',
        groupId: integration.groupId,
        vkUserId,
        apiVersion: this.readString(body.v) ?? '',
        payload: body as Prisma.InputJsonValue,
        status: 'received',
      },
      select: {
        id: true,
      },
    });

    try {
      if (!vkUserId) {
        throw new Error('VK user id is missing in group_join payload');
      }

      const account = await this.prisma.crmAccount.findUnique({
        where: {
          id: integration.accountId,
        },
        select: {
          code: true,
        },
      });

      const source = account?.code?.trim().toLowerCase();
      if (!source) {
        throw new Error(
          `CRM account code is missing for accountId=${integration.accountId}`,
        );
      }

      const vkProfileResult = await this.vkMessagesProxyService.post(
        '/api/vk/users/get',
        {
          source,
          user_ids: String(vkUserId),
          fields: 'sex,bdate,photo_200',
        },
      );

      if (vkProfileResult.status >= 400) {
        throw new Error(
          `vk-service users.get failed with status ${vkProfileResult.status}`,
        );
      }

      const vkProfile = this.extractVkProfile(vkProfileResult.data);
      if (!vkProfile) {
        throw new Error('VK profile is empty for users.get');
      }

      this.vkCallbackLoggerService.logVkProfileLoaded(body, {
        integrationId: integration.id,
        accountId: integration.accountId,
        vkUserId,
        sex: vkProfile.sex ?? null,
        bdate: vkProfile.bdate ?? null,
        hasPhoto200: Boolean(vkProfile.photo_200),
      });

      const vkExternalId = String(vkUserId);
      const vkProfileName = this.buildFullName(vkProfile);
      const nextCrmVkName = vkProfileName || vkExternalId;
      let crmVk: CrmVk;
      const existingCrmVk = await this.prisma.crmVk.findFirst({
        where: {
          accountId: integration.accountId,
          externalId: vkExternalId,
        },
        select: {
          id: true,
          accountId: true,
          externalId: true,
          name: true,
          messagesGroupId: true,
        },
      });

      if (!existingCrmVk) {
        const createdCrmVk = await this.prisma.crmVk.create({
          data: {
            accountId: integration.accountId,
            externalId: vkExternalId,
            name: nextCrmVkName,
          },
        });
        crmVk = createdCrmVk;

        this.vkCallbackLoggerService.logCrmVkCreated(body, {
          integrationId: integration.id,
          accountId: integration.accountId,
          crmVkId: createdCrmVk.id,
          vkUserId,
        });
      } else {
        let currentName = existingCrmVk.name;
        if (vkProfileName && currentName !== vkProfileName) {
          const updatedCrmVk = await this.prisma.crmVk.update({
            where: {
              id: existingCrmVk.id,
            },
            data: {
              name: vkProfileName,
            },
          });
          currentName = updatedCrmVk.name;
          crmVk = updatedCrmVk;
        } else {
          crmVk = existingCrmVk;
        }

        this.vkCallbackLoggerService.logCrmVkFound(body, {
          integrationId: integration.id,
          accountId: integration.accountId,
          crmVkId: existingCrmVk.id,
          vkUserId,
          name: currentName,
          nameChanged: currentName === vkProfileName && existingCrmVk.name !== vkProfileName,
        });
      }

      const { crmCustomer } =
        await this.vkCallbackCustomerSyncService.syncGroupJoinCustomer({
          integration,
          callbackEventId: callbackEvent.id,
          crmVk,
          vkProfile,
        });

      await this.prisma.vkCallbackEvent.update({
        where: {
          id: callbackEvent.id,
        },
        data: {
          status: 'processed',
          crmCustomerId: crmCustomer.id,
          processedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      const errorMessage = this.toErrorMessage(error);

      await this.prisma.vkCallbackEvent.update({
        where: {
          id: callbackEvent.id,
        },
        data: {
          status: 'failed',
          errorMessage,
          processedAt: new Date(),
        },
      });

      this.vkCallbackLoggerService.logFailed(body, {
        integrationId: integration.id,
        accountId: integration.accountId,
        callbackEventId: callbackEvent.id,
        vkUserId: vkUserId ?? null,
        errorMessage,
      });
    }
  }

  private async processMessageNew(
    body: Record<string, unknown>,
    integration: VkIntegrationRecord,
  ): Promise<void> {
    const eventId = this.readString(body.event_id);
    if (!eventId) {
      this.vkCallbackLoggerService.logValidationError(body, 'missing_event_id', {
        integrationId: integration.id,
        accountId: integration.accountId,
        groupId: integration.groupId,
      });
      return;
    }

    const existingEvent = await this.prisma.vkCallbackEvent.findUnique({
      where: {
        vkIntegrationId_eventId: {
          vkIntegrationId: integration.id,
          eventId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existingEvent) {
      this.vkCallbackLoggerService.logDuplicate(body, {
        integrationId: integration.id,
        accountId: integration.accountId,
        callbackEventId: existingEvent.id,
        currentStatus: existingEvent.status,
      });
      return;
    }

    const message = this.readMessageNewMessage(body);
    if (!message) {
      this.vkCallbackLoggerService.logValidationError(
        body,
        'missing_message_new_message',
        {
          integrationId: integration.id,
          accountId: integration.accountId,
          groupId: integration.groupId,
          eventId,
        },
      );
      return;
    }

    const vkUserId = this.readNumber(message.from_id);
    if (vkUserId === undefined) {
      this.vkCallbackLoggerService.logValidationError(
        body,
        'missing_message_new_from_id',
        {
          integrationId: integration.id,
          accountId: integration.accountId,
          groupId: integration.groupId,
          eventId,
        },
      );
      return;
    }

    if (vkUserId <= 0) {
      this.vkCallbackLoggerService.logValidationError(
        body,
        'invalid_message_new_from_id',
        {
          integrationId: integration.id,
          accountId: integration.accountId,
          groupId: integration.groupId,
          eventId,
          rawFromId: message.from_id,
        },
      );
      return;
    }

    const messageId = this.readNumber(message.id);
    if (!messageId) {
      this.vkCallbackLoggerService.logValidationError(
        body,
        'missing_message_new_message_id',
        {
          integrationId: integration.id,
          accountId: integration.accountId,
          groupId: integration.groupId,
          eventId,
          vkUserId,
        },
      );
      return;
    }

    const peerId = this.readNumber(message.peer_id);
    const conversationMessageId = this.readNumber(message.conversation_message_id);
    const callbackEvent = await this.prisma.vkCallbackEvent.create({
      data: {
        accountId: integration.accountId,
        vkIntegrationId: integration.id,
        eventId,
        eventType: this.readString(body.type) ?? 'unknown',
        groupId: integration.groupId,
        vkUserId,
        apiVersion: this.readString(body.v) ?? '',
        payload: body as Prisma.InputJsonValue,
        status: 'received',
      },
      select: {
        id: true,
      },
    });

    try {
      const vkExternalId = String(vkUserId);
      const messageDate = this.readNumber(message.date);
      const refSource = this.readString(message.ref_source);
      let crmVk: CrmVk;
      const existingCrmVk = await this.prisma.crmVk.findFirst({
        where: {
          accountId: integration.accountId,
          externalId: vkExternalId,
        },
        select: {
          id: true,
          accountId: true,
          externalId: true,
          name: true,
          messagesGroupId: true,
        },
      });

      if (!existingCrmVk) {
        const createdCrmVk = await this.prisma.crmVk.create({
          data: {
            accountId: integration.accountId,
            externalId: vkExternalId,
            name: vkExternalId,
          },
        });
        crmVk = createdCrmVk;

        this.vkCallbackLoggerService.logCrmVkCreated(body, {
          integrationId: integration.id,
          accountId: integration.accountId,
          crmVkId: createdCrmVk.id,
          vkUserId,
          messageId,
          peerId: peerId ?? null,
          conversationMessageId: conversationMessageId ?? null,
        });
      } else {
        crmVk = existingCrmVk;
        this.vkCallbackLoggerService.logCrmVkFound(body, {
          integrationId: integration.id,
          accountId: integration.accountId,
          crmVkId: existingCrmVk.id,
          vkUserId,
          messageId,
          peerId: peerId ?? null,
          conversationMessageId: conversationMessageId ?? null,
          name: existingCrmVk.name,
          nameChanged: false,
        });
      }

      const { crmCustomer } =
        await this.vkCallbackMessageCustomerSyncService.syncMessageNewCustomer({
          integration,
          callbackEventId: callbackEvent.id,
          crmVk,
          message: {
            id: messageId,
            from_id: vkUserId,
            ...(peerId ? { peer_id: peerId } : {}),
            ...(conversationMessageId
              ? { conversation_message_id: conversationMessageId }
              : {}),
            ...(messageDate ? { date: messageDate } : {}),
            ...(refSource ? { ref_source: refSource } : {}),
          },
        });

      await this.prisma.vkCallbackEvent.update({
        where: {
          id: callbackEvent.id,
        },
        data: {
          status: 'processed',
          crmCustomerId: crmCustomer.id,
          processedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      const errorMessage = this.toErrorMessage(error);

      await this.prisma.vkCallbackEvent.update({
        where: {
          id: callbackEvent.id,
        },
        data: {
          status: 'failed',
          errorMessage,
          processedAt: new Date(),
        },
      });

      this.vkCallbackLoggerService.logFailed(body, {
        integrationId: integration.id,
        accountId: integration.accountId,
        callbackEventId: callbackEvent.id,
        vkUserId,
        messageId,
        peerId: peerId ?? null,
        conversationMessageId: conversationMessageId ?? null,
        errorMessage,
      });
    }
  }

  private readGroupJoinUserId(body: Record<string, unknown>): number | undefined {
    const payload = this.isRecord(body.object) ? body.object : null;
    return this.readNumber(payload?.user_id);
  }

  private readMessageNewMessage(
    body: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const payload = this.isRecord(body.object) ? body.object : null;
    const message = payload && this.isRecord(payload.message) ? payload.message : null;
    return message;
  }

  private extractVkProfile(payload: unknown): VkUserProfile | null {
    if (!this.isRecord(payload)) return null;
    const response = payload.response;
    if (!Array.isArray(response) || response.length === 0) return null;

    const first = response[0];
    if (!this.isRecord(first)) return null;

    const id = this.readNumber(first.id);
    if (!id) return null;

    return {
      id,
      first_name: this.readString(first.first_name),
      last_name: this.readString(first.last_name),
      sex: this.readNumber(first.sex),
      bdate: this.readString(first.bdate),
      photo_200: this.readString(first.photo_200),
    };
  }

  private buildFullName(profile: VkUserProfile): string {
    return [profile.first_name ?? '', profile.last_name ?? '']
      .join(' ')
      .trim();
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private readString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return undefined;
  }

  private readNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }

  private toErrorMessage(error: unknown): string {
    const raw =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';

    return raw.length > 1000 ? `${raw.slice(0, 1000)}...` : raw;
  }
}
