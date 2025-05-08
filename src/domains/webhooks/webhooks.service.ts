// src/domains/webhooks/webhooks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';

const wh = {
  entity: { uuid: '3bc34e6e-7254-404e-b705-984de152ee1f' },
  requests: [
    {
      request_uuid: '299a6e66-485d-4211-8ec9-af9789fa8f06',
      type: 'CREATE',
      date_time: '2025-05-08T12:08:58+0000',
      state: 'SUCCESSFUL',
    },
  ],
};

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processCdekWebhook(payload: any) {
    this.logger.log(`Received CDEK webhook: ${JSON.stringify(payload)}`);

    const { type, uuid, attributes } = payload;

    if (type === 'ORDER_STATUS') {
      const { cdek_number, code, is_return } = attributes;
      // this.logger.log(`Order ${cdek_number} changed status to ${code}`);
      // if (cdek_number) {
      //   try {
      //     const response = await axios.post(
      //       'https://api.cdek.ru/v2/oauth/token',
      //       new URLSearchParams({
      //         grant_type: 'client_credentials',
      //         client_id: process.env.CDEK_ACCOUNT || '',
      //         client_secret: process.env.CDEK_PASSWORD || '',
      //       }),
      //       {
      //         headers: {
      //           'Content-Type': 'application/x-www-form-urlencoded',
      //         },
      //       },
      //     );
      //     const { access_token } = response.data;
      //     try {
      //       // Получение информации о заказе
      //       const responseOrders = await axios.get(
      //         'https://api.cdek.ru/v2/orders',
      //         {
      //           params: {
      //             cdek_number,
      //           },
      //           headers: {
      //             Authorization: `Bearer ${access_token}`,
      //           },
      //         },
      //       );

      //       const statuses = responseOrders.data.entity.statuses;
      //       const is_client_return =
      //         responseOrders.data.entity.is_client_return;

      //       let status = '';
      //       let send_date = '';
      //       let delivered_date = '';

      //       if (statuses.find((s) => s.code === 'CREATED')) {
      //         status = 'Создана';
      //       }
      //       if (
      //         statuses.find((s) => s.code === 'RECEIVED_AT_SHIPMENT_WAREHOUSE')
      //       ) {
      //         status = 'Отправлена';
      //         send_date = statuses
      //           .find((s) => s.code === 'RECEIVED_AT_SHIPMENT_WAREHOUSE')
      //           .date_time.slice(0, 10);
      //       }
      //       if (statuses.find((s) => s.code === 'DELIVERED')) {
      //         status = 'Вручена';
      //         delivered_date = statuses
      //           .find((s) => s.code === 'DELIVERED')
      //           .date_time.slice(0, 10);
      //       }
      //       if (is_client_return) {
      //         status = 'Возврат';
      //       }

      //       await this.prisma.delivery.update({
      //         where: { track: cdek_number },
      //         data: {
      //           status,
      //           date: send_date,
      //           deliveredDate: delivered_date,
      //         },
      //       });
      //     } catch (orderError) {
      //       // Если возникла ошибка при получении информации о заказе, возвращаем пустой объект
      //       console.error(
      //         'Error fetching order information:',
      //         orderError.message,
      //       );
      //     }
      //   } catch (error) {
      //     console.error(
      //       'Error while authenticating with CDEK API:',
      //       error.message,
      //     );
      //   }
      // }

      // Обновляем статус доставки в базе данных
    } else {
      this.logger.warn(`Unsupported webhook event: ${type}`);
    }
  }

  // src/domains/webhooks/webhooks.service.ts
  async registerCdekWebhook() {
    const CDEK_API_URL = 'https://api.cdek.ru/v2';

    try {
      // Получение токена
      const response = await axios.post(
        'https://api.cdek.ru/v2/oauth/token',
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: process.env.CDEK_ACCOUNT || '', // Тестовый account
          client_secret: process.env.CDEK_PASSWORD || '', // Тестовый secure_password
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
      const { access_token } = response.data;

      //delete webhook
      // const deleteWebhookResponse = await axios.delete(
      //   `${CDEK_API_URL}/webhooks/${wh.entity.uuid}`,
      //   {
      //     headers: {
      //       Authorization: `Bearer ${access_token}`,
      //       'Content-Type': 'application/json',
      //     },
      //   },
      // );
      //   console.log(deleteWebhookResponse.data);

      //   Регистрация вебхука
      const webhookResponse = await axios.post(
        `${CDEK_API_URL}/webhooks`,
        {
          url: process.env.WEBHOOK_URL,
          type: 'ORDER_STATUS',
        },
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(
        `Webhook registered: ${JSON.stringify(webhookResponse.data)}`,
      );
      return webhookResponse.data;
    } catch (error) {
      this.logger.error(
        `Error registering webhook: ${error.response?.data || error.message}`,
      );
      throw error;
    }
  }
}
