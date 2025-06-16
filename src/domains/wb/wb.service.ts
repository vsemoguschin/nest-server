import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

const getImg = (nmId: string) => {
  const part = nmId.slice(0, 6);
  const vol = +nmId.slice(0, 4);
  let host = '';
  if (vol >= 0 && vol <= 143) {
    host = '01';
  } else if (vol >= 144 && vol <= 287) {
    host = '02';
  } else if (vol >= 288 && vol <= 431) {
    host = '03';
  } else if (vol >= 432 && vol <= 719) {
    host = '04';
  } else if (vol >= 720 && vol <= 1007) {
    host = '05';
  } else if (vol >= 1008 && vol <= 1061) {
    host = '06';
  } else if (vol >= 1062 && vol <= 1115) {
    host = '07';
  } else if (vol >= 1116 && vol <= 1169) {
    host = '08';
  } else if (vol >= 1170 && vol <= 1313) {
    host = '09';
  } else if (vol >= 1314 && vol <= 1601) {
    host = '10';
  } else if (vol >= 1602 && vol <= 1655) {
    host = '11';
  } else if (vol >= 1656 && vol <= 1919) {
    host = '12';
  } else if (vol >= 1920 && vol <= 2045) {
    host = '13';
  } else {
    host = '14';
  }
  return `https://basket-${host}.wb.ru/vol${vol}/part${part}/${nmId}/images/big/1.webp`;
};

@Injectable()
export class WbService {
  private readonly ordersApiUrl =
    'https://marketplace-api.wildberries.ru/api/v3/orders';
  private readonly statusApiUrl =
    'https://marketplace-api.wildberries.ru/api/v3/orders/status';
  private readonly wbToken: string;

  constructor() {
    const token = process.env.WB_TOKEN;
    if (!token) {
      throw new HttpException(
        'WB_TOKEN is not defined in environment variables',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    this.wbToken = token;
  }

  //new orders
  async getNewWbOrders() {
    try {
      const response = await axios.get(
        'https://marketplace-api.wildberries.ru/api/v3/orders/new',
        {
          headers: {
            Authorization: `Bearer ${this.wbToken}`,
          },
        },
      );

      const orders = response.data.orders.map((order: any) => {
        return {
          id: order.id,
          createdAt: order.createdAt,
          price: order.price / 100,
          article: order.article,
          preview: getImg(order.nmId.toString()),
        };
      });
      //   console.log(response.data.orders);
      return {
        next: response.data.next,
        orders,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new HttpException(
        `Failed to fetch orders from Wildberries API: ${axiosError.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getWaitingWbOrders() {
    try {
      const response = await axios.get(this.ordersApiUrl, {
        headers: {
          Authorization: `Bearer ${this.wbToken}`,
        },
        params: {
          limit: 1000,
          next: 0,
        },
      });

      const orderIds = response.data.orders.map(
        (order: { id: number }) => order.id,
      );

      const responseStatuses = await axios.post(
        this.statusApiUrl,
        {
          orders: orderIds,
        },
        {
          headers: {
            Authorization: `Bearer ${this.wbToken}`,
            'Content-Type': 'application/json',
          },
        },
      );


      const orders = response.data.orders
        .filter((order: any) =>
          responseStatuses.data.orders.some(
            (status: any) =>
              status.id === order.id && status.wbStatus === 'waiting',
          ),
        )
        .map((order: any) => ({
          id: order.id,
          createdAt: order.createdAt,
          price: order.currencyCode===643? order.price / 100 : 0,
          article: order.article,
          preview: getImg(order.nmId.toString()),
          status: 'В работе',
      }));
      // console.log(orders);
      

      return {
        next: response.data.next,
        orders,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new HttpException(
        `Failed to fetch waiting orders from Wildberries API: ${axiosError.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getWbSupplies() {
    try {
      const response = await axios.get(
        'https://marketplace-api.wildberries.ru/api/v3/supplies',
        {
          headers: {
            Authorization: `Bearer ${this.wbToken}`,
          },
        },
      );

      console.log(response.data);
      return;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.log(error);
      throw new HttpException(
        `Failed to fetch orders from Wildberries API: ${axiosError.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getWbOrders(params: {
    limit?: number;
    next?: number;
    dateFrom?: number;
    dateTo?: number;
  }) {
    const { limit = 1000, next = 0, dateFrom, dateTo } = params;
    // console.log('params', params);

    // Валидация параметра limit
    if (limit < 1 || limit > 1000) {
      throw new HttpException(
        'Limit must be between 1 and 1000',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const queryParams: any = { limit, next };
      if (dateFrom) queryParams.dateFrom = dateFrom;
      if (dateTo) queryParams.dateTo = dateTo;
      //   console.log('queryParams:', queryParams);

      const response = await axios.get(this.ordersApiUrl, {
        headers: {
          Authorization: `Bearer ${this.wbToken}`,
        },
        params: queryParams,
      });

      const orderIds = response.data.orders.map(
        (order: { id: number }) => order.id,
      );

      const responseStatuses = await axios.post(
        this.statusApiUrl,
        {
          orders: orderIds,
        },
        {
          headers: {
            Authorization: `Bearer ${this.wbToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      //   console.log('responseStatuses:', responseStatuses.data.orders);

      const statuses = {
        waiting: 'В работе',
        sorted: 'Отсортировано',
        sold: 'Получено покупателем',
        canceled: 'Отменено',
        canceled_by_client: 'Отмена при получении',
        declined_by_client: 'Отмена заказа',
        defect: 'Отмена, брак',
        ready_for_pickup: 'Прибыло на ПВЗ',
        postponed_delivery: 'курьерская доставка отложена',
      };

      const orders = response.data.orders.map((order: any) => {
        return {
          id: order.id,
          createdAt: order.createdAt,
          price: order.price / 100,
          article: order.article,
          preview: getImg(order.nmId.toString()),

          status:
            statuses[
              responseStatuses.data.orders.find(
                (status: any) => status.id === order.id,
              )?.wbStatus
            ] || 'Неизвестный статус',
        };
      });
      //   console.log(response.data.orders);
      return {
        next: response.data.next,
        orders,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new HttpException(
        `Failed to fetch orders from Wildberries API: ${axiosError.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getWbOrdersStat(period: string) {
    try {
      const limit = 1000;
      let next = 0;
      const dateFrom = new Date(period + '-01').getTime() / 1000;
      const [year, month] = period.split('-').map(Number);
      const dateTo = new Date(year, month, 1).getTime() / 1000;

      const response = await axios.get(this.ordersApiUrl, {
        headers: {
          Authorization: `Bearer ${this.wbToken}`,
        },
        params: {
          limit,
          next,
          dateFrom,
        },
      });
      const responseTo = await axios.get(this.ordersApiUrl, {
        headers: {
          Authorization: `Bearer ${this.wbToken}`,
        },
        params: {
          limit,
          next,
          dateTo,
        },
      });

      const ordersFrom = response.data.orders;
      const ordersTo = responseTo.data.orders.filter(
        (o) => o.createdAt.slice(0, 7) === period,
      );
      const mergedArrayWithMap = [
        ...ordersFrom,
        ...ordersTo.filter((item) => !ordersFrom.some((o) => o.id === item.id)),
      ];

      const orderIds = mergedArrayWithMap.map((o) => o.id);

      if (orderIds.length === 0) {
        return Object.values({
          waiting: 'В работе',
          sorted: 'Отсортировано',
          sold: 'Получено покупателем',
          canceled: 'Отменено',
          canceled_by_client: 'Отмена при получении',
          declined_by_client: 'Отмена заказа',
          defect: 'Отмена, брак',
          ready_for_pickup: 'Прибыло на ПВЗ',
          postponed_delivery: 'курьерская доставка отложена',
        }).map((status) => ({
          status,
          count: 0,
          totalPrice: 0,
        }));
      }

      const responseStatuses = await axios.post(
        this.statusApiUrl,
        {
          orders: orderIds,
        },
        {
          headers: {
            Authorization: `Bearer ${this.wbToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const statuses = {
        waiting: 'В работе',
        sorted: 'Отсортировано',
        sold: 'Получено покупателем',
        canceled: 'Отменено',
        canceled_by_client: 'Отмена при получении',
        declined_by_client: 'Отмена заказа',
        defect: 'Отмена, брак',
        ready_for_pickup: 'Прибыло на ПВЗ',
        postponed_delivery: 'курьерская доставка отложена',
      };

      const orders = mergedArrayWithMap.map((order: any) => ({
        id: order.id,
        price: order.price / 100,
        status:
          statuses[
            responseStatuses.data.orders.find(
              (status: any) => status.id === order.id,
            )?.wbStatus
          ] || 'Неизвестный статус',
      }));

      const stats = Object.values(statuses).map((status) => {
        const statusOrders = orders.filter((order) => order.status === status);
        return {
          status,
          count: statusOrders.length,
          totalPrice: statusOrders.reduce((sum, order) => sum + order.price, 0),
        };
      });

      return stats;
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new HttpException(
        `Failed to fetch orders from Wildberries API: ${axiosError.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
