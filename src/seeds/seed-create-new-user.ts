import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
const prismaService = new PrismaService();
const prisma = new PrismaClient();
import { TelegramService } from '../services/telegram.service';
const telegramService = new TelegramService(prismaService);

const NEW_USER = {
  email: 'arinamyasnikova1987@gmail.com',
  password: '192837465',
  fullName: 'Юлия Мясникова',
  roleId: 2,
  workSpaceId: 1,
  groupId: 1,
};

async function createNewUser() {
  try {
    const reports = await prisma.packerReport.findMany({
      where: {
        userId: 46,
        date: {
          gte: '2025-11-11',
        },
        name: {
          contains: 'https://easy-crm.pro/boards/11',
        },
      },
      include: {
        user: true,
      },
    });
    const reports10 = await prisma.packerReport.findMany({
      where: {
        userId: 46,
        NOT: [
          {
            name: {
              contains: 'https://easy-crm.pro/boards/11',
            },
          },
          {
            name: {
              contains: 'https://easy-crm.pro/boards/5',
            },
          },
        ],
        name: {
          contains: 'https://easy-crm.pro/boards',
        },
      },
      include: {
        user: true,
      },
    });
    console.log(reports10.map((r) => r.name + ' за ' + r.date.split('-').reverse().join('.')).join('\n'));
    const text1 = reports
      .map((r) => `${r.name}, дата: ${r.date}`)
      .slice(0, 50)
      .join('\n');
    const text2 = reports
      .map((r) => `${r.name}, дата: ${r.date}`)
      .slice(51)
      .join('\n');
    console.log(reports.reduce((a, b) => a + b.cost, 0));

    // const adminIds = ['317401874'];
    // for (const id of adminIds) {
    //   try {
    //     await telegramService.sendToChat(id, text1);
    //     await telegramService.sendToChat(id, text2);
    //   } catch (e: unknown) {
    //     console.error(
    //       `Failed to notify ${id}: ${e instanceof Error ? e.message : e}`,
    //     );
    //   }
    // }

    return;
    // Проверяем, существует ли пользователь с таким email
    const userExists = await prisma.user.findUnique({
      where: { email: NEW_USER.email },
    });

    if (userExists) {
      console.log(`Пользователь с email ${NEW_USER.email} уже существует.`);
      return;
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(NEW_USER.password, 3);

    // Создаем пользователя
    const user = await prisma.user.create({
      data: {
        email: NEW_USER.email,
        password: hashedPassword,
        fullName: NEW_USER.fullName,
        roleId: NEW_USER.roleId,
        workSpaceId: NEW_USER.workSpaceId,
        groupId: NEW_USER.groupId,
        deletedAt: null,
      },
    });

    console.log('Пользователь успешно создан:', {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roleId: user.roleId,
      workSpaceId: user.workSpaceId,
      groupId: user.groupId,
    });
  } catch (error) {
    console.error('Ошибка при создании пользователя:', error);
    throw error;
  }
}

async function main() {
  try {
    await createNewUser();
    console.log('Сид для создания пользователя успешно выполнен.');
  } catch (error) {
    console.error('Ошибка при выполнении сида:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
