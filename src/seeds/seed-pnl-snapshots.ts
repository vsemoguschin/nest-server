import 'reflect-metadata';
import 'tsconfig-paths/register';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { PnlService } from '../domains/pnl/pnl.service';

function ymInMoscow(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
  }).format(d);
}

function addMonthsYm(ym: string, months: number): string {
  const [y, m] = ym.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  const y2 = dt.getUTCFullYear();
  const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${y2}-${m2}`;
}

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

async function withAdvisoryLock<T>(
  prisma: PrismaService,
  key1: number,
  key2: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const lockId = (BigInt(key1) << 32n) + BigInt(key2);
  const locked = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${lockId}) as locked
  `;
  if (!locked?.[0]?.locked) return null;
  try {
    return await fn();
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})`;
  }
}

async function upsertPnlSnapshot(
  prisma: PrismaService,
  type: 'neon' | 'book',
  anchorPeriod: string,
  payload: unknown,
  version = 1,
) {
  const payloadJson = JSON.stringify(payload);
  await prisma.$executeRaw`
    INSERT INTO "PnlSnapshot" ("type","anchorPeriod","payload","version","computedAt","createdAt","updatedAt")
    VALUES (${type}, ${anchorPeriod}, ${payloadJson}::jsonb, ${version}, now(), now(), now())
    ON CONFLICT ("type","anchorPeriod")
    DO UPDATE SET
      "payload" = EXCLUDED."payload",
      "version" = EXCLUDED."version",
      "computedAt" = EXCLUDED."computedAt",
      "updatedAt" = now()
  `;
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const pnl = app.get(PnlService);

    const periodArg = getArg('period'); // YYYY-MM
    const yearArg = getArg('year'); // YYYY
    const typeArg = (getArg('type') || 'all').toLowerCase(); // neon|book|all

    const currentYm = ymInMoscow(new Date());
    const currentYear = currentYm.slice(0, 4);
    const currentMonth = parseInt(currentYm.slice(5, 7), 10);
    const year = yearArg || currentYear;
    const monthsCount = year === currentYear ? currentMonth : 12;

    const types: Array<'neon' | 'book'> =
      typeArg === 'neon' ? ['neon'] : typeArg === 'book' ? ['book'] : ['neon', 'book'];

    const periods = periodArg
      ? [periodArg]
      : Array.from({ length: monthsCount }, (_, i) => {
          const mm = String(i + 1).padStart(2, '0');
          return `${year}-${mm}`;
        });

    console.log(`[PNL Snapshot Seed] types=${types.join(',')} periods=${periods.join(',')}`);

    const lockResult = await withAdvisoryLock(prisma, 2025, 2200, async () => {
      for (const period of periods) {
        for (const type of types) {
          const startedAt = Date.now();
          console.log(`[PNL Snapshot Seed] Collect ${type} ${period}...`);
          const payload =
            type === 'neon'
              ? await pnl.getNeonPLDatas(period)
              : await pnl.getBookPLDatas(period);
          await upsertPnlSnapshot(prisma, type, period, payload, 1);
          console.log(
            `[PNL Snapshot Seed] Saved ${type} ${period} in ${Date.now() - startedAt}ms`,
          );
        }
      }
    });

    if (lockResult === null) {
      console.warn(
        '[PNL Snapshot Seed] Another instance holds the lock; try again later.',
      );
      process.exitCode = 2;
      return;
    }

    console.log('[PNL Snapshot Seed] Done');
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
