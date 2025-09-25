import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Resetting CRM tables...');
  // Order matters due to FK constraints
  await prisma.crmCustomerTag.deleteMany({});
  await prisma.crmCustomer.deleteMany({});
  await prisma.crmTag.deleteMany({});
  await prisma.crmAvito.deleteMany({});
  await prisma.crmVk.deleteMany({});
  await prisma.crmManager.deleteMany({});
  await prisma.crmSalesChannel.deleteMany({});
  await prisma.crmSource.deleteMany({});
  await prisma.crmStatus.deleteMany({});
  await prisma.crmCity.deleteMany({});
  await prisma.crmCountry.deleteMany({});
  // Optionally reset sync state to force re-import
  await prisma.crmSyncState.deleteMany({ where: { key: 'dailyCustomers' } });
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error('CRM reset failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

