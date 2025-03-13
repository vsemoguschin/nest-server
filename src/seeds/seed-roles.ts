import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLES = {
  ADMIN: {
    fullName: 'Admin',
    department: 'administration',
  },
  G: {
    fullName: 'Владелец системы',
    department: 'administration',
  },
  KD: {
    fullName: 'Коммерческий директор',
    department: 'COMMERCIAL',
  },
  DO: {
    fullName: 'Директор отдела продаж',
    department: 'COMMERCIAL',
  },
  ROP: {
    fullName: 'Руководитель отдела продаж',
    department: 'COMMERCIAL',
  },
  MOP: {
    fullName: 'Менеджер отдела продаж',
    department: 'COMMERCIAL',
  },
  ROV: {
    fullName: 'Руководитель отдела ведения',
    department: 'COMMERCIAL',
  },
  MOV: {
    fullName: 'Менеджер отдела ведения',
    department: 'COMMERCIAL',
  },
  ROD: {
    fullName: 'Руководитель отдела дизайна',
    department: 'DESIGN',
  },
  DIZ: {
    fullName: 'Дизайнер',
    department: 'DESIGN',
  },
  DP: {
    fullName: 'Директор производства',
    department: 'PRODUCTION',
  },
  RP: {
    fullName: 'Руководитель производства',
    department: 'PRODUCTION',
  },
  LOGIST: {
    fullName: 'Логист',
    department: 'PRODUCTION',
  },
  FRZ: {
    fullName: 'Фрезеровщик',
    department: 'PRODUCTION',
  },
  LAM: {
    fullName: 'Монтажник пленки',
    department: 'PRODUCTION',
  },
  MASTER: {
    fullName: 'Сборщик',
    department: 'PRODUCTION',
  },
  PACKER: {
    fullName: 'Упаковщик',
    department: 'PRODUCTION',
  },
  MTZ: {
    fullName: 'Менеджер ТЗ',
    department: 'PRODUCTION',
  },
  MARKETER: {
    fullName: 'Маркетолог',
    department: 'MARKETER',
  },
};

async function seedRoles() {
  for (const shortName in ROLES) {
    const { fullName, department } = ROLES[shortName];

    // Проверяем, существует ли уже роль с таким shortName
    const roleExists = await prisma.role.findUnique({
      where: { shortName },
    });

    if (!roleExists) {
      console.log(`Создаем роль ${shortName}...`);
      await prisma.role.create({
        data: {
          shortName,
          fullName,
          department,
          deletedAt: null,
        },
      });
    } else {
      console.log(`Роль ${shortName} уже существует.`);
    }
  }
}

async function main() {
  try {
    await seedRoles();
    console.log('Сиды для ролей успешно выполнены.');
  } catch (error) {
    console.error('Ошибка при создании ролей:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
