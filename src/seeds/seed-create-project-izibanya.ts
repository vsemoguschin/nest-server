// Запуск: cd crm/nest && npx ts-node src/seeds/seed-create-project-izibanya.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROJECT_NAME = 'ИЗИБАНЯ';

async function createProjectIzibanya() {
  const existing = await prisma.project.findFirst({
    where: { name: PROJECT_NAME },
    select: { id: true, name: true },
  });

  if (existing) {
    console.log(
      `[Project Seed] Проект уже существует: id=${existing.id}, name="${existing.name}"`,
    );
    return existing;
  }

  const created = await prisma.project.create({
    data: {
      name: PROJECT_NAME,
      isActive: true,
    },
    select: { id: true, name: true, isActive: true },
  });

  console.log(
    `[Project Seed] Проект создан: id=${created.id}, name="${created.name}", isActive=${created.isActive}`,
  );
  return created;
}

async function main() {
  try {
    await createProjectIzibanya();
    console.log('✓ Скрипт завершен без ошибок');
  } catch (error) {
    console.error('✗ Ошибка при выполнении скрипта:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
