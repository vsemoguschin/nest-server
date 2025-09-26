import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  StatsDayResponse,
  StatisticsDayAdPlansDto,
  StatisticsDayGroupsDto,
  StatisticsDayBannersDto,
} from './dto/statistics-day.dto';

type Entity = 'ad_plans' | 'ad_groups' | 'banners';

@Injectable()
export class VkAdsDbService {
  constructor(private readonly prisma: PrismaService) {}

  private parseStatusesFilter(
    input?: string,
    allowed = ['active', 'blocked', 'deleted'],
  ): string[] | undefined {
    if (!input || input === 'all') return undefined;
    const set = new Set<string>();
    for (const s of String(input)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)) {
      if (allowed.includes(s)) set.add(s);
    }
    return set.size ? Array.from(set) : undefined;
  }

  private addTotals(dst: any, src: any) {
    if (!src || typeof src !== 'object') return dst;
    for (const k of Object.keys(src)) {
      const sv = (src as any)[k];
      if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
        dst[k] = this.addTotals(dst[k] || {}, sv);
      } else {
        const n =
          typeof sv === 'string'
            ? Number(sv)
            : typeof sv === 'number'
              ? sv
              : Number(sv);
        if (Number.isFinite(n)) dst[k] = (Number(dst[k]) || 0) + n;
      }
    }
    return dst;
  }

  private getSortVal(total: any, sort_by?: string): number {
    const path = (sort_by || 'base.shows').split('.', 2);
    const group = path[0];
    const field = path[1];
    const v = total?.[group]?.[field];
    const n =
      typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private async getFromDb(
    entity: Entity,
    project: 'neon' | 'book',
    date_from: string,
    date_to?: string,
    idsCsv?: string,
    statusCsv?: string,
    limit = 20,
    offset = 0,
    sort_by = 'base.shows',
    dir: 'asc' | 'desc' = 'desc',
  ): Promise<StatsDayResponse<any>> {
    const where: any = { project, entity, date: { gte: date_from } };
    if (date_to) where.date.lte = date_to;
    const ids: number[] = idsCsv
      ? String(idsCsv)
          .split(',')
          .map((x) => Number(String(x).trim()))
          .filter((n) => Number.isFinite(n))
      : [];
    if (ids.length) where.entityId = { in: ids };
    const statuses = this.parseStatusesFilter(statusCsv);
    if (statuses) where.status = { in: statuses };
    const rows = await this.prisma.vkAdsDailyStat.findMany({ where });

    const agg = new Map<number, any>();
    for (const r of rows) {
      const id = r.entityId;
      const cur = agg.get(id) || {
        id,
        status: (r as any).status ?? undefined,
        name: (r as any).name ?? undefined,
        budget_limit_day: (r as any).budgetLimitDay ?? undefined,
        ad_group_id: (r as any).adGroupId ?? undefined,
        ad_groups: [] as number[],
        banners: [] as number[],
        refs: [] as string[],
        total: {},
        dealsPrice: 0,
        makets: 0,
        spent_nds: 0,
        maketPrice: 0,
        drr: 0,
      };
      if (!cur.status && (r as any).status) cur.status = (r as any).status;
      if (!cur.name && (r as any).name) cur.name = (r as any).name;
      if (!cur.budget_limit_day && (r as any).budgetLimitDay)
        cur.budget_limit_day = (r as any).budgetLimitDay as any;
      if (!cur.ad_group_id && (r as any).adGroupId)
        cur.ad_group_id = (r as any).adGroupId as any;
      if (Array.isArray((r as any).adGroups))
        cur.ad_groups = Array.from(
          new Set([...cur.ad_groups, ...(r as any).adGroups]),
        );
      if (Array.isArray((r as any).banners))
        cur.banners = Array.from(
          new Set([...cur.banners, ...(r as any).banners]),
        );
      if (Array.isArray((r as any).refs))
        cur.refs = Array.from(new Set([...cur.refs, ...(r as any).refs]));
      this.addTotals(cur.total, (r as any).total || {});
      cur.dealsPrice += Number((r as any).dealsPrice || 0);
      cur.makets += Number((r as any).makets || 0);
      cur.spent_nds += Number((r as any).spentNds || 0);
      agg.set(id, cur);
    }

    const items = Array.from(agg.values());
    for (const it of items) {
      it.maketPrice = it.makets
        ? Number((it.spent_nds / it.makets).toFixed(2))
        : 0;
      it.drr = it.dealsPrice
        ? Number(((it.spent_nds / it.dealsPrice) * 100).toFixed(2))
        : 0;
    }

    items.sort((a, b) => {
      const va = this.getSortVal(a.total, sort_by);
      const vb = this.getSortVal(b.total, sort_by);
      return dir === 'asc' ? va - vb : vb - va;
    });
    const count = items.length;
    const sliced = items.slice(offset, offset + limit);

    const adGroupSet = new Set<number>();
    const bannersSet = new Set<number>();
    for (const it of sliced) {
      if (Array.isArray(it.ad_groups))
        for (const g of it.ad_groups) if (Number.isFinite(g)) adGroupSet.add(g);
      if (Array.isArray(it.banners))
        for (const b of it.banners) if (Number.isFinite(b)) bannersSet.add(b);
    }

    const total: any = {};
    for (const it of items) this.addTotals(total, it.total || {});
    // Бизнес-итоги по всем найденным записям (независимо от пагинации)
    const dealsPrice_total = items.reduce((s, it) => s + Number(it.dealsPrice || 0), 0);
    const makets_total = items.reduce((s, it) => s + Number(it.makets || 0), 0);
    const spentNds_total = items.reduce((s, it) => s + Number(it.spent_nds || 0), 0);
    const maketPrice_total = makets_total ? Number((spentNds_total / makets_total).toFixed(2)) : 0;
    const drr_total = dealsPrice_total ? Number(((spentNds_total / dealsPrice_total) * 100).toFixed(2)) : 0;

    return {
      items: sliced,
      count,
      limit,
      offset,
      total,
      ad_group_count: adGroupSet.size,
      banners_count: bannersSet.size,
      dealsPrice_total,
      makets_total,
      maketPrice_total,
      drr_total,
    } as any;
  }

  async getAdPlansDayDb(
    q: StatisticsDayAdPlansDto,
  ): Promise<StatsDayResponse<any>> {
    const limit = Math.min(Math.max(Number(q.limit || 20), 1), 250);
    const offset = Math.max(Number(q.offset || 0), 0);
    const dir = (q.d || 'desc') === 'asc' ? 'asc' : 'desc';
    return this.getFromDb(
      'ad_plans',
      q.project,
      q.date_from,
      q.date_to,
      undefined,
      q.status,
      limit,
      offset,
      'base.shows',
      dir,
    );
  }

  async getAdGroupsDayDb(
    q: StatisticsDayGroupsDto,
  ): Promise<StatsDayResponse<any>> {
    const limit = Math.min(Math.max(Number(q.limit || 20), 1), 250);
    const offset = Math.max(Number(q.offset || 0), 0);
    const dir = (q.d || 'desc') === 'asc' ? 'asc' : 'desc';
    return this.getFromDb(
      'ad_groups',
      q.project,
      q.date_from,
      q.date_to,
      (q as any).ids,
      q.status,
      limit,
      offset,
      q.sort_by || 'base.shows',
      dir,
    );
  }

  async getBannersDayDb(
    q: StatisticsDayBannersDto,
  ): Promise<StatsDayResponse<any>> {
    const limit = Math.min(Math.max(Number(q.limit || 20), 1), 250);
    const offset = Math.max(Number(q.offset || 0), 0);
    const dir = (q.d || 'desc') === 'asc' ? 'asc' : 'desc';
    return this.getFromDb(
      'banners',
      q.project,
      q.date_from,
      q.date_to,
      (q as any).ids,
      q.status,
      limit,
      offset,
      q.sort_by || 'base.shows',
      dir,
    );
  }
}
