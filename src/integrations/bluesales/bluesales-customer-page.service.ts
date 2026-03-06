import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { BlueSalesSessionService } from './bluesales-session.service';

@Injectable()
export class BlueSalesCustomerPageService {
  private readonly logger = new Logger(BlueSalesCustomerPageService.name);
  private readonly baseUrl: string;
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: ConfigService,
    private readonly sessionService: BlueSalesSessionService,
  ) {
    this.baseUrl =
      this.config.get<string>('BLUESALES_SITE_URL') || 'https://bluesales.ru';

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      maxRedirects: 0,
      validateStatus: () => true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
  }

  hasCredentials(accountCode: string) {
    return this.sessionService.hasCredentials(accountCode);
  }

  private logInfo(event: string, payload: Record<string, unknown>) {
    this.logger.log(
      JSON.stringify({
        scope: 'bluesales-customer-page',
        level: 'info',
        event,
        ...payload,
      }),
    );
  }

  private logWarn(event: string, payload: Record<string, unknown>) {
    this.logger.warn(
      JSON.stringify({
        scope: 'bluesales-customer-page',
        level: 'warn',
        event,
        ...payload,
      }),
    );
  }

  async fetchCustomerPageHtml(
    accountCode: string,
    customerExternalId: string,
    count?: number,
  ) {
    const normalizedExternalId = String(customerExternalId || '').trim();
    if (!normalizedExternalId) {
      throw new BadGatewayException(
        'Не указан externalId клиента для загрузки страницы BlueSales',
      );
    }

    const returnUrl = this.buildCustomerPagePath(normalizedExternalId);
    await this.sessionService.ensureSession(
      accountCode,
      returnUrl,
      normalizedExternalId,
    );

    const initialResponse = await this.requestCustomerPage(
      accountCode,
      normalizedExternalId,
      count,
    );

    if (this.isAuthenticatedCustomerPage(initialResponse)) {
      this.logInfo('customer-page.loaded', {
        accountCode,
        externalId: normalizedExternalId,
        count: count ?? 30,
        status: initialResponse.status,
        htmlLength:
          typeof initialResponse.data === 'string'
            ? initialResponse.data.length
            : 0,
        reauthorized: false,
      });
      return initialResponse.data;
    }

    this.logWarn('customer-page.reauth-required', {
      accountCode,
      externalId: normalizedExternalId,
      count: count ?? 30,
      status: initialResponse.status,
    });
    this.sessionService.invalidateSession(accountCode);
    await this.sessionService.ensureSession(
      accountCode,
      returnUrl,
      normalizedExternalId,
    );

    const retriedResponse = await this.requestCustomerPage(
      accountCode,
      normalizedExternalId,
      count,
    );

    if (this.isAuthenticatedCustomerPage(retriedResponse)) {
      this.logInfo('customer-page.loaded', {
        accountCode,
        externalId: normalizedExternalId,
        count: count ?? 30,
        status: retriedResponse.status,
        htmlLength:
          typeof retriedResponse.data === 'string'
            ? retriedResponse.data.length
            : 0,
        reauthorized: true,
      });
      return retriedResponse.data;
    }

    throw new BadGatewayException(
      'Не удалось получить страницу клиента из BlueSales',
    );
  }

  private async requestCustomerPage(
    accountCode: string,
    customerExternalId: string,
    count?: number,
  ) {
    const session = await this.sessionService.ensureSession(
      accountCode,
      this.buildCustomerPagePath(customerExternalId),
      customerExternalId,
    );

    const isAjaxPagination = Number.isFinite(count) && Number(count) > 30;
    const params: Record<string, string | number> = {
      id: customerExternalId,
    };

    if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
      params.count = count;
    }

    if (isAjaxPagination) {
      params._ = Date.now();
    }

    const response = await this.http.get('/app/Customers/CustomerView.aspx', {
      params,
      headers: {
        Cookie: session.cookieHeader,
        Referer: `${this.baseUrl}${this.buildCustomerPagePath(customerExternalId)}`,
        ...(isAjaxPagination
          ? {
              'X-Requested-With': 'XMLHttpRequest',
              Accept: '*/*',
            }
          : {}),
      },
      responseType: 'text',
    });

    this.logInfo('customer-page.requested', {
      accountCode,
      externalId: customerExternalId,
      count: count ?? 30,
      ajax: isAjaxPagination,
      status: response.status,
      contentType:
        typeof response.headers['content-type'] === 'string'
          ? response.headers['content-type']
          : null,
    });

    return response;
  }

  private isAuthenticatedCustomerPage(response: {
    status: number;
    headers: Record<string, unknown>;
    data: unknown;
  }) {
    if (response.status === 302) {
      const location = this.pickHeaderString(response.headers.location);
      return !location.toLowerCase().includes('/app/login.aspx');
    }

    if (response.status !== 200 || typeof response.data !== 'string') {
      return false;
    }

    const html = response.data;
    const isLoginPage =
      /txtLoginOrClientEmail/i.test(html) ||
      /<form[^>]+Login\.aspx/i.test(html);
    const hasCustomerViewMarker =
      /pgRibbonEvents_container/i.test(html) ||
      /CustomerView\.aspx/i.test(html);

    return !isLoginPage && hasCustomerViewMarker;
  }

  private buildCustomerPagePath(customerExternalId: string) {
    return `/app/Customers/CustomerView.aspx?id=${encodeURIComponent(customerExternalId)}`;
  }

  private pickHeaderString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === 'string');
      return typeof first === 'string' ? first : '';
    }
    return '';
  }
}
