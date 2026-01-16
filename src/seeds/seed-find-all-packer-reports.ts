import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findAllPackerReports() {
  console.log('Поиск всех packerReport...');

  const reports = await prisma.packerReport.findMany({
    include: {
      
    }
  });

  console.log(`Найдено packerReport: ${reports.length}`);

  if (reports.length === 0) {
    return;
  }
}

async function main() {
  try {
    await findAllPackerReports();
    console.log('\n✓ Скрипт успешно выполнен');
  } catch (error) {
    console.error('✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
