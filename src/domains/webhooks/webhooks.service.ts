// src/domains/webhooks/webhooks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';
import { CdekService } from 'src/services/cdek.service';

const wh = {
  entity: { uuid: 'fc504789-dce2-4299-9404-d466a46bb084' },
  requests: [
    {
      request_uuid: '5b7133e1-0e8c-4a98-9fe0-20fc3a7c89aa',
      type: 'CREATE',
      date_time: '2025-05-11T14:27:32+0000',
      state: 'SUCCESSFUL',
    },
  ],
};

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cdekService: CdekService,
  ) {}

  async processCdekWebhook(payload: any) {
    const { type, attributes } = payload;

    if (type !== 'ORDER_STATUS') {
      return;
    }

    const cdek_number = attributes?.cdek_number;
    if (!cdek_number) return;

    try {
      const token = await this.cdekService.getAccessToken();
      const entity = await this.cdekService.getOrderInfo(cdek_number, token);
      const { status, sendDate, deliveredDate } =
        this.cdekService.parseOrderStatus(entity);

      const del = await this.prisma.delivery.updateMany({
        where: { track: cdek_number },
        data: {
          price: entity.delivery_detail.total_sum ?? 0,
          status,
          date: sendDate,
          deliveredDate,
        },
      });
      console.log(
        'Updated delivery:',
        cdek_number,
        status,
        sendDate,
        deliveredDate,
        del,
      );
    } catch (error) {
      console.error(`Error in webhook processing: ${error.message}`);
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

      const getWebhooks = await axios.get('https://api.cdek.ru/v2/webhooks', {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log(getWebhooks.data);

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
      // console.log(deleteWebhookResponse.data);

      //   Регистрация вебхука
      // const webhookResponse = await axios.post(
      //   `${CDEK_API_URL}/webhooks`,
      //   {
      //     url: process.env.WEBHOOK_URL,
      //     type: 'ORDER_STATUS',
      //   },
      //   {
      //     headers: {
      //       Authorization: `Bearer ${access_token}`,
      //       'Content-Type': 'application/json',
      //     },
      //   },
      // );

      // this.logger.log(
      //   `Webhook registered: ${JSON.stringify(webhookResponse.data)}`,
      // );
      // return webhookResponse.data;
    } catch (error) {
      this.logger.error(
        `Error registering webhook: ${error.response?.data || error.message}`,
      );
      throw error;
    }
  }
}
