import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class CdekProxyService {
  private readonly logger = new Logger(CdekProxyService.name);
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>('CDEK_SERVICE_URL');
    if (!baseURL) {
      throw new Error('CDEK_SERVICE_URL is not set');
    }

    const timeoutMs = Number(this.config.get<string>('CDEK_SERVICE_TIMEOUT_MS') ?? 15000);

    this.http = axios.create({
      baseURL,
      timeout: timeoutMs,
    });
  }

  async get(path: string, params?: Record<string, any>, headers?: Record<string, string | undefined>) {
    return this.request('get', path, undefined, params, headers);
  }

  async post(path: string, body: Record<string, unknown>, headers?: Record<string, string | undefined>) {
    return this.request('post', path, body, undefined, headers);
  }

  private buildHeaders(extra?: Record<string, string | undefined>) {
    const headers: Record<string, string> = {};
    const token = this.config.get<string>('CDEK_SERVICE_TOKEN');

    if (token) {
      headers['x-internal-token'] = token;
    }

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value) {
          headers[key] = value;
        }
      }
    }

    return headers;
  }

  private async request(
    method: 'get' | 'post',
    path: string,
    body?: Record<string, unknown>,
    params?: Record<string, any>,
    headers?: Record<string, string | undefined>,
  ) {
    try {
      const response = await this.http.request({
        method,
        url: path,
        data: body,
        params,
        headers: this.buildHeaders(headers),
      });

      return { status: response.status, data: response.data };
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response) {
        return { status: error.response.status, data: error.response.data };
      }

      this.logger.error('CDEK proxy error', error?.message || String(error));
      return { status: 502, data: { error: 'CDEK_SERVICE_UNAVAILABLE' } };
    }
  }
}
