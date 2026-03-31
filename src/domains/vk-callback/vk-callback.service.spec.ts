import { PrismaService } from 'src/prisma/prisma.service';
import { VkMessagesProxyService } from '../vk-messages/vk-messages.service';
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
        create: jest.fn().mockResolvedValue({ id: 77, name: 'Иван Иванов' }),
        update: jest.fn(),
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
      ),
      prismaMock,
      prismaService,
      vkMessagesProxyService,
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

  it('returns ok for validated non-group_join callbacks', async () => {
    const { service, loggerService } = createService();

    const result = await service.handleCallback({
      type: 'message_new',
      group_id: 123,
      event_id: 'evt-2',
      secret: 'secret',
    });

    expect(result).toBe('ok');
    expect(loggerService.logValidated).toHaveBeenCalled();
    expect(loggerService.logAcceptedEvent).toHaveBeenCalled();
  });

  it('creates callback event and crm vk for group_join', async () => {
    const { service, prismaMock, vkMessagesProxyService, loggerService } =
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
    expect(prismaMock.vkCallbackEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'processed',
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
});
