import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CdekWebhookReconcileService } from '../domains/webhooks/cdek-webhook-reconcile.service';

function readArgValue(name: string): string | null {
  const flag = `--${name}`;
  const arg = process.argv.find(
    (item) => item === flag || item.startsWith(`${flag}=`),
  );
  if (!arg) return null;
  if (arg === flag) {
    const index = process.argv.indexOf(arg);
    const next = process.argv[index + 1];
    if (!next || next.startsWith('--')) return null;
    return next;
  }
  const [, value] = arg.split('=');
  return value ?? null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function run() {
  const type = (readArgValue('type') || 'ORDER_STATUS').trim();
  const webhookUrl = (readArgValue('url') || process.env.WEBHOOK_URL || '').trim();
  const printRaw = hasFlag('print');
  const syncAfterCheck = !hasFlag('no-sync');
  const syncFast = !hasFlag('no-fast');

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const reconcileService = app.get(CdekWebhookReconcileService);
    const result = await reconcileService.reconcile({
      type,
      webhookUrl,
      printRaw,
      syncAfterCheck,
      syncFast,
    });

    if (result.locked) {
      console.log('[CDEK Reconcile] skipped: reconcile lock is busy');
      return;
    }

    console.log(
      `[CDEK Reconcile] hasWebhook=${result.hasWebhook} created=${result.created} total=${result.totalWebhooks} typeCount=${result.typeCount} urlCount=${result.urlCount} typeUrlCount=${result.typeUrlCount}`,
    );
    if (result.sync) {
      console.log(
        `[CDEK Reconcile] sync tracks=${result.sync.tracksTotal} updated=${result.sync.updated} skipped=${result.sync.skipped} failed=${result.sync.failed}`,
      );
    } else {
      console.log('[CDEK Reconcile] sync skipped');
    }
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error('[CDEK Reconcile] Fatal error', error);
  process.exitCode = 1;
});
