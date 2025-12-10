import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

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
