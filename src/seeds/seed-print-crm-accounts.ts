import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const primaryAccount = await prisma.crmAccount.findUnique({
      where: { id: 1 },
    });

    if (!primaryAccount) {
      throw new Error('CrmAccount с id=1 не найден');
    }

    await prisma.crmAccount.update({
      where: { id: 1 },
      data: {
        code: 'easybook',
        name: 'ИзиБук',
        isActive: true,
      },
    });

    const easyneonAccount = await prisma.crmAccount.upsert({
      where: { code: 'easyneon' },
      update: {
        name: 'ИзиНеон',
        isActive: true,
      },
      create: {
        code: 'easyneon',
        name: 'ИзиНеон',
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    await prisma.$transaction([
      prisma.crmCountry.updateMany({
        where: {
          accountId: null,
        },
        data: {
          accountId: easyneonAccount.id,
        },
      }),
      prisma.crmCity.updateMany({
        where: {
          accountId: null,
        },
        data: {
          accountId: easyneonAccount.id,
        },
      }),
      prisma.crmStatus.updateMany({
        where: {
          accountId: null,
        },
        data: {
          accountId: easyneonAccount.id,
        },
      }),
      prisma.crmSource.updateMany({
        where: {
          accountId: null,
        },
        data: {
          accountId: easyneonAccount.id,
        },
      }),
      prisma.crmSalesChannel.updateMany({
        where: {
          accountId: null,
        },
        data: {
          accountId: easyneonAccount.id,
        },
      }),
      prisma.crmManager.updateMany({
        where: {
          accountId: null,
        },
        data: {
          accountId: easyneonAccount.id,
        },
      }),
      prisma.crmVk.updateMany({
        where: {
          accountId: null,
        },
        data: {
          accountId: easyneonAccount.id,
        },
      }),
      prisma.crmAvito.updateMany({
        where: {
          accountId: null,
        },
        data: {
          accountId: easyneonAccount.id,
        },
      }),
      prisma.crmTag.updateMany({
        where: {
          accountId: null,
        },
        data: {
          accountId: easyneonAccount.id,
        },
      }),
      prisma.crmCustomer.updateMany({
        where: {
          accountId: null,
        },
        data: {
          accountId: easyneonAccount.id,
        },
      }),
      prisma.crmCustomerTag.updateMany({
        where: {
          accountId: null,
        },
        data: {
          accountId: easyneonAccount.id,
        },
      }),
      prisma.crmSyncState.updateMany({
        where: {
          accountId: null,
        },
        data: {
          accountId: easyneonAccount.id,
        },
      }),
    ]);

    const [accounts, customerCounts] = await Promise.all([
      prisma.crmAccount.findMany({
        orderBy: [{ id: 'asc' }],
      }),
      prisma.crmCustomer.groupBy({
        by: ['accountId'],
        _count: {
          _all: true,
        },
      }),
    ]);

    if (!accounts.length) {
      console.log('CrmAccount не найдены');
      return;
    }

    const customerCountByAccountId = new Map<number, number>();
    let customersWithoutAccountCount = 0;

    for (const item of customerCounts) {
      const count = item._count._all;

      if (item.accountId === null) {
        customersWithoutAccountCount += count;
        continue;
      }

      customerCountByAccountId.set(item.accountId, count);
    }

    console.log('CrmAccount counts:');
    console.log(
      accounts.map((account) => ({
        id: account.id,
        code: account.code,
        name: account.name,
        customersCount: customerCountByAccountId.get(account.id) || 0,
      })),
    );

    console.log(`Клиентов без accountId: ${customersWithoutAccountCount}`);
  } catch (error) {
    console.error('Ошибка при чтении CrmAccount:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
