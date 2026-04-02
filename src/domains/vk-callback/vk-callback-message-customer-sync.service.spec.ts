import { PrismaService } from 'src/prisma/prisma.service';
import { VkCallbackMessageCustomerSyncService } from './vk-callback-message-customer-sync.service';

describe('VkCallbackMessageCustomerSyncService', () => {
  const createService = () => {
    const prismaMock = {
      crmCustomer: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      crmStatus: {
        findUnique: jest.fn(),
      },
      crmTag: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      crmCustomerTag: {
        upsert: jest.fn(),
      },
    };

    return {
      service: new VkCallbackMessageCustomerSyncService(
        prismaMock as unknown as PrismaService,
      ),
      prismaMock,
    };
  };

  it('creates a new customer with explicit initial status and YYYY-MM-DD timestamps', async () => {
    const { service, prismaMock } = createService();

    prismaMock.crmCustomer.findFirst.mockResolvedValue(null);
    prismaMock.crmStatus.findUnique.mockResolvedValue({
      id: 366764,
      accountId: 19,
    });
    prismaMock.crmCustomer.create.mockResolvedValue({
      id: 501,
      accountId: 19,
      vkId: 77,
      fullName: '321',
      crmStatusId: 366764,
      firstContactDate: '2025-01-01',
      lastContactDate: '2025-01-01',
    });

    const result = await service.syncMessageNewCustomer({
      integration: {
        id: 11,
        accountId: 19,
        initialCrmStatusId: 366764,
      },
      callbackEventId: 51,
      crmVk: {
        id: 77,
        accountId: 19,
        externalId: '321',
        name: '321',
        messagesGroupId: '',
      },
      message: {
        id: 901,
        from_id: 321,
        date: 1735689600,
      },
    });

    expect(prismaMock.crmCustomer.create).toHaveBeenCalledWith({
      data: {
        accountId: 19,
        vkId: 77,
        fullName: '321',
        crmStatusId: 366764,
        firstContactDate: '2025-01-01',
        lastContactDate: '2025-01-01',
      },
    });
    expect(result.action).toBe('created');
  });

  it('updates only lastContactDate for existing customer', async () => {
    const { service, prismaMock } = createService();

    prismaMock.crmCustomer.findFirst.mockResolvedValue({
      id: 15,
      accountId: 7,
      vkId: 77,
      fullName: 'Реальное имя',
      firstContactDate: '2024-12-31',
      lastContactDate: '2024-12-31',
    });
    prismaMock.crmCustomer.update.mockResolvedValue({
      id: 15,
      accountId: 7,
      vkId: 77,
      fullName: 'Реальное имя',
      firstContactDate: '2024-12-31',
      lastContactDate: '2025-01-01',
    });

    const result = await service.syncMessageNewCustomer({
      integration: {
        id: 11,
        accountId: 7,
      },
      callbackEventId: 51,
      crmVk: {
        id: 77,
        accountId: 7,
        externalId: '321',
        name: '321',
        messagesGroupId: '',
      },
      message: {
        id: 901,
        from_id: 321,
        date: 1735689600,
      },
    });

    expect(prismaMock.crmCustomer.update).toHaveBeenCalledWith({
      where: { id: 15 },
      data: {
        lastContactDate: '2025-01-01',
      },
    });
    expect(result.action).toBe('updated');
  });

  it('creates and assigns tag from ref_source for new customer', async () => {
    const { service, prismaMock } = createService();

    prismaMock.crmCustomer.findFirst.mockResolvedValue(null);
    prismaMock.crmStatus.findUnique.mockResolvedValue({
      id: 366764,
      accountId: 19,
    });
    prismaMock.crmCustomer.create.mockResolvedValue({
      id: 501,
      accountId: 19,
      vkId: 77,
      fullName: '321',
      crmStatusId: 366764,
      firstContactDate: '2025-01-01',
      lastContactDate: '2025-01-01',
    });
    prismaMock.crmTag.findFirst.mockResolvedValue(null);
    prismaMock.crmTag.create.mockResolvedValue({
      id: 31,
      accountId: 19,
      name: 'ads_campaign',
      color: '',
      textColor: '',
      externalId: null,
    });

    await service.syncMessageNewCustomer({
      integration: {
        id: 11,
        accountId: 19,
        initialCrmStatusId: 366764,
      },
      callbackEventId: 51,
      crmVk: {
        id: 77,
        accountId: 19,
        externalId: '321',
        name: '321',
        messagesGroupId: '',
      },
      message: {
        id: 901,
        from_id: 321,
        date: 1735689600,
        ref_source: '  ads_campaign  ',
      },
    });

    expect(prismaMock.crmTag.create).toHaveBeenCalledWith({
      data: {
        accountId: 19,
        name: 'ads_campaign',
      },
    });
    expect(prismaMock.crmCustomerTag.upsert).toHaveBeenCalledWith({
      where: {
        customerId_tagId: {
          customerId: 501,
          tagId: 31,
        },
      },
      update: {
        accountId: 19,
      },
      create: {
        accountId: 19,
        customerId: 501,
        tagId: 31,
      },
    });
  });

  it('ignores ref_source for existing customer and does not duplicate customer', async () => {
    const { service, prismaMock } = createService();

    prismaMock.crmCustomer.findFirst.mockResolvedValue({
      id: 15,
      accountId: 7,
      vkId: 77,
      fullName: 'Реальное имя',
      firstContactDate: '2024-12-31',
      lastContactDate: '2025-01-01',
    });
    prismaMock.crmCustomer.update.mockResolvedValue({
      id: 15,
      accountId: 7,
      vkId: 77,
      fullName: 'Реальное имя',
      firstContactDate: '2024-12-31',
      lastContactDate: '2025-01-02',
    });

    const result = await service.syncMessageNewCustomer({
      integration: {
        id: 11,
        accountId: 7,
      },
      callbackEventId: 51,
      crmVk: {
        id: 77,
        accountId: 7,
        externalId: '321',
        name: '321',
        messagesGroupId: '',
      },
      message: {
        id: 901,
        from_id: 321,
        date: 1735776000,
        ref_source: 'ads_campaign',
      },
    });

    expect(prismaMock.crmCustomer.create).not.toHaveBeenCalled();
    expect(prismaMock.crmTag.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.crmTag.create).not.toHaveBeenCalled();
    expect(prismaMock.crmCustomerTag.upsert).not.toHaveBeenCalled();
    expect(result.action).toBe('updated');
  });

  it('ignores empty ref_source', async () => {
    const { service, prismaMock } = createService();

    prismaMock.crmCustomer.findFirst.mockResolvedValue(null);
    prismaMock.crmStatus.findUnique.mockResolvedValue({
      id: 366764,
      accountId: 19,
    });
    prismaMock.crmCustomer.create.mockResolvedValue({
      id: 501,
      accountId: 19,
      vkId: 77,
      fullName: '321',
      crmStatusId: 366764,
      firstContactDate: '2025-01-01',
      lastContactDate: '2025-01-01',
    });

    await service.syncMessageNewCustomer({
      integration: {
        id: 11,
        accountId: 19,
        initialCrmStatusId: 366764,
      },
      callbackEventId: 51,
      crmVk: {
        id: 77,
        accountId: 19,
        externalId: '321',
        name: '321',
        messagesGroupId: '',
      },
      message: {
        id: 901,
        from_id: 321,
        date: 1735689600,
        ref_source: '   ',
      },
    });

    expect(prismaMock.crmTag.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.crmTag.create).not.toHaveBeenCalled();
    expect(prismaMock.crmCustomerTag.upsert).not.toHaveBeenCalled();
  });

  it('does not fail and creates a customer without contact dates when message.date is invalid', async () => {
    const { service, prismaMock } = createService();

    prismaMock.crmCustomer.findFirst.mockResolvedValue(null);
    prismaMock.crmStatus.findUnique.mockResolvedValue({
      id: 366764,
      accountId: 19,
    });
    prismaMock.crmCustomer.create.mockResolvedValue({
      id: 501,
      accountId: 19,
      vkId: 77,
      fullName: '321',
      crmStatusId: 366764,
      firstContactDate: '',
      lastContactDate: '',
    });

    const result = await service.syncMessageNewCustomer({
      integration: {
        id: 11,
        accountId: 19,
        initialCrmStatusId: 366764,
      },
      callbackEventId: 51,
      crmVk: {
        id: 77,
        accountId: 19,
        externalId: '321',
        name: '321',
        messagesGroupId: '',
      },
      message: {
        id: 901,
        from_id: 321,
      },
    });

    expect(prismaMock.crmCustomer.create).toHaveBeenCalledWith({
      data: {
        accountId: 19,
        vkId: 77,
        fullName: '321',
        crmStatusId: 366764,
      },
    });
    expect(result.action).toBe('created');
  });
});
