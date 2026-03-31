import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Logger } from 'winston';
import {
  VK_CALLBACK_LOGGER_CONFIG,
  VK_CALLBACK_WINSTON_LOGGER,
} from './vk-callback-logger.constants';
import { VkCallbackLoggerConfig } from './vk-callback-logger.config';

type VkCallbackBody = Record<string, any> | null | undefined;

interface VkCallbackLogMeta {
  context: string;
  eventType?: unknown;
  groupId?: unknown;
  eventId?: unknown;
  payload?: unknown;
  [key: string]: unknown;
}

@Injectable()
export class VkCallbackLoggerService implements OnModuleDestroy {
  private readonly context = 'VkCallbackService';

  constructor(
    @Inject(VK_CALLBACK_WINSTON_LOGGER) private readonly logger: Logger,
    @Inject(VK_CALLBACK_LOGGER_CONFIG)
    private readonly config: VkCallbackLoggerConfig,
  ) {}

  onModuleDestroy(): void {
    this.logger.close();
  }

  logIncomingEvent(body: VkCallbackBody): void {
    this.logger.info('vk_callback_received', this.buildMeta(body));
  }

  logConfirmation(body: VkCallbackBody, confirmationCodePresent: boolean): void {
    this.logger.info(
      'vk_callback_confirmation',
      this.buildMeta(body, {
        confirmationCodePresent,
      }),
    );
  }

  logAcceptedEvent(body: VkCallbackBody): void {
    this.logger.info(
      'vk_callback_accepted',
      this.buildMeta(body, {
        outcome: 'ok',
      }),
    );
  }

  logValidated(
    body: VkCallbackBody,
    details?: Record<string, unknown>,
  ): void {
    this.logger.info(
      'vk_callback_validated',
      this.buildMeta(body, details),
    );
  }

  logDuplicate(
    body: VkCallbackBody,
    details?: Record<string, unknown>,
  ): void {
    this.logger.warn(
      'vk_callback_duplicate',
      this.buildMeta(body, details),
    );
  }

  logVkProfileLoaded(
    body: VkCallbackBody,
    details?: Record<string, unknown>,
  ): void {
    this.logger.info(
      'vk_callback_vk_profile_loaded',
      this.buildMeta(body, details),
    );
  }

  logCrmVkCreated(
    body: VkCallbackBody,
    details?: Record<string, unknown>,
  ): void {
    this.logger.info(
      'vk_callback_crm_vk_created',
      this.buildMeta(body, details),
    );
  }

  logCrmVkFound(
    body: VkCallbackBody,
    details?: Record<string, unknown>,
  ): void {
    this.logger.info(
      'vk_callback_crm_vk_found',
      this.buildMeta(body, details),
    );
  }

  logFailed(
    body: VkCallbackBody,
    details?: Record<string, unknown>,
  ): void {
    this.logger.error(
      'vk_callback_failed',
      this.buildMeta(body, details),
    );
  }

  logValidationError(
    body: VkCallbackBody,
    reason: string,
    details?: Record<string, unknown>,
  ): void {
    this.logger.warn(
      'vk_callback_validation_failed',
      this.buildMeta(body, {
        reason,
        ...details,
      }),
    );
  }

  logUnexpectedCase(
    body: VkCallbackBody,
    reason: string,
    details?: Record<string, unknown>,
  ): void {
    this.logger.error(
      'vk_callback_unexpected_case',
      this.buildMeta(body, {
        reason,
        ...details,
      }),
    );
  }

  private buildMeta(
    body: VkCallbackBody,
    extra: Record<string, unknown> = {},
  ): VkCallbackLogMeta {
    const payload = body && typeof body === 'object' ? body : undefined;

    return {
      context: this.context,
      eventType: payload?.type,
      groupId: payload?.group_id,
      eventId: payload?.event_id,
      ...(this.config.logPayload ? { payload: body } : {}),
      ...extra,
    };
  }
}
