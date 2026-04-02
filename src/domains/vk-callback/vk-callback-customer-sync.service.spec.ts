import { PrismaService } from 'src/prisma/prisma.service';
import { VkCallbackCustomerSyncService } from './vk-callback-customer-sync.service';

describe('VkCallbackCustomerSyncService', () => {
  const createService = () => {
    const prismaMock = {
      crmCustomer: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      crmStatus: {
        findUnique: jest.fn(),
      },
      crmSource: {
        findUnique: jest.fn(),
      },
    };

    return {
      service: new VkCallbackCustomerSyncService(
        prismaMock as unknown as PrismaService,
      ),
      prismaMock,
    };
  };

  it('updates found customer with non-empty VK profile fields and technical fullName', async () => {
    const { service, prismaMock } = createService();

    prismaMock.crmCustomer.findFirst.mockResolvedValue({
      id: 15,
      accountId: 7,
      vkId: 77,
      fullName: 'Пользователь VK',
      photoUrl: 'https://example.com/old.jpg',
      birthday: '',
      sex: 'f',
      sourceId: null,
    });
    prismaMock.crmSource.findUnique.mockResolvedValue({
      id: 19,
      accountId: 7,
    });
    prismaMock.crmCustomer.update.mockResolvedValue({
      id: 15,
      accountId: 7,
      vkId: 77,
      fullName: 'Иван Иванов',
      photoUrl: 'https://example.com/new.jpg',
      birthday: '01.01.2000',
      sex: 'm',
      sourceId: 19,
    });

    const result = await service.syncGroupJoinCustomer({
      integration: {
        id: 11,
        accountId: 7,
        defaultSourceId: 19,
        initialCrmStatusId: null,
      },
      callbackEventId: 51,
      crmVk: {
        id: 77,
        accountId: 7,
        externalId: '321',
        name: 'Иван Иванов',
        messagesGroupId: '',
      },
      vkProfile: {
        id: 321,
        first_name: 'Иван',
        last_name: 'Иванов',
        photo_200: 'https://example.com/new.jpg',
        bdate: '01.01.2000',
        sex: 2,
      },
    });

    expect(prismaMock.crmCustomer.update).toHaveBeenCalledWith({
      where: { id: 15 },
      data: {
        fullName: 'Иван Иванов',
        photoUrl: 'https://example.com/new.jpg',
        birthday: '01.01.2000',
        sex: 'm',
        sourceId: 19,
      },
    });
    expect(result.action).toBe('updated');
  });

  it('does not overwrite existing customer with empty VK values and keeps normal fullName', async () => {
    const { service, prismaMock } = createService();

    prismaMock.crmCustomer.findFirst.mockResolvedValue({
      id: 15,
      accountId: 7,
      vkId: 77,
      fullName: 'Реальное имя',
      photoUrl: 'https://example.com/current.jpg',
      birthday: '01.01.2000',
      sex: 'm',
      sourceId: 21,
    });
    prismaMock.crmSource.findUnique.mockResolvedValue({
      id: 19,
      accountId: 7,
    });

    const result = await service.syncGroupJoinCustomer({
      integration: {
        id: 11,
        accountId: 7,
        defaultSourceId: 19,
        initialCrmStatusId: null,
      },
      callbackEventId: 51,
      crmVk: {
        id: 77,
        accountId: 7,
        externalId: '321',
        name: 'Иван Иванов',
        messagesGroupId: '',
      },
      vkProfile: {
        id: 321,
        first_name: '',
        last_name: '',
        photo_200: '',
        bdate: '',
        sex: 0,
      },
    });

    expect(prismaMock.crmCustomer.update).not.toHaveBeenCalled();
    expect(result.action).toBe('found');
    expect(result.crmCustomer.fullName).toBe('Реальное имя');
  });
});
