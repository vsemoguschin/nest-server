import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

type BlueSalesSessionRecord = {
  cookies: Record<string, string>;
  cookieHeader: string;
  updatedAt: number;
};

type BlueSalesCredentials = {
  login: string;
  password: string;
};

type LoginFormPayload = {
  returnUrl: string;
  customerExternalId: string;
  hiddenFields: Record<string, string>;
  cookies: Record<string, string>;
};

const SESSION_TTL_MS = 10 * 60 * 60 * 1000;

@Injectable()
export class BlueSalesSessionService {
  private readonly logger = new Logger(BlueSalesSessionService.name);
  private readonly baseUrl: string;
  private readonly http: AxiosInstance;
  private readonly sessions = new Map<string, BlueSalesSessionRecord>();

  constructor(private readonly config: ConfigService) {
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

  private logInfo(event: string, payload: Record<string, unknown>) {
    this.logger.log(
      JSON.stringify({
        scope: 'bluesales-session',
        level: 'info',
        event,
        ...payload,
      }),
    );
  }

  private logWarn(event: string, payload: Record<string, unknown>) {
    this.logger.warn(
      JSON.stringify({
        scope: 'bluesales-session',
        level: 'warn',
        event,
        ...payload,
      }),
    );
  }

  private logError(event: string, payload: Record<string, unknown>) {
    this.logger.error(
      JSON.stringify({
        scope: 'bluesales-session',
        level: 'error',
        event,
        ...payload,
      }),
    );
  }

  invalidateSession(accountCode: string) {
    this.sessions.delete(this.normalizeAccountCode(accountCode));
  }

  hasCredentials(accountCode: string) {
    return this.resolveCredentials(accountCode) !== null;
  }

  async ensureSession(
    accountCode: string,
    returnUrl: string,
    customerExternalId: string,
  ): Promise<BlueSalesSessionRecord> {
    const normalizedAccountCode = this.normalizeAccountCode(accountCode);
    const session = this.sessions.get(normalizedAccountCode);

    if (session && Date.now() - session.updatedAt < SESSION_TTL_MS) {
      return session;
    }

    return this.login(normalizedAccountCode, returnUrl, customerExternalId);
  }

  async login(
    accountCode: string,
    returnUrl: string,
    customerExternalId: string,
  ): Promise<BlueSalesSessionRecord> {
    this.logInfo('login.started', {
      accountCode,
      customerExternalId,
      returnUrl,
    });

    const credentials = this.getCredentials(accountCode);
    const loginForm = await this.fetchLoginForm(returnUrl, customerExternalId);
    const loginUrl = this.buildLoginPath(returnUrl, customerExternalId);

    const body = new URLSearchParams({
      ReturnUrl: loginForm.returnUrl,
      id: loginForm.customerExternalId,
      __LASTFOCUS: loginForm.hiddenFields.__LASTFOCUS ?? '',
      __VIEWSTATE: loginForm.hiddenFields.__VIEWSTATE ?? '',
      __VIEWSTATEGENERATOR: loginForm.hiddenFields.__VIEWSTATEGENERATOR ?? '',
      __EVENTTARGET: loginForm.hiddenFields.__EVENTTARGET ?? '',
      __EVENTARGUMENT: loginForm.hiddenFields.__EVENTARGUMENT ?? '',
      __EVENTVALIDATION: loginForm.hiddenFields.__EVENTVALIDATION ?? '',
      txtLoginOrClientEmail: credentials.login,
      txtPassword: credentials.password,
      btnLogin: 'Войти',
    });

    const response = await this.http.post(loginUrl, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: this.buildCookieHeader(loginForm.cookies),
        Referer: `${this.baseUrl}${loginUrl}`,
        Origin: this.baseUrl,
      },
    });

    const responseCookies = this.extractCookies(response.headers['set-cookie']);
    const cookies = {
      socialType: '1',
      ...loginForm.cookies,
      ...responseCookies,
    };

    const location = this.pickHeaderString(response.headers.location);
    const isSuccessRedirect =
      response.status === 302 &&
      typeof location === 'string' &&
      location.toLowerCase().includes('/app/customers/customerview.aspx');
    const hasAuthCookie = Boolean(cookies['.ASPXFORMSAUTH']);

    if (!isSuccessRedirect || !hasAuthCookie) {
      this.logError('login.failed', {
        accountCode,
        customerExternalId,
        returnUrl,
        status: response.status,
        redirect: location || null,
        hasAuthCookie,
      });
      throw new BadGatewayException(
        'Не удалось авторизоваться в BlueSales',
      );
    }

    const session: BlueSalesSessionRecord = {
      cookies,
      cookieHeader: this.buildCookieHeader(cookies),
      updatedAt: Date.now(),
    };

    this.sessions.set(accountCode, session);
    this.logInfo('login.succeeded', {
      accountCode,
      customerExternalId,
      returnUrl,
      status: response.status,
      redirect: location || null,
      hasAuthCookie,
      cookieCount: Object.keys(cookies).length,
    });

    return session;
  }

  private async fetchLoginForm(
    returnUrl: string,
    customerExternalId: string,
  ): Promise<LoginFormPayload> {
    const loginUrl = this.buildLoginPath(returnUrl, customerExternalId);
    const response = await this.http.get(loginUrl, {
      headers: {
        Referer: `${this.baseUrl}${returnUrl}`,
      },
    });

    if (response.status >= 400 || typeof response.data !== 'string') {
      throw new BadGatewayException(
        'Не удалось получить форму авторизации BlueSales',
      );
    }

    const html = response.data;
    const cookies = this.extractCookies(response.headers['set-cookie']);
    const hiddenFields = this.parseHiddenInputs(html);

    this.logInfo('login.form.loaded', {
      customerExternalId,
      returnUrl,
      status: response.status,
      hiddenFieldCount: Object.keys(hiddenFields).length,
      cookieCount: Object.keys(cookies).length + 1,
    });

    return {
      returnUrl:
        hiddenFields.ReturnUrl?.trim() || returnUrl || `/app/Customers/CustomerView.aspx?id=${customerExternalId}`,
      customerExternalId:
        hiddenFields.id?.trim() || customerExternalId || '',
      hiddenFields,
      cookies: {
        socialType: '1',
        ...cookies,
      },
    };
  }

  private getCredentials(accountCode: string): BlueSalesCredentials {
    const credentials = this.resolveCredentials(accountCode);

    if (!credentials) {
      this.logWarn('credentials.missing', {
        accountCode,
      });
      throw new BadGatewayException(
        `Не заданы credentials BlueSales для account=${accountCode}`,
      );
    }

    return credentials;
  }

  private resolveCredentials(accountCode: string): BlueSalesCredentials | null {
    const suffix = accountCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');

    const login = (
      this.config.get<string>(`BLUESALES_LOGIN_${suffix}`) || ''
    ).trim();
    const password = (
      this.config.get<string>(`BLUESALES_PASSWORD_${suffix}`) || ''
    ).trim();

    if (!login || !password) {
      return null;
    }

    return { login, password };
  }

  private buildLoginPath(returnUrl: string, customerExternalId: string) {
    const params = new URLSearchParams({
      ReturnUrl: returnUrl,
      id: customerExternalId,
    });

    return `/app/Login.aspx?${params.toString()}`;
  }

  private normalizeAccountCode(accountCode: string) {
    return String(accountCode || '')
      .trim()
      .toLowerCase();
  }

  private buildCookieHeader(cookies: Record<string, string>) {
    return Object.entries(cookies)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  private extractCookies(setCookieHeader: unknown): Record<string, string> {
    const cookieLines = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : typeof setCookieHeader === 'string'
        ? [setCookieHeader]
        : [];

    const result: Record<string, string> = {};

    for (const line of cookieLines) {
      const [pair] = String(line).split(';');
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex <= 0) continue;
      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (!name) continue;
      result[name] = value;
    }

    return result;
  }

  private parseHiddenInputs(html: string): Record<string, string> {
    const result: Record<string, string> = {};
    const inputRegex = /<input\b[^>]*\bname=(['"])([^'"]+)\1[^>]*>/gi;

    let match: RegExpExecArray | null = null;
    while ((match = inputRegex.exec(html))) {
      const fullTag = match[0];
      const name = match[2];
      const valueMatch =
        fullTag.match(/\bvalue=(['"])([\s\S]*?)\1/i) ||
        fullTag.match(/\bvalue=([^\s>]+)/i);

      const rawValue = valueMatch
        ? valueMatch[2] ?? valueMatch[1] ?? ''
        : '';

      result[name] = this.decodeHtmlEntities(rawValue);
    }

    return result;
  }

  private decodeHtmlEntities(value: string) {
    return String(value)
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x2B;/gi, '+')
      .replace(/&#43;/g, '+');
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
