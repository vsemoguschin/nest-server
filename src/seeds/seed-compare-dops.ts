import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DopsService } from '../domains/dops/dops.service';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    // Параметры из терминала
    const userId = 21;
    const from = '2025-10-01';
    const to = '2025-10-31';
    const period = '2025-10';

    // Получаем пользователя из базы
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        workSpace: true,
        group: true,
        boards: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error(`Пользователь с id ${userId} не найден`);
    }

    console.log('=== Параметры ===');
    console.log('User:', user.fullName, `(${user.role.shortName})`);
    console.log('Period:', period);
    console.log('From:', from);
    console.log('To:', to);
    console.log('');

    // Преобразуем в UserDto формат
    const userDto = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      roleId: user.roleId,
      role: user.role,
      workSpaceId: user.workSpaceId,
      workSpace: user.workSpace,
      groupId: user.groupId,
      group: {
        id: user.group.id,
        title: user.group.title,
      },
      boards: user.boards.map((board) => ({ id: board.id })),
    };

    // Получаем сервисы
    const dopsService = app.get(DopsService);

    console.log('=== Сбор данных из dops.getList ===');
    // Собираем допы из dops.getList
    // Получаем все страницы
    let allDopsFromList: number[] = [];
    let currentPage = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await dopsService.getList(
        userDto,
        from,
        to,
        1000, // большой take для получения всех
        currentPage,
        undefined,
        undefined,
      );

      const ids = result.items.map((item) => item.id);
      allDopsFromList = [...allDopsFromList, ...ids];

      if (result.items.length < 1000) {
        hasMore = false;
      } else {
        currentPage++;
      }
    }

    console.log(`Найдено допов в dops.getList: ${allDopsFromList.length}`);
    console.log('');

    console.log('=== Сбор данных из commercialDatas.getManagersDatas ===');
    // Собираем допы из commercialDatas.getManagersDatas
    // Получаем всех менеджеров с допами используя те же фильтры что и в getManagersDatas
    const workspacesSearch =
      user.role.department === 'administration' || user.role.shortName === 'KD'
        ? { gt: 0 }
        : user.workSpaceId;

    const groupsSearch = ['MOP', 'MOV'].includes(user.role.shortName)
      ? user.groupId
      : { gt: 0 };

    const managersWhere: Prisma.UserWhereInput = {
      role: {
        shortName: {
          in:
            user.role.shortName === 'MOP'
              ? ['MOP']
              : user.role.shortName === 'ROP'
                ? ['MOP', 'ROP']
                : ['DO', 'MOP', 'ROP', 'MOV'],
        },
      },
      workSpaceId: workspacesSearch,
      groupId: groupsSearch,
    };

    const managersWithDops = await prisma.user.findMany({
      where: managersWhere,
      include: {
        dops: {
          where: {
            saleDate: {
              startsWith: period,
            },
            deal: {
              reservation: false,
              deletedAt: null,
              status: { not: 'Возврат' },
            },
          },
          select: {
            id: true,
          },
        },
      },
    });

    // Собираем все id допов из managers
    const allDopsFromManagers: number[] = [];
    for (const manager of managersWithDops) {
      const managerDopIds = manager.dops.map((dop) => dop.id);
      allDopsFromManagers.push(...managerDopIds);
    }

    console.log(
      `Найдено допов в commercialDatas.getManagersDatas: ${allDopsFromManagers.length}`,
    );
    console.log('');

    // Убираем дубликаты
    const uniqueDopsFromList = [...new Set(allDopsFromList)];
    const uniqueDopsFromManagers = [...new Set(allDopsFromManagers)];

    console.log('=== Сравнение результатов ===');
    console.log(
      `Уникальных допов из dops.getList: ${uniqueDopsFromList.length}`,
    );
    console.log(
      `Уникальных допов из commercialDatas.getManagersDatas: ${uniqueDopsFromManagers.length}`,
    );
    console.log('');

    // Находим допы, которые есть в getList, но нет в getManagersDatas
    const onlyInList = uniqueDopsFromList.filter(
      (id) => !uniqueDopsFromManagers.includes(id),
    );

    // Находим допы, которые есть в getManagersDatas, но нет в getList
    const onlyInManagers = uniqueDopsFromManagers.filter(
      (id) => !uniqueDopsFromList.includes(id),
    );

    console.log('=== Различия ===');
    console.log(
      `Допы только в dops.getList (${onlyInList.length}):`,
      onlyInList.sort((a, b) => a - b),
    );
    console.log('');
    console.log(
      `Допы только в commercialDatas.getManagersDatas (${onlyInManagers.length}):`,
      onlyInManagers.sort((a, b) => a - b),
    );
    console.log('');

    // Общие допы
    const common = uniqueDopsFromList.filter((id) =>
      uniqueDopsFromManagers.includes(id),
    );
    console.log(`Общих допов: ${common.length}`);

    // Детальная информация о различиях
    if (onlyInList.length > 0) {
      console.log('\n=== Детали допов только в dops.getList ===');
      const details = await prisma.dop.findMany({
        where: {
          id: { in: onlyInList },
        },
        include: {
          deal: {
            select: {
              title: true,
              reservation: true,
              deletedAt: true,
              status: true,
            },
          },
          user: {
            select: {
              fullName: true,
            },
          },
        },
      });
let total = 0;
      for (const dop of details) {
        total += dop.price;
        console.log(
          `${dop.price} ID: ${dop.id}, Deal: ${dop.deal?.title || 'N/A'}, User: ${dop.user?.fullName || 'N/A'}, Reservation: ${dop.deal?.reservation}, Deleted: ${dop.deal?.deletedAt ? 'Yes' : 'No'}, Status: ${dop.deal?.status || 'N/A'}`,
        );
      }
      console.log(`Total: ${total}`);
    }

    if (onlyInManagers.length > 0) {
      console.log(
        '\n=== Детали допов только в commercialDatas.getManagersDatas ===',
      );
      const details = await prisma.dop.findMany({
        where: {
          id: { in: onlyInManagers },
        },
        include: {
          deal: {
            select: {
              title: true,
              reservation: true,
              deletedAt: true,
              status: true,
            },
          },
          user: {
            select: {
              fullName: true,
            },
          },
        },
      });

      for (const dop of details) {
        console.log(
          `ID: ${dop.id}, Deal: ${dop.deal?.title || 'N/A'}, User: ${dop.user?.fullName || 'N/A'}, Reservation: ${dop.deal?.reservation}, Deleted: ${dop.deal?.deletedAt ? 'Yes' : 'No'}, Status: ${dop.deal?.status || 'N/A'}`,
        );
      }
    }
  } catch (error) {
    console.error('Ошибка при выполнении скрипта:', error);
    throw error;
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
