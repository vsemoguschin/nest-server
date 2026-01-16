import 'dotenv/config';
import axios, { AxiosError } from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CDEK_ACCOUNT = process.env.CDEK_ACCOUNT;
const CDEK_PASSWORD = process.env.CDEK_PASSWORD;
const PACE_MS = Math.max(0, Number(process.env.CDEK_SEED_PACE_MS) || 200);

if (!CDEK_ACCOUNT || !CDEK_PASSWORD) {
  console.error('[CDEK Seed] Missing CDEK_ACCOUNT or CDEK_PASSWORD');
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function extractCdekStatus(entity: any): string | null {
  const statuses = Array.isArray(entity?.statuses) ? entity.statuses : [];
  const name = statuses[0]?.name;
  if (typeof name !== 'string' || !name.trim()) return null;
  return name.trim();
}

function isAuthError(error: AxiosError) {
  const status = error.response?.status;
  return status === 401 || status === 403;
}

async function run() {
  const tracks = await prisma.delivery.findMany({
    where: {
      track: { not: '' },
      method: { in: ['СДЕК', 'СДЕК курьер'] },
    },
    select: {
      track: true,
    },
    distinct: ['track'],
  });

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

    if (PACE_MS) {
      await sleep(PACE_MS);
    }

    try {
      let entity = await fetchOrderEntity(normalized, token);
      let status = extractCdekStatus(entity);

      if (status === null) {
        skipped += 1;
        continue;
      }

      const result = await prisma.delivery.updateMany({
        where: { track: rawTrack },
        data: { cdekStatus: status },
      });

      updated += result.count;
    } catch (error) {
      if (axios.isAxiosError(error) && isAuthError(error)) {
        try {
          token = await getAccessToken();
          const entity = await fetchOrderEntity(normalized, token);
          const status = extractCdekStatus(entity);
          if (!status) {
            skipped += 1;
            continue;
          }
          const result = await prisma.delivery.updateMany({
            where: { track: rawTrack },
            data: { cdekStatus: status },
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
