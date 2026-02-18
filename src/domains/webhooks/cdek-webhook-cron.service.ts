import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CdekAlertService } from './cdek-alert.service';
import { CdekTrackSyncService } from './cdek-track-sync.service';
import { CdekWebhookReconcileService } from './cdek-webhook-reconcile.service';

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value == null) return defaultValue;
  return ['1', 'true', 'yes'].includes(value.toLowerCase());
}

const CDEK_CRON_TZ = process.env.CDEK_CRON_TIMEZONE || 'Europe/Moscow';
const CDEK_RECONCILE_CRON =
  process.env.CDEK_RECONCILE_CRON || '0 */30 * * * *';
const CDEK_DELTA_SYNC_CRON =
  process.env.CDEK_DELTA_SYNC_CRON || '0 10 * * * *';
const CDEK_FULL_SYNC_CRON = process.env.CDEK_FULL_SYNC_CRON || '0 30 3 * * *';

const CDEK_CRON_ENABLED = parseBoolean(
  process.env.CDEK_CRON_ENABLED,
  (process.env.NODE_ENV ?? 'development') === 'production',
);
const CDEK_RECONCILE_ENABLED =
  CDEK_CRON_ENABLED &&
  parseBoolean(process.env.CDEK_RECONCILE_ENABLED, true);
const CDEK_DELTA_SYNC_ENABLED =
  CDEK_CRON_ENABLED &&
  parseBoolean(process.env.CDEK_DELTA_SYNC_ENABLED, true);
const CDEK_FULL_SYNC_ENABLED =
  CDEK_CRON_ENABLED &&
  parseBoolean(process.env.CDEK_FULL_SYNC_ENABLED, false);

@Injectable()
export class CdekWebhookCronService {
  private readonly logger = new Logger(CdekWebhookCronService.name);
  private readonly fullSyncConcurrency = Math.max(
    1,
    Number(process.env.CDEK_FULL_SYNC_CONCURRENCY) || 2,
  );
  private readonly fullSyncMinIntervalMs = Math.max(
    0,
    Number(process.env.CDEK_FULL_SYNC_MIN_INTERVAL_MS) || 250,
  );

  constructor(
    private readonly reconcileService: CdekWebhookReconcileService,
    private readonly trackSyncService: CdekTrackSyncService,
    private readonly alertService: CdekAlertService,
  ) {}

  @Cron(CDEK_RECONCILE_CRON, {
    name: 'cdek_reconcile',
    timeZone: CDEK_CRON_TZ,
    waitForCompletion: true,
    disabled: !CDEK_RECONCILE_ENABLED,
  })
  async reconcileWebhookJob() {
    try {
      const result = await this.reconcileService.reconcile({
        syncAfterCheck: false,
      });
      if (result.locked) {
        this.logger.warn('[CDEK Cron] reconcile skipped (lock busy)');
        return;
      }
      this.logger.log(
        `[CDEK Cron] reconcile done hasWebhook=${result.hasWebhook} created=${result.created} total=${result.totalWebhooks} typeUrlCount=${result.typeUrlCount}`,
      );
    } catch (error) {
      this.logger.error(
        `[CDEK Cron] reconcile failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  @Cron(CDEK_DELTA_SYNC_CRON, {
    name: 'cdek_delta_sync',
    timeZone: CDEK_CRON_TZ,
    waitForCompletion: true,
    disabled: !CDEK_DELTA_SYNC_ENABLED,
  })
  async deltaSyncJob() {
    try {
      const result = await this.trackSyncService.syncTracks({
        fast: true,
        skipDelivered: true,
      });
      if (result.locked) {
        this.logger.warn('[CDEK Cron] delta-sync skipped (lock busy)');
        return;
      }
      await this.alertService.inspectSyncResult(result);
      this.logger.log(
        `[CDEK Cron] delta-sync done tracks=${result.tracksTotal} updated=${result.updated} skipped=${result.skipped} failed=${result.failed}`,
      );
    } catch (error) {
      this.logger.error(
        `[CDEK Cron] delta-sync failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  @Cron(CDEK_FULL_SYNC_CRON, {
    name: 'cdek_full_sync',
    timeZone: CDEK_CRON_TZ,
    waitForCompletion: true,
    disabled: !CDEK_FULL_SYNC_ENABLED,
  })
  async fullSyncJob() {
    try {
      const result = await this.trackSyncService.syncTracks({
        fast: false,
        skipDelivered: false,
        concurrency: this.fullSyncConcurrency,
        minIntervalMs: this.fullSyncMinIntervalMs,
      });
      if (result.locked) {
        this.logger.warn('[CDEK Cron] full-sync skipped (lock busy)');
        return;
      }
      await this.alertService.inspectSyncResult(result);
      this.logger.log(
        `[CDEK Cron] full-sync done tracks=${result.tracksTotal} updated=${result.updated} skipped=${result.skipped} failed=${result.failed}`,
      );
    } catch (error) {
      this.logger.error(
        `[CDEK Cron] full-sync failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
