import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';

function getYYYYMMDD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseArgs(): { dateFrom: string; dateTo: string } {
  const argv = process.argv.slice(2);

  const get = (flag: string) => {
    const entry = argv.find((a) => a.startsWith(`--${flag}=`));
    return entry ? entry.slice(flag.length + 3) : undefined;
  };

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(today.getDate() - 2);

  const dateFrom = get('dateFrom') ?? getYYYYMMDD(twoDaysAgo);
  const dateTo = get('dateTo') ?? getYYYYMMDD(yesterday);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    throw new Error(`--dateFrom must be YYYY-MM-DD, got: ${dateFrom}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    throw new Error(`--dateTo must be YYYY-MM-DD, got: ${dateTo}`);
  }
  if (dateTo < dateFrom) {
    throw new Error(`--dateTo (${dateTo}) must be >= --dateFrom (${dateFrom})`);
  }

  return { dateFrom, dateTo };
}

function buildDaysRange(dateFrom: string, dateTo: string): string[] {
  const days: string[] = [];
  const cursor = new Date(dateFrom + 'T00:00:00Z');
  const end = new Date(dateTo + 'T00:00:00Z');
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

async function main() {
  const { dateFrom, dateTo } = parseArgs();
  const days = buildDaysRange(dateFrom, dateTo);

  console.log(
    `[vk-ads-sync-expenses] Starting expense sync for dates: ${days.join(', ')}`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const scheduler = app.get(NotificationSchedulerService);
    const results = await scheduler.runVkAdsExpenseSync(days);

    console.log('[vk-ads-sync-expenses] Results:');
    for (const line of results) {
      console.log(`  ${line}`);
    }
    console.log(`[vk-ads-sync-expenses] Done. ${results.length} entries processed.`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('[vk-ads-sync-expenses] fatal:', error);
  process.exit(1);
});
