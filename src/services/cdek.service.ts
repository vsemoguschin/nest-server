import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

function getDatesOfMonth(yearMonth: string): string[] {
  const [year, month] = yearMonth.split('-').map(Number); // Разделяем год и месяц
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // Месяцы в JS 0-11, поэтому +1
  const currentDay = today.getDate();

  const dates: string[] = [];
  const isCurrentMonth = year === currentYear && month === currentMonth;
  const daysInMonth = new Date(year, month, 0).getDate(); // Количество дней в месяце

  const endDay = isCurrentMonth ? currentDay : daysInMonth; // До сегодня или до конца месяца

  for (let day = 1; day <= endDay; day++) {
    const formattedDay = day.toString().padStart(2, '0'); // Добавляем ведущий ноль
    dates.push(`${year}-${month.toString().padStart(2, '0')}-${formattedDay}`);
  }

  return dates;
}

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

      // console.log(response.data.entity.statuses);

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
    } else if (hasCreated) {
      status = 'Создана';
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
    console.log(entity);
    const { status, sendDate, deliveredDate } = this.parseOrderStatus(entity);

    const price = entity?.delivery_detail?.total_sum || 0;
    // console.log({ status, sendDate, deliveredDate, price });
    return {
      price,
      status,
      send_date: sendDate,
      delivered_date: deliveredDate,
    };
  }

  async getRegisters(period: string) {
    try {
      const days = getDatesOfMonth(period); // Предполагается, что функция работает корректно
      const token = await this.getAccessToken();
      const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      const res = await Promise.all(
        days.map(async (date, index) => {
          await delay(index * 50);
          try {
            const { data } = await axios.get(
              'https://api.cdek.ru/v2/registries',
              {
                params: { date },
                headers: { Authorization: `Bearer ${token}` },
              },
            );
            // console.log(data);

            // Проверка на наличие registries
            if (!data?.registries) {
              return { date, tracks: [], orders: [], sum: 0 }; // Возвращаем пустые массивы вместо null
            }

            const orders = data.registries.flatMap((r) => r.orders || []); // Защита от undefined
            const tracks = orders.map((o) => o.cdek_number).filter(Boolean); // Фильтрация undefined/null
            const sum = data.registries.reduce((acc, r) => acc + r.sum, 0);
            console.log(date, 'sum reg', sum);

            return { date, tracks, orders, sum };
          } catch (error) {
            console.error(`Ошибка для даты ${date}:`, error);
            return {
              date,
              tracks: [],
              orders: [],
              error: error.message,
              sum: 0,
            }; // Возвращаем данные с ошибкой
          }
        }),
      );

      // Фильтруем успешные результаты (опционально)
      const successfulResults = res
        .filter((item) => !item.error)
        .flatMap((item) => item.tracks);
      // console.log('Результаты:', successfulResults);

      return {
        tracks: successfulResults,
        sum: res.reduce((a, b) => a + b.sum, 0),
      }; // Возвращаем результаты
    } catch (error) {
      console.error('Ошибка в getRegisters:', error.message);
      return { tracks: [], sum: 0 }; // Возвращаем пустой массив вместо null для предотвращения краша
    }
  }
}
