import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { CdekService } from 'src/services/cdek.service';
import { CdekTrackSyncResult, CdekTrackSyncService } from './cdek-track-sync.service';
import { CdekHttpGuard, isAuthError } from './cdek-http-guard.util';
import { CdekAlertService } from './cdek-alert.service';
import { CdekJobLockService } from './cdek-job-lock.service';

export type CdekWebhookReconcileOptions = {
  type?: string;
  webhookUrl?: string;
  printRaw?: boolean;
  syncAfterCheck?: boolean;
  syncFast?: boolean;
};

export type CdekWebhookReconcileResult = {
  hasWebhook: boolean;
  created: boolean;
  totalWebhooks: number;
  typeCount: number;
  urlCount: number;
  typeUrlCount: number;
  sync: CdekTrackSyncResult | null;
  locked?: boolean;
};

@Injectable()
export class CdekWebhookReconcileService {
  private readonly logger = new Logger(CdekWebhookReconcileService.name);
  private readonly httpGuard = new CdekHttpGuard('cdek-webhook-reconcile');
  private readonly lockTtlMs =
    Math.max(1, Number(process.env.CDEK_RECONCILE_LOCK_TTL_MINUTES) || 20) *
    60_000;
  private readonly lockWaitMs = Math.max(
    0,
    Number(process.env.CDEK_RECONCILE_LOCK_WAIT_MS) || 0,
  );

  constructor(
    private readonly cdekService: CdekService,
    private readonly trackSyncService: CdekTrackSyncService,
    private readonly alertService: CdekAlertService,
    private readonly jobLockService: CdekJobLockService,
  ) {}

  private normalizeWebhooks(payload: any): Array<Record<string, any>> {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.webhooks)) return payload.webhooks;
    if (payload?.entity) return [payload.entity];
    return [];
  }

  private async getAccessToken() {
    return this.httpGuard.execute('oauth/token', async () =>
      this.cdekService.getAccessToken(),
    );
  }

  private async getWebhooks(token: string) {
    return this.httpGuard.execute('webhooks/list', async () => {
      const response = await axios.get('https://api.cdek.ru/v2/webhooks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    });
  }

  private async createWebhook(token: string, type: string, webhookUrl: string) {
    return this.httpGuard.execute('webhooks/create', async () => {
      const response = await axios.post(
        'https://api.cdek.ru/v2/webhooks',
        { type, url: webhookUrl },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      return response.data;
    });
  }

  async reconcile(
    options: CdekWebhookReconcileOptions = {},
  ): Promise<CdekWebhookReconcileResult> {
    const lock = await this.jobLockService.acquire('cdek-webhook-reconcile', {
      ttlMs: this.lockTtlMs,
      waitMs: this.lockWaitMs,
    });

    if (!lock) {
      this.logger.warn(
        '[CDEK Reconcile] skipped: another reconcile run is in progress',
      );
      return {
        hasWebhook: false,
        created: false,
        totalWebhooks: 0,
        typeCount: 0,
        urlCount: 0,
        typeUrlCount: 0,
        sync: null,
        locked: true,
      };
    }

    try {
    const type = (options.type || 'ORDER_STATUS').trim();
    const webhookUrl = (
      options.webhookUrl || process.env.WEBHOOK_URL || ''
    ).trim();
    const printRaw = Boolean(options.printRaw);
    const syncAfterCheck = options.syncAfterCheck !== false;
    const syncFast = options.syncFast !== false;

    if (!webhookUrl) {
      throw new Error('WEBHOOK_URL is required');
    }

    let token = await this.getAccessToken();
    let payload: any;
    try {
      payload = await this.getWebhooks(token);
    } catch (error) {
      if (!isAuthError(error)) {
        throw error;
      }
      token = await this.getAccessToken();
      payload = await this.getWebhooks(token);
    }

    if (printRaw) {
      this.logger.log('[CDEK Reconcile] Raw webhooks payload');
      console.dir(payload, { depth: null, colors: true });
    }

    const items = this.normalizeWebhooks(payload);
    let typeCount = 0;
    let urlCount = 0;
    let typeUrlCount = 0;

    for (const item of items) {
      const itemType = String(item?.type || '');
      const itemUrl = String(item?.url || '');
      if (itemType === type) typeCount += 1;
      if (itemUrl === webhookUrl) urlCount += 1;
      if (itemType === type && itemUrl === webhookUrl) typeUrlCount += 1;
    }

    const missingBeforeReconcile = typeUrlCount === 0;
    let hasWebhook = !missingBeforeReconcile;
    let created = false;

    if (!hasWebhook) {
      try {
        let createResponse: any;
        try {
          createResponse = await this.createWebhook(token, type, webhookUrl);
        } catch (error) {
          if (!isAuthError(error)) {
            throw error;
          }
          token = await this.getAccessToken();
          createResponse = await this.createWebhook(token, type, webhookUrl);
        }
        hasWebhook = true;
        created = true;
        this.logger.log(
          `[CDEK Reconcile] Webhook created: ${JSON.stringify(createResponse)}`,
        );
      } catch (error) {
        await this.alertService.notifyWebhookRegistrationFailed({
          type,
          webhookUrl,
          error,
        });
        throw error;
      }
    }

    await this.alertService.recordWebhookCheck({
      missing: missingBeforeReconcile,
      created,
      type,
      webhookUrl,
      totalWebhooks: items.length,
    });

    let sync: CdekTrackSyncResult | null = null;
    if (syncAfterCheck) {
      sync = await this.trackSyncService.syncTracks({ fast: syncFast });
      await this.alertService.inspectSyncResult(sync);
    }

    return {
      hasWebhook,
      created,
      totalWebhooks: items.length,
      typeCount,
      urlCount,
      typeUrlCount,
      sync,
    };
    } finally {
      await lock.release();
    }
  }
}
