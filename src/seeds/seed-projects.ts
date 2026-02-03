import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_PROJECTS = [
  { code: 'general', name: 'Общая деятельность', isActive: true },
  { code: 'easyneon', name: 'EASYNEON', isActive: true },
  { code: 'easybook', name: 'EASYBOOK', isActive: true },
];

async function ensureProject(project: {
  code: string;
  name: string;
  isActive: boolean;
}) {
  const existing = await prisma.project.findUnique({
    where: { code: project.code },
  });

  if (!existing) {
    const created = await prisma.project.create({ data: project });
    console.log(`Проект "${project.name}" создан`);
    return created;
  }

  const needsUpdate =
    existing.name !== project.name || existing.isActive !== project.isActive;

  if (needsUpdate) {
    const updated = await prisma.project.update({
      where: { id: existing.id },
      data: {
        name: project.name,
        isActive: project.isActive,
      },
    });
    console.log(`Проект "${project.name}" обновлен`);
    return updated;
  }

  console.log(`Проект "${project.name}" уже существует`);
  return existing;
}

async function seedProjects() {
  const projects = await Promise.all(
    SYSTEM_PROJECTS.map((project) => ensureProject(project)),
  );

  const general = projects.find((p) => p.code === 'general');
  const easyneon = projects.find((p) => p.code === 'easyneon');
  const easybook = projects.find((p) => p.code === 'easybook');

  if (!general || !easyneon || !easybook) {
    throw new Error('Не удалось создать системные проекты');
  }

  // По умолчанию все позиции -> "Общая деятельность"
  const generalResult = await prisma.operationPosition.updateMany({
    data: { projectId: general.id },
  });
  console.log(
    `Обновлено позиций (общая деятельность): ${generalResult.count}`,
  );

  // accountId = 3 -> EASYBOOK
  const easybookResult = await prisma.operationPosition.updateMany({
    where: { originalOperation: { accountId: 3 } },
    data: { projectId: easybook.id },
  });
  console.log(`Обновлено позиций (EASYBOOK): ${easybookResult.count}`);

  // accountId = 1 -> EASYNEON
  const easyneonResult = await prisma.operationPosition.updateMany({
    where: { originalOperation: { accountId: 1 } },
    data: { projectId: easyneon.id },
  });
  console.log(`Обновлено позиций (EASYNEON): ${easyneonResult.count}`);
}

async function main() {
  try {
    await seedProjects();
    console.log('Сиды проектов успешно выполнены.');
  } catch (error) {
    console.error('Ошибка при создании проектов:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
