import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  // await prisma.dealSource.update({
  //   where: {
  //     title: 'Telegram',
  //   },
  //   data: {
  //     title: 'Телеграм 0501',
  //   },
  // });
  // const p = await prisma.payment.update({
  //   data: {
  //     workSpaceId: 3,
  //   },
  //   where: {
  //     id: 2142,
  //   },
  // });

  // console.log(p);
  const deliveries = await prisma.delivery.findMany({});
  for (const delivery of deliveries) {
    const deal = await prisma.deal.findUnique({
      where: {
        id: delivery.dealId,
      },
    });
    if (!deal) {
      continue;
    }
    await prisma.delivery.update({
      data: {
        workSpaceId: deal.workSpaceId,
      },
      where: {
        id: delivery.id,
      },
    });
    const response = await axios.post(
      'https://api.cdek.ru/v2/oauth/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.CDEK_ACCOUNT || '',
        client_secret: process.env.CDEK_PASSWORD || '',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const token = response.data.access_token;
    if (delivery.track && delivery.method === 'СДЕК') {
      try {
        const response = await axios.get('https://api.cdek.ru/v2/orders', {
          params: { cdek_number: delivery.track },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const entity = response.data.entity;
        const statuses = entity?.statuses || [];
        const isClientReturn = entity?.is_client_return || false;

        let status = '';
        let sendDate = '';
        let deliveredDate = '';

        const hasDelivered = statuses.find((s) => s.code === 'DELIVERED');
        const hasShipped = statuses.find(
          (s) => s.code === 'RECEIVED_AT_SHIPMENT_WAREHOUSE',
        );
        const hasCreated = statuses.find((s) => s.code === 'CREATED');

        if (hasDelivered) {
          status = 'Вручена';
          deliveredDate = hasDelivered.date_time?.slice(0, 10);
          sendDate = hasShipped.date_time?.slice(0, 10);
        } else if (hasShipped) {
          status = 'Отправлена';
          sendDate = hasShipped.date_time?.slice(0, 10);
          console.log(hasShipped);
        } else if (hasCreated) {
          status = 'Создана';
        }

        if (isClientReturn) {
          status = 'Возврат';
        }
        await prisma.delivery.update({
          where: { id: delivery.id },
          data: {
            status,
            deliveredDate,
            date: sendDate,
          },
        });
      } catch (error) {
        console.log(error);
      }
    }
  }
}

main();
