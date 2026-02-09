import 'dotenv/config';
import axios, { AxiosError } from 'axios';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CDEK_ACCOUNT = process.env.CDEK_ACCOUNT;
const CDEK_PASSWORD = process.env.CDEK_PASSWORD;
const PACE_MS = Math.max(0, Number(process.env.CDEK_SEED_PACE_MS) || 200);
const CDEK_TRACK = (process.env.CDEK_TRACK || '').trim();
const CDEK_PRINT_RESPONSE = process.env.CDEK_PRINT_RESPONSE === '1';
const CDEK_FAST = process.env.CDEK_SEED_FAST === '1';

if (!CDEK_ACCOUNT || !CDEK_PASSWORD) {
  console.error('[CDEK Seed] Missing CDEK_ACCOUNT or CDEK_PASSWORD');
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readArgValue(name: string): string | null {
  const flag = `--${name}`;
  const arg = process.argv.find((item) => item === flag || item.startsWith(`${flag}=`));
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

async function getAccessToken(): Promise<string> {
  if (!CDEK_ACCOUNT || !CDEK_PASSWORD) {
    throw new Error('Missing CDEK_ACCOUNT or CDEK_PASSWORD');
  }

  const response = await axios.post(
    'https://api.cdek.ru/v2/oauth/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CDEK_ACCOUNT,
      client_secret: CDEK_PASSWORD,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  return response.data.access_token;
}

async function fetchOrderEntity(track: string, token: string) {
  const response = await axios.get('https://api.cdek.ru/v2/orders', {
    params: { cdek_number: track },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data?.entity ?? null;
}

function parseOrderStatus(entity: any): {
  status: string;
  sendDate: string;
  deliveredDate: string;
  cdekStatus: string | null;
} {
  const statuses = Array.isArray(entity?.statuses) ? entity.statuses : [];
  const isClientReturn = entity?.is_client_return || false;

  let status = '';
  let sendDate = '';
  let deliveredDate = '';
  const cdekStatus = statuses.length ? statuses[0]?.name ?? null : null;

  const hasDelivered = statuses.find((s) => s.code === 'DELIVERED');
  const hasShipped = statuses.find(
    (s) => s.code === 'RECEIVED_AT_SHIPMENT_WAREHOUSE',
  );
  const hasCreated = statuses.find((s) => s.code === 'CREATED');

  if (hasDelivered) {
    status = 'Вручена';
    deliveredDate = hasDelivered.date_time?.slice(0, 10) || '';
    sendDate = hasShipped?.date_time?.slice(0, 10) || '';
  } else if (hasShipped) {
    status = 'Отправлена';
    sendDate = hasShipped.date_time?.slice(0, 10) || '';
  } else if (hasCreated) {
    status = 'Создана';
  }

  if (isClientReturn) {
    status = 'Возврат';
  }

  return { status, sendDate, deliveredDate, cdekStatus };
}

function isAuthError(error: AxiosError) {
  const status = error.response?.status;
  return status === 401 || status === 403;
}

async function run() {
  const argTrack = (readArgValue('track') || '').trim();
  const trackFilter = argTrack || CDEK_TRACK;
  const printResponse = hasFlag('print') || CDEK_PRINT_RESPONSE;
  const fastMode = hasFlag('fast') || CDEK_FAST;
  const paceMs = trackFilter || fastMode ? 0 : PACE_MS;

  const baseWhere: Prisma.DeliveryWhereInput = {
    track: { not: '' },
    method: { in: ['СДЕК', 'СДЕК курьер'] },
    status: { not: 'Вручена' },
  };

  let tracks: Array<{ track: string | null }> = [];

  if (trackFilter) {
    tracks = await prisma.delivery.findMany({
      where: {
        ...baseWhere,
        track: trackFilter,
      },
      select: { track: true },
      distinct: ['track'],
    });

    if (tracks.length === 0) {
      const allTracks = await prisma.delivery.findMany({
        where: baseWhere,
        select: { track: true },
        distinct: ['track'],
      });
      tracks = allTracks.filter(({ track }) => (track || '').trim() === trackFilter);
    }

    if (tracks.length === 0) {
      console.warn(
        `[CDEK Seed] Track ${trackFilter} not found in DB, will request API without DB match`,
      );
      tracks = [{ track: trackFilter }];
    }
  } else {
    tracks = await prisma.delivery.findMany({
      where: baseWhere,
      select: { track: true },
      distinct: ['track'],
    });
  }

  console.log(`[CDEK Seed] Tracks: ${tracks.length}`);

  let token = await getAccessToken();
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const { track } of tracks) {
    const rawTrack = track || '';
    const normalized = rawTrack.trim();
    if (!normalized) {
      skipped += 1;
      continue;
    }

    if (paceMs) {
      await sleep(paceMs);
    }

    try {
      const entity = await fetchOrderEntity(normalized, token);
      if (printResponse) {
        console.log(`[CDEK Seed] Track ${normalized} API response:`);
        console.dir(entity, { depth: null, colors: true });
      }

      const { status, sendDate, deliveredDate, cdekStatus } =
        parseOrderStatus(entity);
      const price = entity?.delivery_detail?.total_sum ?? 0;

      console.log(
        `[CDEK Seed] Track ${normalized} parsed: ${JSON.stringify({
          status,
          sendDate,
          deliveredDate,
          cdekStatus,
          price,
        })}`,
      );

      if (!status && !sendDate && !deliveredDate && !cdekStatus) {
        skipped += 1;
        continue;
      }

      const result = await prisma.delivery.updateMany({
        where: { track: rawTrack },
        data: {
          price,
          ...(status ? { status } : {}),
          ...(sendDate ? { date: sendDate } : {}),
          ...(deliveredDate ? { deliveredDate } : {}),
          ...(cdekStatus ? { cdekStatus } : {}),
        },
      });

      updated += result.count;
    } catch (error) {
      if (axios.isAxiosError(error) && isAuthError(error)) {
        try {
          token = await getAccessToken();
          const entity = await fetchOrderEntity(normalized, token);
          if (printResponse) {
            console.log(`[CDEK Seed] Track ${normalized} API response:`);
            console.dir(entity, { depth: null, colors: true });
          }

          const { status, sendDate, deliveredDate, cdekStatus } =
            parseOrderStatus(entity);
          const price = entity?.delivery_detail?.total_sum ?? 0;

          console.log(
            `[CDEK Seed] Track ${normalized} parsed: ${JSON.stringify({
              status,
              sendDate,
              deliveredDate,
              cdekStatus,
              price,
            })}`,
          );

          if (!status && !sendDate && !deliveredDate && !cdekStatus) {
            skipped += 1;
            continue;
          }
          const result = await prisma.delivery.updateMany({
            where: { track: rawTrack },
            data: {
              price,
              ...(status ? { status } : {}),
              ...(sendDate ? { date: sendDate } : {}),
              ...(deliveredDate ? { deliveredDate } : {}),
              ...(cdekStatus ? { cdekStatus } : {}),
            },
          });
          updated += result.count;
          continue;
        } catch (retryError) {
          console.error(
            `[CDEK Seed] Track ${normalized} failed after token refresh`,
          );
          failed += 1;
          continue;
        }
      }

      if (axios.isAxiosError(error) && error.response?.status === 400) {
        console.warn(`[CDEK Seed] Track ${normalized} skipped (400)`);
        skipped += 1;
        continue;
      }

      console.error(`[CDEK Seed] Track ${normalized} failed`);
      failed += 1;
    }
  }

  console.log(
    `[CDEK Seed] Done. updated=${updated} skipped=${skipped} failed=${failed}`,
  );
}

run()
  .catch((error) => {
    console.error('[CDEK Seed] Fatal error', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
