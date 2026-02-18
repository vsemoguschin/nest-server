import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TelegramService } from 'src/services/telegram.service';
import { CdekTrackSyncResult } from './cdek-track-sync.service';

type AlertState = {
  webhookMissingStreak: number;
  lastAlerts: Record<string, number>;
};

const DEFAULT_STATE: AlertState = {
  webhookMissingStreak: 0,
  lastAlerts: {},
};

@Injectable()
export class CdekAlertService {
  private readonly logger = new Logger(CdekAlertService.name);
  private readonly env = process.env.NODE_ENV ?? 'development';
  private readonly enabled = (() => {
    const raw = process.env.CDEK_ALERTS_ENABLED;
    if (raw == null) return this.env === 'production';
    return ['1', 'true', 'yes'].includes(raw.toLowerCase());
  })();
  private readonly chatIds = (
    process.env.CDEK_ALERT_CHAT_IDS ??
    process.env.TELEGRAM_CRITICAL_CHAT_IDS ??
    ''
  )
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  private readonly stateFile =
    process.env.CDEK_ALERT_STATE_FILE || '/tmp/easycrm-cdek-alert-state.json';
  private readonly missingStreakThreshold = Math.max(
    1,
    Number(process.env.CDEK_ALERT_MISSING_STREAK_THRESHOLD) || 3,
  );
  private readonly cooldownMs =
    Math.max(1, Number(process.env.CDEK_ALERT_COOLDOWN_MINUTES) || 180) * 60_000;
  private readonly syncFailedAbsThreshold = Math.max(
    1,
    Number(process.env.CDEK_ALERT_SYNC_FAILED_ABS) || 20,
  );
  private readonly syncFailedRateThreshold = Math.min(
    1,
    Math.max(0, Number(process.env.CDEK_ALERT_SYNC_FAILED_RATE) || 0.4),
  );

  constructor(private readonly telegram: TelegramService) {}

  private async loadState(): Promise<AlertState> {
    try {
      const raw = await fs.readFile(this.stateFile, 'utf-8');
      const parsed = JSON.parse(raw) as AlertState;
      return {
        webhookMissingStreak:
          Number(parsed.webhookMissingStreak) > 0
            ? Number(parsed.webhookMissingStreak)
            : 0,
        lastAlerts: parsed.lastAlerts ?? {},
      };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  private async saveState(state: AlertState): Promise<void> {
    try {
      const dir = path.dirname(this.stateFile);
      await fs.mkdir(dir, { recursive: true });
      const tmp = `${this.stateFile}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(state), 'utf-8');
      await fs.rename(tmp, this.stateFile);
    } catch (error) {
      this.logger.warn(
        `Unable to persist CDEK alert state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async sendAlert(key: string, text: string): Promise<void> {
    if (!this.enabled || this.chatIds.length === 0) {
      return;
    }

    const state = await this.loadState();
    const now = Date.now();
    const lastSentAt = state.lastAlerts[key] ?? 0;
    if (now - lastSentAt < this.cooldownMs) {
      return;
    }

    await Promise.allSettled(
      this.chatIds.map((chatId) => this.telegram.sendToChat(chatId, text, true)),
    );

    state.lastAlerts[key] = now;
    await this.saveState(state);
  }

  async recordWebhookCheck(params: {
    missing: boolean;
    created: boolean;
    type: string;
    webhookUrl: string;
    totalWebhooks: number;
  }): Promise<void> {
    const state = await this.loadState();

    if (params.missing) {
      state.webhookMissingStreak += 1;
    } else {
      state.webhookMissingStreak = 0;
    }

    await this.saveState(state);

    if (state.webhookMissingStreak >= this.missingStreakThreshold) {
      await this.sendAlert(
        'cdek_webhook_missing_streak',
        [
          '<b>⚠️ CDEK webhook missing streak</b>',
          `Env: ${this.env}`,
          `Type: ${params.type}`,
          `URL: ${params.webhookUrl}`,
          `Streak: ${state.webhookMissingStreak}`,
          `Auto-created this run: ${params.created ? 'yes' : 'no'}`,
          `Total webhooks in CDEK: ${params.totalWebhooks}`,
        ].join('\n'),
      );
    }
  }

  async notifyWebhookRegistrationFailed(params: {
    type: string;
    webhookUrl: string;
    error: unknown;
  }): Promise<void> {
    const message = [
      '<b>❌ CDEK webhook registration failed</b>',
      `Env: ${this.env}`,
      `Type: ${params.type}`,
      `URL: ${params.webhookUrl}`,
      `Error: ${
        params.error instanceof Error ? params.error.message : String(params.error)
      }`,
    ].join('\n');
    await this.sendAlert('cdek_webhook_registration_failed', message);
  }

  async inspectSyncResult(result: CdekTrackSyncResult): Promise<void> {
    if (!result.tracksTotal) {
      return;
    }

    const failedRate = result.failed / result.tracksTotal;
    const failedTooMuch =
      result.failed >= this.syncFailedAbsThreshold ||
      failedRate >= this.syncFailedRateThreshold;

    if (!failedTooMuch) {
      return;
    }

    await this.sendAlert(
      'cdek_sync_failed_anomaly',
      [
        '<b>⚠️ CDEK sync anomaly</b>',
        `Env: ${this.env}`,
        `Tracks: ${result.tracksTotal}`,
        `Updated: ${result.updated}`,
        `Skipped: ${result.skipped}`,
        `Failed: ${result.failed}`,
        `Failed rate: ${(failedRate * 100).toFixed(1)}%`,
      ].join('\n'),
    );
  }
}
