import 'dotenv/config';
import axios from 'axios';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { CdekService } from '../services/cdek.service';

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

async function runApiOnlyTrack(track: string, printRaw: boolean) {
  const cdekService = new CdekService();
  let token = await cdekService.getAccessToken();
  let entity: any;

  try {
    entity = await cdekService.getOrderInfoStrict(track, token);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        token = await cdekService.getAccessToken();
        entity = await cdekService.getOrderInfoStrict(track, token);
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  const parsed = cdekService.parseOrderStatus(entity);
  const latestStatus = Array.isArray(entity?.statuses) ? entity.statuses[0] : null;
  console.log(`[CDEK Delivered] API-only mode track=${track}`);
  console.dir(
    {
      cdek: {
        cdek_number: entity?.cdek_number,
        number: entity?.number,
        delivery_total_sum: entity?.delivery_detail?.total_sum ?? 0,
        parsedStatus: parsed.status,
        parsedSendDate: parsed.sendDate,
        parsedDeliveredDate: parsed.deliveredDate,
        parsedCdekStatus: parsed.cdekStatus,
        latestStatus,
      },
    },
    { depth: null, colors: true },
  );

  if (printRaw) {
    console.log(`[CDEK Delivered] raw entity for track=${track}`);
    console.dir(entity, { depth: null, colors: true });
  }
}

async function run() {
  const rawLimit =
    readArgValue('limit') || process.env.CDEK_DELIVERED_LIMIT || '10';
  const trackFilter = (
    readArgValue('track') || process.env.CDEK_TRACK || ''
  ).trim();
  const limit = Math.max(1, Number(rawLimit) || 10);
  const printRaw = hasFlag('print');

  if (trackFilter) {
    await runApiOnlyTrack(trackFilter, printRaw);
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const cdekService = app.get(CdekService);
    const prisma = app.get(PrismaService);

    let deliveries = await prisma.delivery.findMany({
      where: {
        status: 'Вручена',
        method: { in: ['СДЕК', 'СДЕК курьер'] },
        track: { not: '' },
      },
      orderBy: [{ deliveredDate: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        method: true,
        status: true,
        track: true,
        date: true,
        deliveredDate: true,
        cdekStatus: true,
        price: true,
      },
    });

    console.log(`[CDEK Delivered] selected=${deliveries.length} limit=${limit}`);
    if (!deliveries.length) return;

    let token = await cdekService.getAccessToken();
    let ok = 0;
    let failed = 0;

    for (const [index, delivery] of deliveries.entries()) {
      const track = (delivery.track || '').trim();
      if (!track) {
        failed += 1;
        continue;
      }

      try {
        let entity: any;
        try {
          entity = await cdekService.getOrderInfoStrict(track, token);
        } catch (error) {
          if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            if (status === 401 || status === 403) {
              token = await cdekService.getAccessToken();
              entity = await cdekService.getOrderInfoStrict(track, token);
            } else {
              throw error;
            }
          } else {
            throw error;
          }
        }

        const parsed = cdekService.parseOrderStatus(entity);
        const latestStatus = Array.isArray(entity?.statuses)
          ? entity.statuses[0]
          : null;

        console.log(
          `[${index + 1}/${deliveries.length}] deliveryId=${delivery.id} track=${track}`,
        );
        console.dir(
          {
            local: {
              method: delivery.method,
              status: delivery.status,
              date: delivery.date,
              deliveredDate: delivery.deliveredDate,
              cdekStatus: delivery.cdekStatus,
              price: delivery.price,
            },
            cdek: {
              cdek_number: entity?.cdek_number,
              number: entity?.number,
              delivery_total_sum: entity?.delivery_detail?.total_sum ?? 0,
              parsedStatus: parsed.status,
              parsedSendDate: parsed.sendDate,
              parsedDeliveredDate: parsed.deliveredDate,
              parsedCdekStatus: parsed.cdekStatus,
              latestStatus,
            },
          },
          { depth: null, colors: true },
        );

        if (printRaw) {
          console.log(
            `[${index + 1}/${deliveries.length}] raw entity for track=${track}`,
          );
          console.dir(entity, { depth: null, colors: true });
        }

        ok += 1;
      } catch (error) {
        const status = axios.isAxiosError(error)
          ? (error.response?.status ?? 'n/a')
          : 'n/a';
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[CDEK Delivered] track=${track} failed status=${status} message=${message}`,
        );
        failed += 1;
      }
    }

    console.log(
      `[CDEK Delivered] done total=${deliveries.length} ok=${ok} failed=${failed}`,
    );
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error('[CDEK Delivered] Fatal error', error);
  process.exitCode = 1;
});
