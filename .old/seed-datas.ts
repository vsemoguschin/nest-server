import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Group } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // 1. Создание рабочего пространства "Admin"
    const adminWorkspace = await prisma.workSpace.upsert({
      where: { title: 'Admin' },
      update: {},
      create: {
        title: 'Admin',
        department: 'COMMERCIAL',
      },
    });

    // 2. Создание группы для "Admin" рабочего пространства
    const adminGroup = await prisma.group.upsert({
      where: { title: 'Admin G' },
      update: {},
      create: {
        title: 'Admin G',
        workSpaceId: adminWorkspace.id,
      },
    });

    // 3. Создание администраторских пользователей
    const adminPassword = await bcrypt.hash(
      process.env.ADMIN_PASSWORD || 'root',
      3,
    );
    await prisma.user.upsert({
      where: { email: process.env.ADMIN_EMAIL || 'ex@ru' },
      update: {},
      create: {
        email: process.env.ADMIN_EMAIL || 'ex@ru',
        fullName: process.env.ADMIN_NAME || 'Admin User',
        
        password: adminPassword,
        roleId: 1,
        workSpaceId: adminWorkspace.id,
        groupId: adminGroup.id,
      },
    });

    await prisma.user.upsert({
      where: { email: 'GGG' },
      update: {},
      create: {
        email: 'GGG',
        fullName: 'Максим Мазунин',
        
        password: await bcrypt.hash('Maxkud59', 3),
        roleId: 2,
        workSpaceId: adminWorkspace.id,
        groupId: adminGroup.id,
      },
    });

    await prisma.user.upsert({
      where: { email: 'qwertymark337@gmail.com' },
      update: {},
      create: {
        email: 'qwertymark337@gmail.com',
        fullName: 'Марк Вансовский',
        
        password: await bcrypt.hash('easyneondir', 3),
        roleId: 3,
        workSpaceId: adminWorkspace.id,
        groupId: adminGroup.id,
      },
    });

    // 4. Создание рабочего пространства "B2B" и групп для него
    const b2bWorkspace = await prisma.workSpace.upsert({
      where: { title: 'B2B' },
      update: {},
      create: {
        title: 'B2B',
        department: 'COMMERCIAL',
      },
    });

    const b2bGroupTitles = ['Авито Питер', 'Опт отдел', 'Москва Неон'];
    const b2bGroups = await Promise.all(
      b2bGroupTitles.map(async (title) => {
        return await prisma.group.upsert({
          where: { title },
          update: {},
          create: {
            title,
            workSpaceId: b2bWorkspace.id,
          },
        });
      }),
    );

    // Создаем пользователя для первой группы в B2B
    await prisma.user.upsert({
      where: { email: 'jayz' },
      update: {},
      create: {
        email: 'jayz',
        fullName: 'Сергей Иванов',
        
        password: await bcrypt.hash('beyonce', 3),
        roleId: 4,
        tg: '@floype',
        workSpaceId: b2bWorkspace.id,
        groupId: b2bGroups[0].id,
      },
    });

    // 5. Создание рабочего пространства "ВК" и группы для него
    const vkWorkspace = await prisma.workSpace.upsert({
      where: { title: 'ВК' },
      update: {},
      create: {
        title: 'ВК',
        department: 'COMMERCIAL',
      },
    });

    const vkGroup = await prisma.group.upsert({
      where: { title: 'РОП 1' },
      update: {},
      create: {
        title: 'РОП 1',
        workSpaceId: vkWorkspace.id,
      },
    });

    await prisma.user.upsert({
      where: { email: 'easKD' },
      update: {},
      create: {
        email: 'easKD',
        fullName: 'Юлия Куштанова',
        
        password: await bcrypt.hash('nablatnom', 3),
        roleId: 4,
        tg: '@JuliaKush',
        workSpaceId: vkWorkspace.id,
        groupId: vkGroup.id,
      },
    });

    // Дополнительные пользователи для ВК
    const vkUsers = [
      {
        tg: '@budanovsmr',
        fullName: 'Буданов Глеб',
        email: 'budanovsmr',
        password: 'budanovsmr3',
      },
      {
        tg: '@schlampik',
        fullName: 'Акубекова Татьяна',
        email: 'schlampik',
        password: 'schlampik1',
      },
      {
        tg: '@AlinaMuiii',
        fullName: 'Малышева Алина',
        email: 'AlinaMuiii',
        password: 'AlinaMuiii6',
      },
      {
        tg: '@swipeforcheese',
        fullName: 'Якушева Устинья',
        email: 'swipeforcheese',
        password: 'swipeforcheese2',
      },
      {
        tg: '@wwwsamuraycom',
        fullName: 'Свечников Дмитрий',
        email: 'wwwsamuraycom',
        password: 'wwwsamuraycom55',
      },
      {
        tg: '@drunklordd',
        fullName: 'Павлов Владислав',
        email: 'drunklordd',
        password: 'drunklordd1231',
      },
      {
        tg: '@marina_scher9',
        fullName: 'Щербакова Марина',
        email: 'marina_scher9',
        password: 'marina_scher94345',
      },
      {
        tg: '@m_marinella',
        fullName: 'Матвеева Марина',
        email: 'm_marinella',
        password: 'm_marinella6548',
      },
      {
        tg: '@Tolmacheva_Ek',
        fullName: 'Толмачева Екатерина',
        email: 'Tolmacheva_Ek',
        password: 'Tolmacheva_Ek2353',
      },
      {
        tg: '@vs_exe',
        fullName: 'Добротин Владимир',
        email: 'vs_exe',
        password: 'vs_exe5472245',
      },
      {
        tg: '@vlaaa_dushka',
        fullName: 'Фарисей Влада',
        email: 'vlaaa_dushka',
        password: 'vlaaa_dushka675245',
      },
      {
        tg: '@itkatrinn',
        fullName: 'Горячева Катерина',
        email: 'itkatrinn',
        password: 'itkatrinn13',
      },
      {
        tg: '@Nervin177',
        fullName: 'Нуретдинов Айдар',
        email: 'Nervin177',
        password: 'Nervin17712436',
      },
      {
        tg: '@elkhid',
        fullName: 'Камбиева Елена',
        email: 'elkhid',
        password: 'elkhid123126',
      },
      {
        tg: '@sdzxydt',
        fullName: 'Гуляева Валентина',
        email: 'sdzxydt',
        password: 'sdzxydt1235',
      },
      {
        tg: '@everybody_free',
        fullName: 'Шугулева Лидия',
        email: 'everybody_free',
        password: 'everybody_free231',
      },
    ];

    for (const user of vkUsers) {
      await prisma.user.create({
        data: {
          ...user,
          roleId: 6,
          workSpaceId: vkWorkspace.id,
          groupId: vkGroup.id,
          password: await bcrypt.hash(user.password, 3),
        },
      });
    }

    // 6. Создание рабочего пространства "Производство"
    const prodWorkspace = await prisma.workSpace.upsert({
      where: { title: 'Производство' },
      update: {},
      create: {
        title: 'Производство',
        department: 'PRODUCTION',
      },
    });

    const prodGroupTitles = [
      'Руководители',
      'Фрезеровка/Пленка',
      'Сборщики',
      'Упаковщики',
    ];
    const prodGroups: Group[] = [];
    for (const title of prodGroupTitles) {
      const group = await prisma.group.upsert({
        where: { title },
        update: {},
        create: {
          title,
          workSpaceId: prodWorkspace.id,
        },
      });
      prodGroups.push(group);
    }

    const prodUsersData = [
      // Группа "Руководители"
      [
        {
          email: 'grishchenko_k',
          fullName: 'Константин Грищенко',
          
          password: 'worship',
          roleId: 11,
          tg: '@grishchenko_k',
        },
        {
          email: 'motyagrazy',
          fullName: 'Матвей Савинов',
          
          password: 'yager',
          roleId: 12,
          tg: '@motyagrazy',
        },
        {
          email: 'AlexJul17',
          fullName: 'Юля Пихтова',
          
          password: 'shreder',
          roleId: 13,
          tg: '@AlexJul17',
        },
      ],
      // Группа "Фрезеровка/Пленка"
      [
        {
          email: 'Serg_v_k',
          fullName: 'Сергей Кутузов',
          
          password: 'freza',
          roleId: 14,
          tg: '@Serg_v_k',
        },
        {
          email: 'edgar8ml',
          fullName: 'Эдгар Маргарян',
          
          password: 'plenka',
          roleId: 15,
          tg: '@edgar8ml',
        },
      ],
      // Группа "Сборщики"
      [
        {
          email: 'Abakarov_Maks',
          fullName: 'Максим Абакаров',
          
          password: 'maksmaster',
          roleId: 16,
          tg: '@Abakarov_Maks',
        },
      ],
      // Группа "Упаковщики"
      [
        {
          email: '@Kirieshkasad',
          fullName: 'Юлия Лыкова',
          
          password: 'packer',
          roleId: 17,
          tg: '@Kirieshkasad',
        },
      ],
    ];

    for (let i = 0; i < prodGroups.length; i++) {
      const group = prodGroups[i];
      for (const userData of prodUsersData[i]) {
        await prisma.user.upsert({
          where: { email: userData.email },
          update: {},
          create: {
            ...userData,
            password: await bcrypt.hash(userData.password, 3),
            workSpaceId: prodWorkspace.id,
            groupId: group.id,
          },
        });
      }
    }

    // 7. Создание рабочего пространства "Ведение"
    const ltvWorkspace = await prisma.workSpace.upsert({
      where: { title: 'Ведение' },
      update: {},
      create: {
        title: 'Ведение',
        department: 'COMMERCIAL',
      },
    });

    const ltvGroup = await prisma.group.upsert({
      where: { title: 'Ведение' },
      update: {},
      create: {
        title: 'Ведение',
        workSpaceId: ltvWorkspace.id,
      },
    });

    const ltvUsers = [
      {
        email: 'Михаил',
        fullName: 'Михаил',
        
        password: 'ltv',
        roleId: 7,
        tg: '@Михаил',
      },
      {
        email: 'tzshnik',
        fullName: 'Заполнитель тз',
        
        password: 'mtz',
        roleId: 18,
        tg: '@tzshnik',
      },
      {
        email: 'mov',
        fullName: 'Менеджер ведения',
        
        password: 'mov',
        roleId: 8,
        tg: '@mov',
      },
    ];

    for (const user of ltvUsers) {
      await prisma.user.upsert({
        where: { email: user.email },
        update: {},
        create: {
          ...user,
          password: await bcrypt.hash(user.password, 3),
          workSpaceId: ltvWorkspace.id,
          groupId: ltvGroup.id,
        },
      });
    }

    console.log('Seed data successfully created.');
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
