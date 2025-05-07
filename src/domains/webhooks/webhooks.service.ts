// src/domains/webhooks/webhooks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';

const wh = {
  entity: { uuid: 'f6874843-5c9d-42d9-9635-752eb1c4baa6' },
  requests: [
    {
      request_uuid: 'e4c2bc16-e8c3-43c4-bb6b-a1002f152e62',
      type: 'CREATE',
      date_time: '2025-05-07T11:39:39+0000',
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

    const { event, uuid, attributes } = payload;

    if (event === 'ORDER_STATUS') {
      const { cdek_number, status } = attributes;
      this.logger.log(`Order ${cdek_number} changed status to ${status.name}`);

      // Обновляем статус доставки в базе данных
    } else {
      this.logger.warn(`Unsupported webhook event: ${event}`);
    }
  }

  // src/domains/webhooks/webhooks.service.ts
  async registerCdekWebhook() {
    const CDEK_API_URL = 'https://api.cdek.ru/v2';
    const CDEK_ACCOUNT = 'DRCqUsjqi1SW9NuqSSg2mkiaH1oAQKmk'; // Добавьте в .env
    const CDEK_PASSWORD = 'V1OSykuiWzG07SEXUZ6JknBfE4pRt9lo'; // Добавьте в .env
    const WEBHOOK_URL = 'https://app.easy-crm.pro/api/webhooks/cdek';

    try {
      // Получение токена
      const response = await axios.post(
        'https://api.cdek.ru/v2/oauth/token',
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: CDEK_ACCOUNT, // Тестовый account
          client_secret: CDEK_PASSWORD, // Тестовый secure_password
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
      const { access_token } = response.data;

      //delete webhook
      const deleteWebhookResponse = await axios.delete(
        `${CDEK_API_URL}/webhooks/${wh.entity.uuid}`,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );
        console.log(deleteWebhookResponse.data);

      //   Регистрация вебхука
    //   const webhookResponse = await axios.post(
    //     `${CDEK_API_URL}/webhooks`,
    //     {
    //       url: WEBHOOK_URL,
    //       type: 'ORDER_STATUS',
    //     },
    //     {
    //       headers: {
    //         Authorization: `Bearer ${access_token}`,
    //         'Content-Type': 'application/json',
    //       },
    //     },
    //   );

    //   this.logger.log(
    //     `Webhook registered: ${JSON.stringify(webhookResponse.data)}`,
    //   );
    //   return webhookResponse.data;
    } catch (error) {
      this.logger.error(
        `Error registering webhook: ${error.response?.data || error.message}`,
      );
      throw error;
    }
  }
}
