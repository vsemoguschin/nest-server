import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CdekTrackSyncService } from '../domains/webhooks/cdek-track-sync.service';

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
  const track = (readArgValue('track') || process.env.CDEK_TRACK || '').trim();
  const printResponse =
    hasFlag('print') || process.env.CDEK_PRINT_RESPONSE === '1';
  const fast = hasFlag('fast') || process.env.CDEK_SEED_FAST === '1';
  const skipDelivered = process.env.CDEK_SKIP_DELIVERED !== '0';

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const syncService = app.get(CdekTrackSyncService);
    const result = await syncService.syncTracks({
      track,
      printResponse,
      fast,
      skipDelivered,
    });
    if (result.locked) {
      console.log('[CDEK Seed] Skipped: sync lock is busy');
      return;
    }
    console.log(
      `[CDEK Seed] Done. tracks=${result.tracksTotal} updated=${result.updated} skipped=${result.skipped} failed=${result.failed}`,
    );
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error('[CDEK Seed] Fatal error', error);
  process.exitCode = 1;
});
