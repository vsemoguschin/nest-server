import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VkMessagesProxyService } from '../vk-messages/vk-messages.service';
import { VkCallbackLoggerService } from './logger/vk-callback-logger.service';

type VkCallbackBody = Record<string, unknown> | null | undefined;

type VkIntegrationRecord = {
  id: number;
  accountId: number;
  groupId: number;
  callbackSecret: string;
  confirmationCode: string;
  isActive: boolean;
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
      const nextName = this.buildFullName(vkProfile) || vkExternalId;
      const existingCrmVk = await this.prisma.crmVk.findFirst({
        where: {
          accountId: integration.accountId,
          externalId: vkExternalId,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!existingCrmVk) {
        const createdCrmVk = await this.prisma.crmVk.create({
          data: {
            accountId: integration.accountId,
            externalId: vkExternalId,
            name: nextName,
          },
          select: {
            id: true,
            name: true,
          },
        });

        this.vkCallbackLoggerService.logCrmVkCreated(body, {
          integrationId: integration.id,
          accountId: integration.accountId,
          crmVkId: createdCrmVk.id,
          vkUserId,
        });
      } else {
        let currentName = existingCrmVk.name;
        if (currentName !== nextName) {
          const updatedCrmVk = await this.prisma.crmVk.update({
            where: {
              id: existingCrmVk.id,
            },
            data: {
              name: nextName,
            },
            select: {
              id: true,
              name: true,
            },
          });
          currentName = updatedCrmVk.name;
        }

        this.vkCallbackLoggerService.logCrmVkFound(body, {
          integrationId: integration.id,
          accountId: integration.accountId,
          crmVkId: existingCrmVk.id,
          vkUserId,
          name: currentName,
          nameChanged: currentName === nextName && existingCrmVk.name !== nextName,
        });
      }

      await this.prisma.vkCallbackEvent.update({
        where: {
          id: callbackEvent.id,
        },
        data: {
          status: 'processed',
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

  private readGroupJoinUserId(body: Record<string, unknown>): number | undefined {
    const payload = this.isRecord(body.object) ? body.object : null;
    return this.readNumber(payload?.user_id);
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
