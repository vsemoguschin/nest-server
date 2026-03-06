import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const [
      customersWithoutAccount,
      customersByAccount,
      customersWithVk,
      customersWithBrokenVkLink,
      brokenVkSamples,
      crmVkWithoutExternalId,
    ] = await Promise.all([
      prisma.crmCustomer.count({
        where: {
          accountId: null,
        },
      }),
      prisma.crmCustomer.groupBy({
        by: ['accountId'],
        _count: {
          _all: true,
        },
        orderBy: {
          accountId: 'asc',
        },
      }),
      prisma.crmCustomer.count({
        where: {
          vkId: {
            not: null,
          },
        },
      }),
      prisma.crmCustomer.count({
        where: {
          vkId: {
            not: null,
          },
          OR: [
            { vk: { is: null } },
            { vk: { is: { externalId: '' } } },
          ],
        },
      }),
      prisma.crmCustomer.findMany({
        where: {
          vkId: {
            not: null,
          },
          OR: [
            { vk: { is: null } },
            { vk: { is: { externalId: '' } } },
          ],
        },
        select: {
          id: true,
          externalId: true,
          fullName: true,
          accountId: true,
          vkId: true,
          vk: {
            select: {
              id: true,
              externalId: true,
              name: true,
            },
          },
        },
        take: 10,
        orderBy: {
          id: 'asc',
        },
      }),
      prisma.crmVk.count({
        where: {
          externalId: '',
        },
      }),
    ]);

    console.log('CrmCustomer transition checks:');
    console.log({
      customersWithoutAccount,
      customersWithVk,
      customersWithBrokenVkLink,
      crmVkWithoutExternalId,
    });

    console.log('CrmCustomer counts by accountId:');
    console.log(
      customersByAccount.map((item) => ({
        accountId: item.accountId,
        customersCount: item._count._all,
      }))
    );

    console.log('Broken VK link samples:');
    console.log(brokenVkSamples);
  } catch (error) {
    console.error('Ошибка при проверке перехода на CrmCustomer:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
