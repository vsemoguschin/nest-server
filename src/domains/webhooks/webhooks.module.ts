import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { CdekService } from 'src/services/cdek.service';
import { CdekTrackSyncService } from './cdek-track-sync.service';
import { CdekWebhookReconcileService } from './cdek-webhook-reconcile.service';
import { CdekAlertService } from './cdek-alert.service';
import { TelegramService } from 'src/services/telegram.service';
import { CdekJobLockService } from './cdek-job-lock.service';
import { CdekWebhookCronService } from './cdek-webhook-cron.service';

@Module({
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    CdekService,
    CdekTrackSyncService,
    CdekWebhookReconcileService,
    CdekAlertService,
    CdekJobLockService,
    CdekWebhookCronService,
    TelegramService,
  ],
  exports: [
    CdekTrackSyncService,
    CdekWebhookReconcileService,
    CdekAlertService,
    CdekJobLockService,
  ],
})
export class WebhooksModule {}
