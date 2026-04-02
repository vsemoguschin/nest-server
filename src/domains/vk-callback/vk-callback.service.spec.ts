import { PrismaService } from 'src/prisma/prisma.service';
import { VkMessagesProxyService } from '../vk-messages/vk-messages.service';
import { VkCallbackCustomerSyncService } from './vk-callback-customer-sync.service';
import { VkCallbackMessageCustomerSyncService } from './vk-callback-message-customer-sync.service';
import { VkCallbackLoggerService } from './logger/vk-callback-logger.service';
import { VkCallbackService } from './vk-callback.service';

describe('VkCallbackService', () => {
  const createService = (integrationOverrides: Record<string, unknown> = {}) => {
    const integration = {
      id: 11,
      accountId: 7,
      groupId: 123,
      callbackSecret: 'secret',
      confirmationCode: 'confirm-code',
      isActive: true,
      initialCrmStatusId: null,
      defaultSourceId: null,
      ...integrationOverrides,
    };

    const prismaMock = {
      crmVkIntegration: {
        findUnique: jest.fn().mockResolvedValue(integration),
      },
      vkCallbackEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 51 }),
        update: jest.fn().mockResolvedValue({ id: 51 }),
      },
      crmAccount: {
        findUnique: jest.fn().mockResolvedValue({ code: 'easybook' }),
      },
      crmVk: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 77,
          accountId: 7,
          externalId: '321',
          name: 'Иван Иванов',
          messagesGroupId: '',
        }),
        update: jest.fn().mockResolvedValue({
          id: 77,
          accountId: 7,
          externalId: '321',
          name: 'Иван Иванов',
          messagesGroupId: '',
        }),
      },
    };

    const prismaService = prismaMock as unknown as PrismaService;

    const vkMessagesProxyService = {
      post: jest.fn().mockResolvedValue({
        status: 200,
        data: {
          response: [
            {
              id: 321,
              first_name: 'Иван',
              last_name: 'Иванов',
              sex: 2,
              bdate: '01.01.2000',
              photo_200: 'https://example.com/p.jpg',
            },
          ],
        },
      }),
    } as unknown as VkMessagesProxyService;

    const vkCallbackCustomerSyncService = {
      syncGroupJoinCustomer: jest.fn().mockResolvedValue({
        crmCustomer: {
          id: 501,
        },
        action: 'created',
      }),
    } as unknown as VkCallbackCustomerSyncService;

    const vkCallbackMessageCustomerSyncService = {
      syncMessageNewCustomer: jest.fn().mockResolvedValue({
        crmCustomer: {
          id: 601,
        },
        action: 'created',
      }),
    } as unknown as VkCallbackMessageCustomerSyncService;

    const loggerService = {
      logIncomingEvent: jest.fn(),
      logConfirmation: jest.fn(),
      logUnexpectedCase: jest.fn(),
      logValidationError: jest.fn(),
      logValidated: jest.fn(),
      logDuplicate: jest.fn(),
      logVkProfileLoaded: jest.fn(),
      logCrmVkCreated: jest.fn(),
      logCrmVkFound: jest.fn(),
      logFailed: jest.fn(),
      logAcceptedEvent: jest.fn(),
    } as unknown as VkCallbackLoggerService;

    return {
      service: new VkCallbackService(
        prismaService,
        vkMessagesProxyService,
        loggerService,
        vkCallbackCustomerSyncService,
        vkCallbackMessageCustomerSyncService,
      ),
      prismaMock,
      prismaService,
      vkMessagesProxyService,
      vkCallbackCustomerSyncService,
      vkCallbackMessageCustomerSyncService,
      loggerService,
    };
  };

  it('returns raw confirmation code for confirmation events', async () => {
    const { service, loggerService } = createService();

    const result = await service.handleCallback({
      type: 'confirmation',
      group_id: 123,
      event_id: 'evt-1',
    });

    expect(result).toBe('confirm-code');
    expect(loggerService.logIncomingEvent).toHaveBeenCalled();
    expect(loggerService.logConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'confirmation' }),
      true,
    );
  });

  it('creates callback event and crm vk for message_new', async () => {
    const {
      service,
      prismaMock,
      vkMessagesProxyService,
      vkCallbackCustomerSyncService,
      vkCallbackMessageCustomerSyncService,
      loggerService,
    } = createService();

    const result = await service.handleCallback({
      type: 'message_new',
      group_id: 123,
      event_id: 'evt-2',
      secret: 'secret',
      v: '5.199',
      object: {
        message: {
          id: 901,
          from_id: 321,
          peer_id: 321,
          conversation_message_id: 17,
        },
        client_info: {
          button_actions: ['text'],
        },
      },
    });

    expect(result).toBe('ok');
    expect(prismaMock.vkCallbackEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 7,
          vkIntegrationId: 11,
          eventId: 'evt-2',
          eventType: 'message_new',
          groupId: 123,
          vkUserId: 321,
          apiVersion: '5.199',
          status: 'received',
        }),
      }),
    );
    expect(prismaMock.crmVk.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          accountId: 7,
          externalId: '321',
          name: '321',
        },
      }),
    );
    expect(prismaMock.vkCallbackEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'processed',
          crmCustomerId: 601,
          errorMessage: null,
        }),
      }),
    );
    expect(vkMessagesProxyService.post).not.toHaveBeenCalled();
    expect(vkCallbackCustomerSyncService.syncGroupJoinCustomer).not.toHaveBeenCalled();
    expect(vkCallbackMessageCustomerSyncService.syncMessageNewCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        integration: expect.objectContaining({
          accountId: 7,
        }),
        callbackEventId: 51,
        crmVk: expect.objectContaining({
          id: 77,
          accountId: 7,
          externalId: '321',
        }),
        message: expect.objectContaining({
          id: 901,
          from_id: 321,
          peer_id: 321,
          conversation_message_id: 17,
        }),
      }),
    );
    expect(loggerService.logValidated).toHaveBeenCalled();
    expect(loggerService.logCrmVkCreated).toHaveBeenCalled();
    expect(loggerService.logAcceptedEvent).toHaveBeenCalled();
  });

  it('returns ok for duplicate message_new without reprocessing', async () => {
    const { service, prismaMock, loggerService } = createService();

    (prismaMock.vkCallbackEvent.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 99,
      status: 'processed',
    });

    const result = await service.handleCallback({
      type: 'message_new',
      group_id: 123,
      event_id: 'evt-message-duplicate',
      secret: 'secret',
      object: {
        message: {
          id: 901,
          from_id: 321,
          peer_id: 321,
          conversation_message_id: 17,
        },
      },
    });

    expect(result).toBe('ok');
    expect(loggerService.logDuplicate).toHaveBeenCalled();
    expect(prismaMock.vkCallbackEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.crmVk.create).not.toHaveBeenCalled();
  });

  it('returns ok for incomplete message_new payload without crashing', async () => {
    const { service, prismaMock, loggerService } = createService();

    const result = await service.handleCallback({
      type: 'message_new',
      group_id: 123,
      event_id: 'evt-message-invalid',
      secret: 'secret',
      object: {
        message: {
          peer_id: 321,
        },
      },
    });

    expect(result).toBe('ok');
    expect(loggerService.logValidationError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message_new',
        event_id: 'evt-message-invalid',
      }),
      'missing_message_new_from_id',
      expect.objectContaining({
        integrationId: 11,
        accountId: 7,
        groupId: 123,
        eventId: 'evt-message-invalid',
      }),
    );
    expect(prismaMock.vkCallbackEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.crmVk.create).not.toHaveBeenCalled();
  });

  it('returns ok for message_new with from_id <= 0 without creating entities', async () => {
    const { service, prismaMock, loggerService, vkCallbackMessageCustomerSyncService } =
      createService();

    const result = await service.handleCallback({
      type: 'message_new',
      group_id: 123,
      event_id: 'evt-message-invalid-from-id',
      secret: 'secret',
      object: {
        message: {
          id: 901,
          from_id: 0,
          peer_id: 321,
        },
      },
    });

    expect(result).toBe('ok');
    expect(loggerService.logValidationError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message_new',
        event_id: 'evt-message-invalid-from-id',
      }),
      'invalid_message_new_from_id',
      expect.objectContaining({
        integrationId: 11,
        accountId: 7,
        groupId: 123,
        eventId: 'evt-message-invalid-from-id',
        rawFromId: 0,
      }),
    );
    expect(prismaMock.vkCallbackEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.crmVk.create).not.toHaveBeenCalled();
    expect(vkCallbackMessageCustomerSyncService.syncMessageNewCustomer).not.toHaveBeenCalled();
  });

  it('writes crmCustomerId for existing customer in message_new flow', async () => {
    const { service, prismaMock, vkCallbackMessageCustomerSyncService } = createService();

    (
      vkCallbackMessageCustomerSyncService.syncMessageNewCustomer as jest.Mock
    ).mockResolvedValueOnce({
      crmCustomer: {
        id: 777,
      },
      action: 'updated',
    });

    const result = await service.handleCallback({
      type: 'message_new',
      group_id: 123,
      event_id: 'evt-message-existing-customer',
      secret: 'secret',
      v: '5.199',
      object: {
        message: {
          id: 901,
          from_id: 321,
          peer_id: 321,
          conversation_message_id: 17,
        },
      },
    });

    expect(result).toBe('ok');
    expect(prismaMock.vkCallbackEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'processed',
          crmCustomerId: 777,
        }),
      }),
    );
  });

  it('creates callback event and crm vk for group_join', async () => {
    const {
      service,
      prismaMock,
      vkMessagesProxyService,
      vkCallbackCustomerSyncService,
      loggerService,
    } =
      createService();

    const result = await service.handleCallback({
      type: 'group_join',
      group_id: 123,
      event_id: 'evt-3',
      secret: 'secret',
      v: '5.199',
      object: {
        user_id: 321,
      },
    });

    expect(result).toBe('ok');
    expect(prismaMock.vkCallbackEvent.create).toHaveBeenCalled();
    expect(vkMessagesProxyService.post).toHaveBeenCalledWith(
      '/api/vk/users/get',
      expect.objectContaining({
        source: 'easybook',
        user_ids: '321',
        fields: 'sex,bdate,photo_200',
      }),
    );
    expect(prismaMock.crmVk.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 7,
          externalId: '321',
          name: 'Иван Иванов',
        }),
      }),
    );
    expect(vkCallbackCustomerSyncService.syncGroupJoinCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        integration: expect.objectContaining({
          accountId: 7,
        }),
        callbackEventId: 51,
        crmVk: expect.objectContaining({
          id: 77,
          accountId: 7,
          externalId: '321',
        }),
        vkProfile: expect.objectContaining({
          id: 321,
        }),
      }),
    );
    expect(prismaMock.vkCallbackEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'processed',
          crmCustomerId: 501,
        }),
      }),
    );
    expect(loggerService.logCrmVkCreated).toHaveBeenCalled();
  });

  it('returns ok for duplicate group_join without reprocessing', async () => {
    const { service, prismaMock, vkMessagesProxyService, loggerService } =
      createService();

    (prismaMock.vkCallbackEvent.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 99,
      status: 'processed',
    });

    const result = await service.handleCallback({
      type: 'group_join',
      group_id: 123,
      event_id: 'evt-duplicate',
      secret: 'secret',
      object: {
        user_id: 321,
      },
    });

    expect(result).toBe('ok');
    expect(loggerService.logDuplicate).toHaveBeenCalled();
    expect(prismaMock.vkCallbackEvent.create).not.toHaveBeenCalled();
    expect(vkMessagesProxyService.post).not.toHaveBeenCalled();
  });

  it('does not overwrite crmVk name with technical fallback when VK profile name is empty', async () => {
    const { service, prismaMock, vkMessagesProxyService } = createService();

    (prismaMock.crmVk.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 77,
      accountId: 7,
      externalId: '321',
      name: 'Реальное имя VK',
      messagesGroupId: '',
    });

    (prismaMock.crmVk.update as jest.Mock).mockClear();

    const vkPost = {
      status: 200,
      data: {
        response: [
          {
            id: 321,
            first_name: '',
            last_name: '',
            sex: 2,
            bdate: '01.01.2000',
            photo_200: 'https://example.com/p.jpg',
          },
        ],
      },
    };

    (vkMessagesProxyService.post as jest.Mock).mockResolvedValueOnce(vkPost);

    await service.handleCallback({
      type: 'group_join',
      group_id: 123,
      event_id: 'evt-keep-name',
      secret: 'secret',
      v: '5.199',
      object: {
        user_id: 321,
      },
    });

    expect(prismaMock.crmVk.update).not.toHaveBeenCalled();
  });
});
