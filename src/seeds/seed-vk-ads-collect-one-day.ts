import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { VkAdsIntegrationsService } from '../domains/vk-ads/vk-ads-integrations.service';
import { VkAdsStatsService } from '../domains/vk-ads/vk-ads.stats.service';

const VALID_ENTITIES = ['ad_plans', 'ad_groups', 'banners'] as const;
type SyncEntity = (typeof VALID_ENTITIES)[number];

function getYYYYMMDD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseArgs(): {
  integrationIds: number[] | 'all';
  dateFrom: string;
  dateTo: string;
  entities: readonly SyncEntity[];
} {
  const argv = process.argv.slice(2);

  const get = (flag: string) => {
    const entry = argv.find((a) => a.startsWith(`--${flag}=`));
    return entry ? entry.slice(flag.length + 3) : undefined;
  };

  // Dates: default last 2 days
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(today.getDate() - 2);

  const rawDateFrom = get('dateFrom');
  const rawDateTo = get('dateTo');

  const dateFrom = rawDateFrom ?? getYYYYMMDD(twoDaysAgo);
  const dateTo = rawDateTo ?? getYYYYMMDD(yesterday);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    throw new Error(`--dateFrom must be YYYY-MM-DD, got: ${dateFrom}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    throw new Error(`--dateTo must be YYYY-MM-DD, got: ${dateTo}`);
  }
  if (dateTo < dateFrom) {
    throw new Error(`--dateTo (${dateTo}) must be >= --dateFrom (${dateFrom})`);
  }

  // Entity
  const rawEntity = get('entity') ?? 'all';
  let entities: readonly SyncEntity[];
  if (rawEntity === 'all') {
    entities = VALID_ENTITIES;
  } else {
    const parts = rawEntity.split(',').map((s) => s.trim()) as SyncEntity[];
    const invalid = parts.filter((p) => !VALID_ENTITIES.includes(p));
    if (invalid.length) {
      throw new Error(
        `Invalid entity values: ${invalid.join(', ')}. Must be one of: ${VALID_ENTITIES.join(', ')}`,
      );
    }
    entities = parts;
  }

  // Integration IDs
  const hasAll = argv.includes('--all');
  const rawId = get('integrationId');
  const rawIds = get('integrationIds');

  if (hasAll) {
    return { integrationIds: 'all', dateFrom, dateTo, entities };
  }

  if (rawId) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`--integrationId must be a positive integer, got: ${rawId}`);
    }
    return { integrationIds: [id], dateFrom, dateTo, entities };
  }

  if (rawIds) {
    const ids = rawIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const n = Number(s);
        if (!Number.isInteger(n) || n <= 0) {
          throw new Error(`--integrationIds contains invalid value: ${s}`);
        }
        return n;
      });
    if (!ids.length) {
      throw new Error('--integrationIds must contain at least one valid id');
    }
    return { integrationIds: ids, dateFrom, dateTo, entities };
  }

  // Fallback: all active integrations
  return { integrationIds: 'all', dateFrom, dateTo, entities };
}

async function main() {
  const { integrationIds, dateFrom, dateTo, entities } = parseArgs();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const integrationsService = app.get(VkAdsIntegrationsService);
    const stats = app.get(VkAdsStatsService);

    const allActive = await integrationsService.listActiveIntegrations();

    let requested: typeof allActive;
    if (integrationIds === 'all') {
      requested = allActive;
    } else {
      requested = integrationIds.map((id) => {
        const found = allActive.find((i) => i.id === id);
        if (!found) {
          return { id, _missing: true } as any;
        }
        return found;
      });
    }

    const summary = {
      requested: requested.map((r) => r.id),
      processed: [] as number[],
      skipped: [] as number[],
      failed: [] as number[],
      success: [] as number[],
    };

    console.log(
      [
        '[vk-ads-collect-one-day]',
        `requested=${summary.requested.join(',') || 'none'}`,
        `dateFrom=${dateFrom}`,
        `dateTo=${dateTo}`,
        `entities=${entities.join(',')}`,
      ].join(' '),
    );

    for (const integration of requested) {
      const id = integration.id;

      if ((integration as any)._missing) {
        console.warn(`[vk-ads-collect-one-day] skipped integrationId=${id}: not found or inactive`);
        summary.skipped.push(id);
        continue;
      }

      const statsProjectKey =
        await integrationsService.resolveStatsProjectKeyByIntegrationId(id).catch(() => null);

      if (!statsProjectKey) {
        console.warn(
          `[vk-ads-collect-one-day] skipped integrationId=${id}: not linked to a stats project`,
        );
        summary.skipped.push(id);
        continue;
      }

      summary.processed.push(id);

      console.log(
        [
          '[vk-ads-collect-one-day]',
          `integrationId=${id}`,
          `name=${String(integration.name || '').trim() || 'Без названия'}`,
          `projectId=${integration.projectId ?? 'null'}`,
          `projectKey=${statsProjectKey}`,
          `dateFrom=${dateFrom}`,
          `dateTo=${dateTo}`,
          `entities=${entities.join(',')}`,
        ].join(' '),
      );

      let integrationFailed = false;

      for (const entity of entities) {
        try {
          console.log(
            `[vk-ads-collect-one-day] start integrationId=${id} entity=${entity} range=${dateFrom}..${dateTo}`,
          );
          await stats.collectRange(statsProjectKey, entity, dateFrom, dateTo, {
            integrationId: id,
          });
          console.log(
            `[vk-ads-collect-one-day] done integrationId=${id} entity=${entity} range=${dateFrom}..${dateTo}`,
          );
        } catch (err: any) {
          integrationFailed = true;
          console.error(
            `[vk-ads-collect-one-day] error integrationId=${id} entity=${entity}: ${err?.message ?? err}`,
          );
        }
      }

      if (integrationFailed) {
        summary.failed.push(id);
      } else {
        summary.success.push(id);
      }
    }

    console.log(
      [
        '[vk-ads-collect-one-day] summary',
        `requested=[${summary.requested.join(',')}]`,
        `processed=[${summary.processed.join(',')}]`,
        `skipped=[${summary.skipped.join(',')}]`,
        `failed=[${summary.failed.join(',')}]`,
        `success=[${summary.success.join(',')}]`,
      ].join(' '),
    );

    if (summary.failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('[vk-ads-collect-one-day] fatal:', error);
  process.exitCode = 1;
});
