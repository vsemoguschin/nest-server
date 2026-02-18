import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { CdekService } from 'src/services/cdek.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CdekHttpGuard, isAuthError } from './cdek-http-guard.util';
import { CdekJobLockService } from './cdek-job-lock.service';

export type CdekTrackSyncOptions = {
  track?: string;
  printResponse?: boolean;
  fast?: boolean;
  paceMs?: number;
  skipDelivered?: boolean;
  concurrency?: number;
  minIntervalMs?: number;
};

export type CdekTrackSyncResult = {
  tracksTotal: number;
  updated: number;
  skipped: number;
  failed: number;
  locked?: boolean;
};

@Injectable()
export class CdekTrackSyncService {
  private readonly logger = new Logger(CdekTrackSyncService.name);
  private readonly httpGuard = new CdekHttpGuard('cdek-track-sync');
  private readonly defaultPaceMs = Math.max(
    0,
    Number(process.env.CDEK_SEED_PACE_MS) || 200,
  );
  private readonly defaultConcurrency = Math.max(
    1,
    Number(process.env.CDEK_SYNC_CONCURRENCY) || 3,
  );
  private readonly defaultMinIntervalMs = Math.max(
    0,
    Number(process.env.CDEK_SYNC_MIN_INTERVAL_MS) || 150,
  );
  private readonly defaultFastMinIntervalMs = Math.max(
    0,
    Number(process.env.CDEK_SYNC_MIN_INTERVAL_FAST_MS) || 0,
  );
  private readonly lockTtlMs =
    Math.max(1, Number(process.env.CDEK_SYNC_LOCK_TTL_MINUTES) || 120) * 60_000;
  private readonly lockWaitMs = Math.max(
    0,
    Number(process.env.CDEK_SYNC_LOCK_WAIT_MS) || 0,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly cdekService: CdekService,
    private readonly jobLockService: CdekJobLockService,
  ) {}

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async getAccessToken() {
    return this.httpGuard.execute('oauth/token', async () =>
      this.cdekService.getAccessToken(),
    );
  }

  private async fetchOrderEntity(track: string, token: string) {
    return this.httpGuard.execute(`orders/${track}`, async () => {
      const response = await axios.get('https://api.cdek.ru/v2/orders', {
        params: { cdek_number: track },
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data?.entity ?? null;
    });
  }

  private createRateLimiter(minIntervalMs: number) {
    let nextAllowedAt = 0;
    let chain = Promise.resolve();

    return async <T>(task: () => Promise<T>): Promise<T> => {
      const run = async () => {
        const waitMs = Math.max(0, nextAllowedAt - Date.now());
        if (waitMs > 0) {
          await this.sleep(waitMs);
        }
        nextAllowedAt = Date.now() + minIntervalMs;
        return task();
      };

      const taskPromise = chain.then(run, run);
      chain = taskPromise.then(
        () => undefined,
        () => undefined,
      );

      return taskPromise;
    };
  }

  private async loadTracks(
    baseWhere: Prisma.DeliveryWhereInput,
    trackFilter: string,
  ): Promise<Array<{ normalized: string; rawTracks: string[] }>> {
    let trackRows: Array<{ track: string | null }> = [];

    if (trackFilter) {
      trackRows = await this.prisma.delivery.findMany({
        where: { ...baseWhere, track: trackFilter },
        select: { track: true },
        distinct: ['track'],
      });

      if (trackRows.length === 0) {
        const allTracks = await this.prisma.delivery.findMany({
          where: baseWhere,
          select: { track: true },
          distinct: ['track'],
        });
        trackRows = allTracks.filter(
          ({ track }) => (track || '').trim() === trackFilter,
        );
      }

      if (trackRows.length === 0) {
        this.logger.warn(
          `[CDEK Sync] Track ${trackFilter} not found in DB, using API lookup only`,
        );
        trackRows = [{ track: trackFilter }];
      }
    } else {
      trackRows = await this.prisma.delivery.findMany({
        where: baseWhere,
        select: { track: true },
        distinct: ['track'],
      });
    }

    const byNormalized = new Map<string, Set<string>>();
    for (const { track } of trackRows) {
      const rawTrack = (track || '').trim();
      if (!rawTrack) continue;

      if (!byNormalized.has(rawTrack)) {
        byNormalized.set(rawTrack, new Set<string>());
      }
      byNormalized.get(rawTrack)?.add(track || rawTrack);
    }

    return Array.from(byNormalized.entries()).map(([normalized, rawSet]) => ({
      normalized,
      rawTracks: Array.from(rawSet.values()),
    }));
  }

  async syncTracks(options: CdekTrackSyncOptions = {}): Promise<CdekTrackSyncResult> {
    const lock = await this.jobLockService.acquire('cdek-track-sync', {
      ttlMs: this.lockTtlMs,
      waitMs: this.lockWaitMs,
    });

    if (!lock) {
      this.logger.warn('[CDEK Sync] skipped: another sync run is in progress');
      return { tracksTotal: 0, updated: 0, skipped: 0, failed: 0, locked: true };
    }

    try {
    const trackFilter = (options.track || '').trim();
    const printResponse = Boolean(options.printResponse);
    const fastMode = Boolean(options.fast);
    const skipDelivered = options.skipDelivered !== false;
    const paceMs = trackFilter || fastMode ? 0 : (options.paceMs ?? this.defaultPaceMs);
    const minIntervalMs = Math.max(
      0,
      options.minIntervalMs ??
        (fastMode ? this.defaultFastMinIntervalMs : this.defaultMinIntervalMs),
    );
    const concurrency = Math.max(
      1,
      options.concurrency ?? (fastMode ? Math.max(1, this.defaultConcurrency * 2) : this.defaultConcurrency),
    );
    const runRateLimited = this.createRateLimiter(minIntervalMs);

    const baseWhere: Prisma.DeliveryWhereInput = {
      track: { not: '' },
      method: { in: ['СДЕК', 'СДЕК курьер'] },
      ...(skipDelivered ? { status: { not: 'Вручена' } } : {}),
    };
    const tracks = await this.loadTracks(baseWhere, trackFilter);
    let token = await this.getAccessToken();
    let tokenRefreshPromise: Promise<string> | null = null;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    const refreshToken = async (): Promise<string> => {
      if (!tokenRefreshPromise) {
        tokenRefreshPromise = this.getAccessToken().finally(() => {
          tokenRefreshPromise = null;
        });
      }
      token = await tokenRefreshPromise;
      return token;
    };

    const processTrack = async (trackEntry: {
      normalized: string;
      rawTracks: string[];
    }) => {
      const { normalized, rawTracks } = trackEntry;

      if (paceMs) {
        await this.sleep(paceMs);
      }

      let entity: any;
      try {
        entity = await runRateLimited(() =>
          this.fetchOrderEntity(normalized, token),
        );
      } catch (error) {
        if (isAuthError(error)) {
          try {
            const freshToken = await refreshToken();
            entity = await runRateLimited(() =>
              this.fetchOrderEntity(normalized, freshToken),
            );
          } catch {
            this.logger.error(
              `[CDEK Sync] Track ${normalized} failed after token refresh`,
            );
            failed += 1;
            return;
          }
        } else if (axios.isAxiosError(error) && error.response?.status === 400) {
          this.logger.warn(`[CDEK Sync] Track ${normalized} skipped (400)`);
          skipped += 1;
          return;
        } else {
          const status = axios.isAxiosError(error)
            ? error.response?.status ?? 'n/a'
            : 'n/a';
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `[CDEK Sync] Track ${normalized} failed (status=${status}, message=${message})`,
          );
          failed += 1;
          return;
        }
      }

      if (printResponse) {
        this.logger.log(`[CDEK Sync] Track ${normalized} API response`);
        console.dir(entity, { depth: null, colors: true });
      }

      const { status, sendDate, deliveredDate, cdekStatus } =
        this.cdekService.parseOrderStatus(entity);
      const price = entity?.delivery_detail?.total_sum ?? 0;

      if (!status && !sendDate && !deliveredDate && !cdekStatus) {
        skipped += 1;
        return;
      }

      const data: Prisma.DeliveryUpdateManyMutationInput = {
        price,
        ...(status ? { status } : {}),
        ...(sendDate ? { date: sendDate } : {}),
        ...(deliveredDate ? { deliveredDate } : {}),
        ...(cdekStatus ? { cdekStatus } : {}),
      };
      const changesWhere: Prisma.DeliveryWhereInput[] = [{ price: { not: price } }];
      if (status) changesWhere.push({ status: { not: status } });
      if (sendDate) changesWhere.push({ date: { not: sendDate } });
      if (deliveredDate) changesWhere.push({ deliveredDate: { not: deliveredDate } });
      if (cdekStatus) changesWhere.push({ cdekStatus: { not: cdekStatus } });

      const result = await this.prisma.delivery.updateMany({
        where: {
          track: { in: rawTracks },
          OR: changesWhere,
        },
        data,
      });

      if (result.count > 0) {
        updated += result.count;
      } else {
        skipped += 1;
      }
    };

    let index = 0;
    const workersCount = Math.min(concurrency, Math.max(1, tracks.length || 1));
    await Promise.all(
      Array.from({ length: workersCount }).map(async () => {
        while (true) {
          const currentIndex = index;
          index += 1;
          const trackEntry = tracks[currentIndex];
          if (!trackEntry) return;
          await processTrack(trackEntry);
        }
      }),
    );

    return {
      tracksTotal: tracks.length,
      updated,
      skipped,
      failed,
    };
    } finally {
      await lock.release();
    }
  }
}
