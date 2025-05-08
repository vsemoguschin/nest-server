import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class CdekService {
  private readonly logger = new Logger(CdekService.name);

  async getAccessToken(): Promise<string> {
    try {
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

      return response.data.access_token;
    } catch (error) {
      this.logger.error('Failed to get CDEK access token:', error.message);
      throw new Error('CDEK auth error');
    }
  }

  async getOrderInfo(cdek_number: string, token: string): Promise<any> {
    try {
      const response = await axios.get('https://api.cdek.ru/v2/orders', {
        params: { cdek_number },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log(response.data.entity.statuses);

      return response.data.entity;
    } catch (error) {
      this.logger.error(
        `Failed to fetch order info for ${cdek_number}: ${error.message}`,
      );
      return {
        price: 0,
        status: 'Создана',
        send_date: '',
        delivered_date: '',
      };
    }
  }

  parseOrderStatus(entity: any): {
    status: string;
    sendDate: string;
    deliveredDate: string;
    isClientReturn: boolean;
  } {
    const statuses = entity?.statuses || [];
    const isClientReturn = entity?.is_client_return || false;

    let status = '';
    let sendDate = '';
    let deliveredDate = '';

    const statusMap = {
      CREATED: 'Создана',
      RECEIVED_AT_SHIPMENT_WAREHOUSE: 'Отправлена',
      DELIVERED: 'Вручена',
    };

    for (const s of statuses) {
      if (s.code === 'RECEIVED_AT_SHIPMENT_WAREHOUSE') {
        sendDate = s.date_time?.slice(0, 10);
      }
      if (s.code === 'DELIVERED') {
        deliveredDate = s.date_time?.slice(0, 10);
      }
      if (statusMap[s.code]) {
        status = statusMap[s.code];
      }
    }

    if (isClientReturn) {
      status = 'Возврат';
    }

    return { status, sendDate, deliveredDate, isClientReturn };
  }

  async checkTrackInfo(cdek_number: string): Promise<{
    price: number;
    status: string;
    send_date: string;
    delivered_date: string;
  }> {
    const token = await this.getAccessToken();
    const entity = await this.getOrderInfo(cdek_number, token);
    const { status, sendDate, deliveredDate } = this.parseOrderStatus(entity);
  
    const price = entity?.delivery_detail?.total_sum || 0;
  
    return {
      price,
      status,
      send_date: sendDate,
      delivered_date: deliveredDate,
    };
  }
}
