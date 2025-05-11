import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  try {
    const deliveries = await prisma.delivery.findMany({
      where: {
        track: {
          not: '',
        },
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
    for (const delivery of deliveries) {
      try {
        const response = await axios.get('https://api.cdek.ru/v2/orders', {
          params: { cdek_number: delivery.track },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const { entity } = response.data;
        // console.log(entity);
        const statuses = entity?.statuses || [];
        const isClientReturn = entity?.is_client_return || false;
        const price = entity.delivery_detail.total_sum ?? 0;
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
        } else if (hasShipped) {
          status = 'Отправлена';
          sendDate = hasShipped.date_time?.slice(0, 10);
        } else if (hasCreated) {
          status = 'Создана';
        }

        if (isClientReturn) {
          status = 'Возврат';
        }

        const del = await prisma.delivery.updateMany({
          where: { track: delivery.track },
          data: {
            price,
            status,
            date: sendDate,
            deliveredDate,
          },
        });
        console.log(
          'Updated delivery:',
          delivery.track,
          status,
          sendDate,
          deliveredDate,
          del,
        );
      } catch (e) {
        console.log(e);
      }
    }
  } catch (error) {
    console.error('Error updating:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
