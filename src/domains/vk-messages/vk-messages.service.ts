import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import axios, { AxiosInstance } from 'axios';
import * as FormData from 'form-data';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';

const VK_API_VERSION = '5.199';
const VK_POLL_INTERVAL_MS = 3000;
const VK_STREAM_PING_MS = 15000;
const VK_DEFAULT_POLL_SOURCES = ['easybook', 'easyneon'];

type VkRealtimeReason = 'poll' | 'send';

interface VkRealtimePayload {
  source: string;
  type: 'conversations.updated';
  reason: VkRealtimeReason;
  ts: number;
}

@Injectable()
export class VkMessagesProxyService {
  private readonly logger = new Logger(VkMessagesProxyService.name);
  private readonly http: AxiosInstance;
  private readonly updates$ = new Subject<VkRealtimePayload>();
  private readonly signaturesBySource = new Map<string, string>();
  private readonly pollSources: string[];
  private readonly pollEnabled: boolean;
  private isPollInProgress = false;

  constructor(private readonly config: ConfigService) {
    const baseURL =
      this.config.get<string>('VK_SERVICE_URL') || 'http://127.0.0.1:5013';

    const timeoutMs = Number(
      this.config.get<string>('VK_SERVICE_TIMEOUT_MS') ?? 15000,
    );

    this.http = axios.create({
      baseURL,
      timeout: timeoutMs,
    });

    this.pollSources = this.resolvePollSources();
    this.pollEnabled =
      String(this.config.get<string>('VK_MESSAGES_POLL_ENABLED') ?? 'true') !==
      'false';
  }

  async get(path: string, params?: Record<string, unknown>) {
    return this.request('get', path, undefined, params);
  }

  async post(path: string, body?: Record<string, unknown>) {
    return this.request('post', path, body);
  }

  async postMultipart(
    path: string,
    body: Record<string, unknown> = {},
    files: Express.Multer.File[] = [],
  ) {
    const formData = new FormData();

    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item === undefined || item === null) continue;
          formData.append(key, String(item));
        }
        continue;
      }

      if (typeof value === 'object') {
        formData.append(key, JSON.stringify(value));
        continue;
      }

      formData.append(key, String(value));
    }

    for (const file of files) {
      if (!file?.buffer) continue;
      formData.append('files', file.buffer, {
        filename: file.originalname || 'file',
        contentType: file.mimetype || 'application/octet-stream',
      });
    }

    return this.requestMultipart(path, formData);
  }

  stream(source?: string): Observable<MessageEvent> {
    const normalizedSource = this.normalizeSource(source);

    const updates = this.updates$.pipe(
      filter((event) =>
        normalizedSource ? event.source === normalizedSource : true,
      ),
      map(
        (event): MessageEvent => ({
          type: 'vk-update',
          data: event,
          retry: 5000,
        }),
      ),
    );

    const ping = interval(VK_STREAM_PING_MS).pipe(
      map(
        (): MessageEvent => ({
          type: 'ping',
          data: { ts: Date.now() },
        }),
      ),
    );

    return merge(updates, ping);
  }

  notifySourceUpdated(source: string, reason: VkRealtimeReason = 'poll') {
    const normalizedSource = this.normalizeSource(source);
    if (!normalizedSource) return;

    this.updates$.next({
      source: normalizedSource,
      type: 'conversations.updated',
      reason,
      ts: Date.now(),
    });
  }

  @Interval(VK_POLL_INTERVAL_MS)
  async pollConversations() {
    if (!this.pollEnabled || this.isPollInProgress) {
      return;
    }

    this.isPollInProgress = true;
    try {
      for (const source of this.pollSources) {
        await this.pollConversationsBySource(source);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown poll error';
      this.logger.warn(`VK poll error: ${message}`);
    } finally {
      this.isPollInProgress = false;
    }
  }

  private async pollConversationsBySource(source: string) {
    const result = await this.post('/api/vk/messages/get-conversations', {
      source,
      v: VK_API_VERSION,
      count: 40,
      filter: 'all',
      extended: 0,
    });

    if (result.status >= 400) {
      return;
    }

    const nextSignature = this.buildConversationsSignature(result.data);
    if (!nextSignature) {
      return;
    }

    const prevSignature = this.signaturesBySource.get(source);
    this.signaturesBySource.set(source, nextSignature);

    if (prevSignature && prevSignature !== nextSignature) {
      this.notifySourceUpdated(source, 'poll');
    }
  }

  private buildConversationsSignature(payload: unknown): string | null {
    if (!this.isRecord(payload)) return null;

    const responseRaw = payload.response;
    if (!this.isRecord(responseRaw)) return null;

    const itemsRaw = responseRaw.items;
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];

    const digest = items.slice(0, 40).map((rawItem) => {
      if (!this.isRecord(rawItem)) return {};
      const conversation = this.isRecord(rawItem.conversation)
        ? rawItem.conversation
        : null;
      const peer = conversation && this.isRecord(conversation.peer)
        ? conversation.peer
        : null;
      const lastMessage = this.isRecord(rawItem.last_message)
        ? rawItem.last_message
        : null;

      return {
        peerId: this.asNumber(peer?.id),
        messageId: this.asNumber(lastMessage?.id),
        date: this.asNumber(lastMessage?.date),
        fromId: this.asNumber(lastMessage?.from_id),
        text: this.asString(lastMessage?.text),
      };
    });

    const signaturePayload = {
      count: this.asNumber(responseRaw.count),
      unreadCount: this.asNumber(responseRaw.unread_count),
      digest,
    };

    return JSON.stringify(signaturePayload);
  }

  private resolvePollSources(): string[] {
    const raw = this.config.get<string>('VK_MESSAGES_POLL_SOURCES') || '';
    const parsed = raw
      .split(',')
      .map((source) => source.trim().toLowerCase())
      .filter(Boolean);

    if (parsed.length > 0) {
      return parsed;
    }

    return VK_DEFAULT_POLL_SOURCES;
  }

  private normalizeSource(source?: string): string {
    if (!source) return '';
    return source.trim().toLowerCase();
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private asNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const nextValue = Number(value);
      return Number.isFinite(nextValue) ? nextValue : 0;
    }
    return 0;
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private buildHeaders() {
    const headers: Record<string, string> = {};
    const token = this.config.get<string>('VK_SERVICE_INTERNAL_TOKEN');

    if (token) {
      headers['x-internal-token'] = token;
    }

    return headers;
  }

  private async request(
    method: 'get' | 'post',
    path: string,
    body?: Record<string, unknown>,
    params?: Record<string, unknown>,
  ) {
    try {
      const response = await this.http.request({
        method,
        url: path,
        data: body,
        params,
        headers: this.buildHeaders(),
      });

      return { status: response.status, data: response.data };
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response) {
        return { status: error.response.status, data: error.response.data };
      }

      this.logger.error('VK proxy error', error?.message || String(error));
      return { status: 502, data: { error: 'VK_SERVICE_UNAVAILABLE' } };
    }
  }

  private async requestMultipart(path: string, formData: FormData) {
    try {
      const response = await this.http.request({
        method: 'post',
        url: path,
        data: formData,
        headers: {
          ...this.buildHeaders(),
          ...formData.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      return { status: response.status, data: response.data };
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response) {
        return { status: error.response.status, data: error.response.data };
      }

      this.logger.error('VK proxy multipart error', error?.message || String(error));
      return { status: 502, data: { error: 'VK_SERVICE_UNAVAILABLE' } };
    }
  }
}
