import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tag = await prisma.crmStatus.findMany({
    where: {
      name: {
        in: [
          'Макет нарисован',//9
          'ХОЧЕТ КУПИТЬ', //51422
          'Бизнес макет',//1185
          'Личный контакт',//328
          'Ожидаем предоплату',//5879
          'Бронь цены',//1919
          'Предоплата получена',//419
          'Заказ оплачен полностью',//4355
          'Заказ отправлен',//1721
          'Не оплачивает',//4443
          'Ждем отзыв',//4135
          'Постоянник',//26
          'Постоянник (начало)',//5761
          'Постоянник (макет)',//1960
          'Постоянник (хочет)',//27452
          'Проблемный клиент',//200
          'Заказ доставлен',
        ],
      },
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
