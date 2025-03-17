import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const adSourcesVK = [
  'ВК Таргет ИзиНеон 6181',
  'ВК Таргет ИЗИ ЛУНА 6181',
  'ВК посевы Старый кабинет',
  'ВК посевы Adblogger',
  'ВК таргет Старый кабинет',
];

const adSourcesAvito = [
  'Авито ИзиНеон',
  'Авито НРВ',
  'Авито Москоу Неон',
  'Авито Кристина Неон',
  'Яндекс Директ easyneon-adm',
  'Телеграмм посевы',
  'Инстаграм посевы',
  'Телеграм ADS',
];

const actDealSources = [
  'ВК',
  'ИзиНеон Авито',
  'WhatsApp',
  'НРВ Авито',
  'звонок',
  'Сайт',
  'Telegram',
  'new',
  'Инстаграм посевы',
];

async function main() {
  const vkW = await prisma.workSpace.findFirst({
    where: {
      title: 'ВК',
    },
  });
  const avW = await prisma.workSpace.findFirst({
    where: {
      title: 'B2B',
    },
  });

    for (const source of adSourcesVK) {
      await prisma.adSource.create({
        data: {
          workSpaceId: vkW!.id,
          title: source,
        },
      });
    }
    for (const source of adSourcesAvito) {
      await prisma.adSource.create({
        data: {
          workSpaceId: avW!.id,
          title: source,
        },
      });
    }

  const adSources = await prisma.adSource.findMany();

  const adExpenses = await prisma.adExpense.findMany({
    include: {
      dealSource: true,
    },
  });

  //   let count = 0;
  for (const exp of adExpenses) {
    if (adSources.find((el) => el.title === exp.dealSource?.title)) {
      await prisma.adExpense.update({
        where: {
          id: exp.id,
        },
        data: {
          adSourceId: adSources.find((el) => el.title === exp.dealSource?.title)
            ?.id,
        },
      });
      //   console.log('yeap', exp.dealSource?.title);
      //   count += 1;
    } else if (exp.dealSource?.title === 'НРВ Авито') {
      //   console.log('yeap', 'НРВ Авито');
      const ade = adSources.find((el) => el.title === 'Авито НРВ');
      await prisma.adExpense.update({
        where: {
          id: exp.id,
        },
        data: {
          adSourceId: ade?.id,
        },
      });
      //   count += 1;
    } else if (exp.dealSource?.title === 'ИзиНеон Авито') {
      const ade = adSources.find((el) => el.title === 'Авито ИзиНеон');
      await prisma.adExpense.update({
        where: {
          id: exp.id,
        },
        data: {
          adSourceId: ade?.id,
        },
      });
      //   console.log('yeap', 'ИзиНеон Авито');
      //   count += 1;
    } else {
      console.log('nope', exp.dealSource?.title);
    }
  }
  //   console.log(count, adExpenses.length);

  const ds = await prisma.dealSource.findMany();
  for (const d of ds) {
    if (!actDealSources.includes(d.title)) {
      console.log('delete', d.title);
      await prisma.dealSource.delete({
        where: {
          id: d.id,
        },
      });
    } else {
      console.log('ok', d.title);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 
