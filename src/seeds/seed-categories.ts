// prisma/seed/seed-income-categories.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findOrCreateCategory(
  title: string,
  type: string,
  parentId?: number,
) {
  const category = await prisma.transactionCategories.findFirst({
    where: { title, type },
  });

  if (category) {
    return category;
  }

  return prisma.transactionCategories.create({
    data: {
      title,
      type,
      parentId,
    },
  });
}

async function main() {
  const incomeStructure = [
    {
      type: 'Доходы',
      categories: [
        'Продажа переводом на РС',
        'Продажа через СБП',
        'Продажа через "Долями"',
        'Продажа через Онлайн-кассу',
        {
          title: 'Продажа через Рассрочку',
          children: ['Перевод от клиента на карту'],
        },
        'Выручка с продаж на WB',
        'Выручка с продаж на Озон',
        'Наличка',
        'Наложка от СДЭКА',
        'Продажа товаров',
        {
          title: 'Прочие доходы',
          children: ['Проценты по вкладам', 'Возврат нам'],
        },
      ],
    },
    {
      type: 'Расходы',
      categories: [
        'Агентские вознаграждения',
        {
          title: 'Покупка товаров',
          children: [
            'Неон',
            'Поликарбонат',
            'Акрил',
            'Пленки',
            'Блоки питания',
            'Упаковка',
            'Комплектующие для упаковки',
            'Комплектующие для мастеров',
            'Комплектующие для станков',
            'Другие расходы производства',
          ],
        },
        {
          title: 'Доставка',
          children: [
            {
              title: 'Оплата доставки до клиентов',
              children: [
                'СДЭК',
                'Балтийский курьер',
                'Почта',
                'Курьерская доставка',
                'Другие транспортные расходы',
              ],
            },
            'Оплата доставок на производство',
            'Погрузочные работы',
          ],
        },
        'Аренда',
        'Содержание офиса',
        {
          title: 'Рекламные сервисы',
          children: [
            'ВК',
            'Авито',
            'Яндекс Директ',
            'Другие рекламные сервисы',
          ],
        },
        'Найм',
        'Корпоративы',
        'Оплата сервисов',
        {
          title: 'Прочие расходы',
          children: ['Возвраты', 'Банковское обслуживание. Комиссии банка'],
        },
        'Налоги и взносы',
        'Амортизация',
        {
          title: 'Отдел производства',
          children: [
            'Руководители производства',
            'Накатка и печать пленки',
            'Мастера по сборке',
            'Упаковщики',
            'Фрезеровщики',
            'Монтажники',
          ],
        },
        {
          title: 'Расходы на развитие',
          children: [
            'Расходы на разработку CRM',
            'Консультационные услуги',
            'Обучение',
            'Другие расходы на развитие',
          ],
        },
        {
          title: 'Проценты по кредитам и займам',
          children: [
            'Комиссия Кредит Наличными',
            'Комиссия Кредит 8 августа 2024 г',
            'Комиссия за пользование овердрафтом',
          ],
        },
        'Налог на прибыль(доходы)',
        'Бухгалтерия',
        {
          title: 'Коммерческий отдел',
          children: [
            {
              title: 'Отдел дизайна',
              children: [
                'Руководитель отдела дизайна',
                'Дизайнеры',
                'Каллиграфы',
              ],
            },
            {
              title: 'Отдел продаж',
              children: [
                'РОПы',
                {
                  title: 'Менеджеры по продажам',
                  children: [
                    'Менеджер Авито ведение',
                    'Менеджер Авито оформление',
                    'Менеджер ВК ведения',
                    'Менеджер ВК оформления',
                  ],
                },
                'Коммерческий директор',
              ],
            },
            {
              title: 'Отдел маркетинга',
              children: ['Таргетолог', 'Авитолог', 'SMM'],
            },
            'Менеджер маркетплейсов',
            'Программисты',
            'Выгрузка макетов',
            'Логист',
          ],
        },
        'Рекламные подрядчики',
        'Ассистент руководителя',
      ],
    },
    {
      type: 'Активы',
      categories: [
        {
          title: 'Оборотные активы',
          children: [
            {
              title: 'Дебиторская задолженность',
              children: ['Денежная', 'Неденежная'],
            },
            'Денежные средства',
            'Запасы',
            {
              title: 'Другие оборотные',
              children: [
                'Овернайт',
                'Нам должны вернуть',
                'Залоговые платежи',
                'Выданные займы (до 1 года)',
              ],
            },
          ],
        },
        {
          title: 'Внеоборотные активы',
          children: [
            {
              title: 'Основные средства',
              children: ['Оборудование', 'Транспорт'],
            },
            {
              title: 'Другие внеоборотные',
              children: [
                'Выданные займы (от 1 года)',
                'Финансовые вложения',
                'Нематериальные активы',
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'Обязательства',
      categories: [
        {
          title: 'Краткосрочные обязательства',
          children: [
            {
              title: 'Кредиторская задолженность',
              children: ['Денежная', 'Неденежная'],
            },
            'Другие краткосрочные',
          ],
        },
        {
          title: 'Мы должны вернуть',
          children: [
            'Овердрафт',
            'Платежи третьим лицам',
            {
              title: 'Полученные займы (до 1 года)',
              children: ['Займ от Дарьи', 'Займ от Марка'],
            },
          ],
        },
        {
          title: 'Долгосрочные обязательства',
          children: [
            {
              title: 'Кредиты',
              children: [
                'Кредит Тинькофф от 8 августа 2024',
                'Кредит Наличными',
                'Кредит Тинькофф от 5 августа',
                'Кредит Тинькофф от 14 августа',
              ],
            },
            {
              title: 'Другие долгосрочные',
              children: ['Полученные займы (от 1 года)'],
            },
          ],
        },
      ],
    },
    {
      type: 'Капитал',
      categories: [
        {
          title: 'Вложения учредителей',
          children: ['Взнос денежных средства'],
        },
        'Нераспределенная прибыль',
        {
          title: 'Дивиденды',
          children: ['Вывод собственных средств'],
        },
        {
          title: 'Другие статьи капитала',
          children: ['Корректировка'],
        },
      ],
    },
  ];

  async function createCategories(str: any, parentId?: number) {
    const categories = str.categories;
    for (const category of categories) {
      if (typeof category === 'string') {
        //   console.log(category);
        await findOrCreateCategory(category, str.type, parentId);
      } else {
        const parentCategory = await findOrCreateCategory(
          category.title,
          str.type,
          parentId,
        );
        if (category.children) {
        //   console.log(category);

          await createCategories(
            { type: parentCategory.type, categories: category.children },
            parentCategory.id,
          );
        }
      }
    }
  }

  for (let i = 0; i < incomeStructure.length; i++) {
    await createCategories(incomeStructure[i]);
  }

  console.log('Seed script completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
