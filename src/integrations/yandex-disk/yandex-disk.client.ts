import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestHeaders,
  RawAxiosRequestConfig,
} from 'axios';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type UploadPayload = {
  body: Buffer | NodeJS.ReadableStream;
  contentLength?: number;
};

// Список расширений, для которых применяем загрузку во временное имя + rename.
// При необходимости добавляйте новые элементы.
const THROTTLED_EXTENSIONS = new Set<string>(['.mp4', '.mov', '.avi', '.mkv']);

export interface YandexDiskSystemFolders {
  downloads?: string;
  applications?: string;
  camera_upload?: string;
  scans?: string;
  photostream?: string;
}

export interface YandexDiskFieldList {
  name?: string[];
  index?: string[];
}

export interface YandexDiskResource {
  name: string;
  path: string;
  type?: string;
  mime_type?: string;
  size?: number;
  preview?: string;
  file?: string;
  resource_id?: string;
  sha256?: string;
  md5?: string;
  media_type?: string;
  origin_path?: string;
  created?: string;
  modified?: string;
  public_url?: string;
  public_key?: string;
  sizes?: Array<{ url?: string; name?: string }>;
  embedded?: {
    items?: YandexDiskResource[];
    limit?: number;
    offset?: number;
    total?: number;
    sort?: string;
    path?: string;
  };
  _embedded?: {
    items?: YandexDiskResource[];
    limit?: number;
    offset?: number;
    total?: number;
    sort?: string;
    path?: string;
  };
  [key: string]: unknown;
}

export interface YandexDiskQuotaInfo {
  total?: number;
  used?: number;
  trash_size?: number;
  free?: number;
}

export interface YandexDiskMeta {
  trash_size?: number;
  total_space?: number;
  used_space?: number;
  is_paid?: boolean;
  uid?: string;
  login?: string;
  display_name?: string;
  quota?: YandexDiskQuotaInfo;
  system_folders?: YandexDiskSystemFolders;
}

export interface YandexDiskListResponse<T = YandexDiskResource> {
  items: T[];
  limit?: number;
  offset?: number;
  total?: number;
  path?: string;
}

export interface YandexDiskUploadLink {
  href: string;
  method: string;
  templated?: boolean;
  operation_id?: string;
}

export interface YandexDiskOperationStatus {
  status: 'success' | 'failed' | 'in-progress';
  error?: {
    message?: string;
    reason?: string;
    description?: string;
  };
}

interface OAuthTokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

interface YandexDiskErrorDetails {
  message?: string;
  description?: string;
  error?: string;
  error_description?: string;
  reason?: string;
  details?: Array<{ message?: string; description?: string }>;
}

@Injectable()
export class YandexDiskClient {
  private readonly logger = new Logger(YandexDiskClient.name);
  private readonly apiBase = 'https://cloud-api.yandex.net/v1/disk';
  private readonly oauthEndpoint = 'https://oauth.yandex.ru/token';
  private readonly http: AxiosInstance;
  private readonly uploadUserAgent: string;

  private accessToken: string | null;
  private readonly refreshToken: string | null;
  private readonly clientId: string | null;
  private readonly clientSecret: string | null;
  private expiresAt?: number;
  private refreshPromise?: Promise<void>;

  constructor(private readonly config: ConfigService) {
    const timeout = this.config.get<number>('YANDEX_DISK_TIMEOUT', 15_000);

    this.uploadUserAgent =
      this.config.get<string>('YANDEX_DISK_UPLOAD_USER_AGENT') ??
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

    this.accessToken =
      this.config.get<string>('YANDEX_DISK_TOKEN') ??
      process.env.YA_TOKEN ??
      null;
    this.refreshToken =
      this.config.get<string>('YANDEX_DISK_REFRESH_TOKEN') ?? null;
    this.clientId = this.config.get<string>('YANDEX_DISK_CLIENT_ID') ?? null;
    this.clientSecret =
      this.config.get<string>('YANDEX_DISK_CLIENT_SECRET') ?? null;

    const baseConfig: RawAxiosRequestConfig = {
      baseURL: this.apiBase,
      timeout,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      headers: {
        'User-Agent': this.uploadUserAgent,
      },
    };

    this.http = axios.create(baseConfig);
    this.http.defaults.headers.common['User-Agent'] = this.uploadUserAgent;

    this.http.interceptors.request.use(async (config) => {
      const token = await this.ensureAccessToken();
      const headers = (config.headers ?? {}) as AxiosRequestHeaders;
      headers.Authorization = `OAuth ${token}`;
      config.headers = headers;
      return config;
    });

    this.http.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 409) {
          throw error;
        }
        if (error.response?.status === 401 && this.canRefresh()) {
          await this.ensureAccessToken(true);
          const retryConfig = error.config;
          if (retryConfig) {
            const retryHeaders = (retryConfig.headers ??
              {}) as AxiosRequestHeaders;
            retryHeaders.Authorization = `OAuth ${this.accessToken}`;
            retryConfig.headers = retryHeaders;
            return this.http.request(retryConfig);
          }
        }
        throw this.wrapError(error);
      },
    );
  }

  async getDiskMeta(fields?: string): Promise<YandexDiskMeta> {
    try {
      const response = await this.http.get<YandexDiskMeta>('', {
        params: { fields },
      });
      return response.data;
    } catch (error) {
      throw this.wrapError(error, 'Не удалось получить метаданные диска');
    }
  }

  async getResource(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<YandexDiskResource> {
    try {
      const response = await this.http.get<YandexDiskResource>('/resources', {
        params: { path, ...params },
      });
      return response.data;
    } catch (error) {
      throw this.wrapError(error, `Не удалось получить ресурс «${path}»`);
    }
  }

  async ensureFolder(path: string): Promise<void> {
    try {
      await this.http.put('/resources', null, { params: { path } });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        return;
      }
      throw this.wrapError(error, `Не удалось создать папку «${path}»`);
    }
  }

  async deleteResource(path: string, permanently = false): Promise<void> {
    try {
      await this.http.delete('/resources', {
        params: { path, permanently },
      });
    } catch (error) {
      throw this.wrapError(error, `Не удалось удалить ресурс «${path}»`);
    }
  }

  async getDownloadLink(path: string): Promise<string> {
    try {
      const response = await this.http.get<{ href: string }>(
        '/resources/download',
        { params: { path } },
      );
      return response.data.href;
    } catch (error) {
      throw this.wrapError(
        error,
        `Не удалось получить ссылку на скачивание «${path}»`,
      );
    }
  }

  async uploadFile(
    path: string,
    payload: UploadPayload,
    overwrite = true,
  ): Promise<YandexDiskResource> {
    const normalizedPath = path.replace(/\\/g, '/');
    const extension = this.extractExtension(normalizedPath);
    const useTempName = extension && THROTTLED_EXTENSIONS.has(extension);

    const tempPath = useTempName
      ? this.buildTempPath(normalizedPath, extension)
      : normalizedPath;

    try {
      const link = await this.http.get<YandexDiskUploadLink>(
        '/resources/upload',
        {
          params: { path: tempPath, overwrite },
          headers: {
            'User-Agent': this.uploadUserAgent,
          },
        },
      );

      this.logger.log(
        `YD upload link: path=${tempPath}, href=${link.data.href}, method=${link.data.method}, operation_id=${link.data.operation_id ?? 'n/a'}`,
      );

      const contentLength =
        payload.contentLength ??
        (payload.body instanceof Buffer ? payload.body.length : undefined);

      if (contentLength === undefined) {
        this.logger.warn(
          `YD upload content length undefined for path=${tempPath}. Upload may fall back to chunked transfer.`,
        );
      } else {
        this.logger.log(
          `YD upload start: path=${tempPath}, size=${contentLength} bytes`,
        );
      }

      const startTime = Date.now();
      let uploadedBytes = 0;
      let lastLogTimestamp = Date.now();

      if (!(payload.body instanceof Buffer) && 'on' in payload.body) {
        (payload.body as NodeJS.ReadableStream).on('data', (chunk: unknown) => {
          const size = Buffer.isBuffer(chunk) ? chunk.length : 0;
          uploadedBytes += size;

          const now = Date.now();
          if (now - lastLogTimestamp >= 1000) {
            const progress =
              contentLength && contentLength > 0
                ? `${((uploadedBytes / contentLength) * 100 || 0).toFixed(2)}%`
                : `${uploadedBytes} bytes`;
            this.logger.debug(
              `YD stream progress: path=${tempPath}, uploaded=${uploadedBytes} bytes (${progress})`,
            );
            lastLogTimestamp = now;
          }
        });
      }

      await axios.put(link.data.href, payload.body, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'User-Agent': this.uploadUserAgent,
          ...(contentLength !== undefined
            ? { 'Content-Length': String(contentLength) }
            : {}),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: this.config.get<number>(
          'YANDEX_DISK_UPLOAD_TIMEOUT',
          30 * 60_000,
        ),
      });

      const durationMs = Date.now() - startTime;
      const uploadedTotal =
        payload.body instanceof Buffer ? payload.body.length : uploadedBytes;
      const speed =
        durationMs > 0
          ? ((uploadedTotal / durationMs) * 1000).toFixed(2)
          : 'n/a';
      this.logger.log(
        `YD upload complete: path=${tempPath}, bytes=${uploadedTotal}, time=${durationMs}ms, speed=${speed} B/s`,
      );

      const finalPath = useTempName
        ? await this.renameTempResource(tempPath, normalizedPath, overwrite)
        : normalizedPath;
      if (useTempName) {
        this.logger.log(`YD temp rename done: ${tempPath} -> ${finalPath}`);
      }

      return await this.getResource(finalPath, {
        fields:
          'name,path,size,mime_type,preview,sizes,resource_id,sha256,md5,file',
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message =
          this.extractErrorMessage(error) ?? error.message ?? 'Unknown error';
        this.logger.error(
          `Ошибка загрузки файла на Яндекс.Диск: ${normalizedPath}. Статус: ${status ?? 'no-response'}. ${message}`,
        );
      } else if (error instanceof Error) {
        this.logger.error(
          `Неизвестная ошибка загрузки файла на Яндекс.Диск: ${normalizedPath}. ${error.message}`,
        );
      } else {
        this.logger.error(
          `Неизвестная ошибка загрузки файла на Яндекс.Диск: ${normalizedPath}.`,
        );
      }
      throw this.wrapError(
        error,
        `Не удалось загрузить файл «${normalizedPath}»`,
      );
    }
  }

  async uploadExternalResource(params: {
    path: string;
    url: string;
    name?: string;
    disableRedirects?: boolean;
  }): Promise<YandexDiskUploadLink> {
    try {
      const response = await this.http.post<YandexDiskUploadLink>(
        '/resources/upload',
        null,
        {
          params: {
            path: params.path,
            url: params.url,
            name: params.name,
            disable_redirects: params.disableRedirects,
          },
        },
      );
      return response.data;
    } catch (error) {
      throw this.wrapError(
        error,
        `Не удалось инициировать загрузку внешнего ресурса в «${params.path}»`,
      );
    }
  }

  async copyResource(params: {
    from: string;
    path: string;
    overwrite?: boolean;
  }): Promise<YandexDiskUploadLink> {
    try {
      const response = await this.http.post<YandexDiskUploadLink>(
        '/resources/copy',
        null,
        {
          params: {
            from: params.from,
            path: params.path,
            overwrite: params.overwrite,
          },
        },
      );
      return response.data;
    } catch (error) {
      throw this.wrapError(
        error,
        `Не удалось скопировать ресурс из «${params.from}» в «${params.path}»`,
      );
    }
  }

  async moveResource(params: {
    from: string;
    path: string;
    overwrite?: boolean;
  }): Promise<YandexDiskUploadLink> {
    try {
      const response = await this.http.post<YandexDiskUploadLink>(
        '/resources/move',
        null,
        {
          params: {
            from: params.from,
            path: params.path,
            overwrite: params.overwrite,
          },
        },
      );
      return response.data;
    } catch (error) {
      throw this.wrapError(
        error,
        `Не удалось переместить ресурс из «${params.from}» в «${params.path}»`,
      );
    }
  }

  async publishResource(path: string): Promise<YandexDiskResource> {
    try {
      const response = await this.http.put<YandexDiskResource>(
        '/resources/publish',
        null,
        {
          params: { path },
        },
      );
      return response.data;
    } catch (error) {
      throw this.wrapError(error, `Не удалось опубликовать ресурс «${path}»`);
    }
  }

  async unpublishResource(path: string): Promise<YandexDiskResource> {
    try {
      const response = await this.http.put<YandexDiskResource>(
        '/resources/unpublish',
        null,
        {
          params: { path },
        },
      );
      return response.data;
    } catch (error) {
      throw this.wrapError(error, `Не удалось снять публикацию «${path}»`);
    }
  }

  async listFilesFlat(params?: {
    limit?: number;
    offset?: number;
    fields?: string;
    mediaType?: string;
    previewCrop?: boolean;
  }): Promise<YandexDiskListResponse> {
    try {
      const response = await this.http.get<YandexDiskListResponse>(
        '/resources/files',
        {
          params: {
            limit: params?.limit,
            offset: params?.offset,
            fields: params?.fields,
            media_type: params?.mediaType,
            preview_crop: params?.previewCrop,
          },
        },
      );
      return {
        items: response.data.items ?? [],
        limit: response.data.limit,
        offset: response.data.offset,
        total: response.data.total,
      };
    } catch (error) {
      throw this.wrapError(error, 'Не удалось получить список файлов');
    }
  }

  async listLastUploaded(params?: {
    limit?: number;
    mediaType?: string;
    fields?: string;
  }): Promise<YandexDiskListResponse> {
    try {
      const response = await this.http.get<YandexDiskListResponse>(
        '/resources/last-uploaded',
        {
          params: {
            limit: params?.limit,
            media_type: params?.mediaType,
            fields: params?.fields,
          },
        },
      );
      return {
        items: response.data.items ?? [],
        limit: response.data.limit,
        offset: response.data.offset,
        total: response.data.total,
      };
    } catch (error) {
      throw this.wrapError(
        error,
        'Не удалось получить список последних загруженных файлов',
      );
    }
  }

  async listPublicResources(params?: {
    limit?: number;
    offset?: number;
    type?: string;
    fields?: string;
  }): Promise<YandexDiskListResponse> {
    try {
      const response = await this.http.get<YandexDiskListResponse>(
        '/public/resources',
        {
          params: {
            limit: params?.limit,
            offset: params?.offset,
            type: params?.type,
            fields: params?.fields,
          },
        },
      );
      return {
        items: response.data.items ?? [],
        limit: response.data.limit,
        offset: response.data.offset,
        total: response.data.total,
      };
    } catch (error) {
      throw this.wrapError(
        error,
        'Не удалось получить список публичных ресурсов',
      );
    }
  }

  async getPublicResource(
    publicKey: string,
    params?: Record<string, unknown>,
  ): Promise<YandexDiskResource> {
    try {
      const response = await this.http.get<YandexDiskResource>(
        '/public/resources',
        {
          params: { public_key: publicKey, ...params },
        },
      );
      return response.data;
    } catch (error) {
      throw this.wrapError(
        error,
        `Не удалось получить публичный ресурс по ключу «${publicKey}»`,
      );
    }
  }

  async listTrashResources(params?: {
    path?: string;
    limit?: number;
    offset?: number;
    fields?: string;
  }): Promise<YandexDiskListResponse> {
    try {
      const response = await this.http.get<YandexDiskListResponse>(
        '/trash/resources',
        {
          params: {
            path: params?.path,
            limit: params?.limit,
            offset: params?.offset,
            fields: params?.fields,
          },
        },
      );
      return {
        items: response.data.items ?? [],
        limit: response.data.limit,
        offset: response.data.offset,
        total: response.data.total,
        path: response.data.path,
      };
    } catch (error) {
      throw this.wrapError(error, 'Не удалось получить корзину');
    }
  }

  async getTrashResource(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<YandexDiskResource> {
    try {
      const response = await this.http.get<YandexDiskResource>(
        '/trash/resources',
        {
          params: { path, ...params },
        },
      );
      return response.data;
    } catch (error) {
      throw this.wrapError(
        error,
        `Не удалось получить ресурс «${path}» из корзины`,
      );
    }
  }

  async restoreTrashResource(params: {
    path: string;
    name?: string;
    overwrite?: boolean;
  }): Promise<YandexDiskUploadLink> {
    try {
      const response = await this.http.put<YandexDiskUploadLink>(
        '/trash/resources/restore',
        null,
        {
          params: {
            path: params.path,
            name: params.name,
            overwrite: params.overwrite,
          },
        },
      );
      return response.data;
    } catch (error) {
      throw this.wrapError(
        error,
        `Не удалось восстановить ресурс «${params.path}» из корзины`,
      );
    }
  }

  async getOperationStatus(
    operationId: string,
  ): Promise<YandexDiskOperationStatus> {
    try {
      const response = await this.http.get<YandexDiskOperationStatus>(
        `/operations/${operationId}`,
      );
      return response.data;
    } catch (error) {
      throw this.wrapError(
        error,
        `Не удалось получить статус операции «${operationId}»`,
      );
    }
  }

  private canRefresh(): boolean {
    return Boolean(this.refreshToken && this.clientId && this.clientSecret);
  }

  private async ensureAccessToken(force = false): Promise<string> {
    if (
      !force &&
      this.accessToken &&
      (!this.expiresAt || this.expiresAt - 60_000 > Date.now())
    ) {
      return this.accessToken;
    }

    if (!this.canRefresh()) {
      if (this.accessToken) return this.accessToken;
      throw new UnauthorizedException(
        'OAuth-токен Яндекс.Диска не настроен. Добавьте YANDEX_DISK_TOKEN либо параметры client/refresh.',
      );
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshAccessToken();
    }

    await this.refreshPromise;
    this.refreshPromise = undefined;

    if (!this.accessToken) {
      throw new UnauthorizedException('Не удалось обновить токен Яндекс.Диска');
    }

    return this.accessToken;
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken || !this.clientId || !this.clientSecret) {
      this.logger.warn(
        'Запрошено обновление токена, но refresh-параметры отсутствуют',
      );
      return;
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      });

      const response = await axios.post<OAuthTokenResponse>(
        this.oauthEndpoint,
        body.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          auth: {
            username: this.clientId,
            password: this.clientSecret,
          },
          timeout: this.config.get<number>('YANDEX_DISK_OAUTH_TIMEOUT', 10_000),
        },
      );

      this.accessToken = response.data.access_token ?? null;
      const expiresIn = Number(response.data.expires_in);
      this.expiresAt = Number.isFinite(expiresIn)
        ? Date.now() + Math.max(expiresIn - 60, 0) * 1_000
        : undefined;
    } catch (error) {
      const trace = error instanceof Error ? error.stack : undefined;
      this.logger.error('Ошибка обновления OAuth-токена Яндекс.Диска', trace);
      throw this.wrapError(
        error,
        'Не удалось обновить OAuth-токен Яндекс.Диска',
      );
    }
  }

  private wrapError(
    error: unknown,
    fallback = 'Ошибка запроса к Яндекс.Диску',
  ): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const messageFromApi = this.extractErrorMessage(error);
      const finalMessage =
        messageFromApi ??
        (status
          ? `${fallback}. Код Яндекс.Диска: ${status}`
          : `${fallback}. Ответ от Яндекс.Диска отсутствует`);

      if (status) {
        this.logger.error(
          `YandexDisk API error. Status: ${status}. Message: ${messageFromApi ?? error.message ?? 'unknown'}`,
        );
      } else if (error.code === 'ECONNABORTED') {
        this.logger.error(`YandexDisk API timeout. Message: ${error.message}`);
      }

      switch (status) {
        case 400:
          throw new BadRequestException(finalMessage);
        case 401:
          throw new UnauthorizedException(finalMessage);
        case 403:
          throw new ForbiddenException(finalMessage);
        case 404:
          throw new NotFoundException(finalMessage);
        case 423:
        case 429:
          throw new ServiceUnavailableException(finalMessage);
        case 500:
        case 503:
          throw new ServiceUnavailableException(finalMessage);
        case 507:
          throw new ServiceUnavailableException(
            `${finalMessage}. Возможная причина: недостаточно свободного места на Яндекс.Диске`,
          );
        default:
          if (error.code === 'ECONNABORTED') {
            throw new ServiceUnavailableException(
              `${finalMessage}. Превышено время ожидания ответа от Яндекс.Диска`,
            );
          }
          throw new InternalServerErrorException(finalMessage);
      }
    }

    if (error instanceof Error) {
      throw new InternalServerErrorException(error.message);
    }

    throw new InternalServerErrorException(fallback);
  }

  private extractErrorMessage(error: AxiosError): string | undefined {
    const data = error.response?.data as YandexDiskErrorDetails | undefined;
    if (!data) return undefined;

    const candidates = [
      data.message,
      data.error,
      data.description,
      data.error_description,
      data.reason,
    ].filter(Boolean) as string[];

    if (candidates.length) {
      return candidates.join('; ');
    }

    const details = data.details;
    if (Array.isArray(details) && details.length) {
      return details
        .map((d) => d?.message ?? d?.description)
        .filter(Boolean)
        .join('; ');
    }

    if (typeof error.response?.data === 'string') {
      return error.response?.data as string;
    }

    return undefined;
  }

  private extractExtension(path: string): string {
    const match = path.match(/\.[^./\\]+$/);
    return match ? match[0].toLowerCase() : '';
  }

  private buildTempPath(originalPath: string, extension: string): string {
    const withoutExt = originalPath.slice(0, -extension.length);
    return `${withoutExt}.${Date.now()}__temp`;
  }

  private async renameTempResource(
    tempPath: string,
    finalPath: string,
    overwrite: boolean,
  ): Promise<string> {
    this.logger.log(
      `YD rename temp resource: from=${tempPath} to=${finalPath}, overwrite=${overwrite}`,
    );

    await this.http.post<YandexDiskUploadLink>('/resources/move', null, {
      params: {
        from: tempPath,
        path: finalPath,
        overwrite,
      },
      headers: {
        'User-Agent': this.uploadUserAgent,
      },
    });

    return finalPath;
  }
}
