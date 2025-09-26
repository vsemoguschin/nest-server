import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VkAdsService } from './vk-ads.service';
import { Prisma } from '@prisma/client';

type Project = 'neon' | 'book';
type Entity = 'ad_plans' | 'ad_groups' | 'banners';

@Injectable()
export class VkAdsStatsService {
  private readonly logger = new Logger(VkAdsStatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vk: VkAdsService,
  ) {}

  /**
   * Сохранить статистику из ответа v3/day в таблицу VkAdsDailyStat.
   * Пишем по дням, если в items есть массив `days`; иначе сохраняем агрегат на date_from.
   */
  private async persistStats(
    project: Project,
    entity: Entity,
    date_from: string,
    date_to: string | undefined,
    items: any[],
  ) {
    const upserts: Prisma.PrismaPromise<any>[] = [];

    for (const it of items) {
      const entityId = Number(it?.id);
      if (!Number.isFinite(entityId)) continue;

      // refs: для баннеров всегда используем собственный id как строку
      const refsForEntity: string[] =
        entity === 'banners'
          ? [String(entityId)]
          : Array.isArray(it?.refs)
            ? it.refs
            : [];

      const baseMeta: any = {
        status: it?.status ?? null,
        name: it?.name ?? null,
        // В БД поле строковое: приводим к строке, если число
        budgetLimitDay:
          it?.budget_limit_day == null
            ? null
            : typeof it.budget_limit_day === 'number'
              ? String(it.budget_limit_day)
              : String(it.budget_limit_day),
        adGroupId: it?.ad_group_id ?? null,
        adGroups: Array.isArray(it?.ad_groups) ? it.ad_groups : [],
        banners: Array.isArray(it?.banners) ? it.banners : [],
        refs: refsForEntity,
        dealsPrice: Number(it?.dealsPrice || 0),
        makets: Number(it?.makets || 0),
        spentNds: Number(
          (it?.spent_nds ??
            (it?.total?.base?.spent || it?.total?.base?.spend || 0) * 1.2) ||
            0,
        ),
        maketPrice: Number(it?.maketPrice || 0),
        drr: Number(it?.drr || 0),
      };

      // Мы собираем строго по одному дню (collectRange вызывает persist на date_from==date_to==day),
      // поэтому не полагаемся на items.days и всегда используем date_from как дату записи.
      const date = date_from;
      const total = it?.total ?? null;
      upserts.push(
        this.prisma.vkAdsDailyStat.upsert({
          where: {
            project_entity_entityId_date: { project, entity, entityId, date },
          },
          create: { project, entity, entityId, date, total, ...baseMeta },
          update: { total, ...baseMeta },
        }),
      );
    }

    // Примечание: для массива промисов Prisma не принимает опции timeout/maxWait в этой версии
    if (upserts.length) await this.prisma.$transaction(upserts);
  }

  /** Загрузить и сохранить статистику для сущности в указанном диапазоне дат (с пагинацией). */
  async collectRange(
    project: Project,
    entity: Entity,
    date_from: string,
    date_to?: string,
  ) {
    // Запрещаем будущую дату начала и ограничиваем конец сегодняшним днем
    const today = new Date();
    const todayYmd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
      .toISOString()
      .slice(0, 10);
    if (date_from > todayYmd) {
      throw new Error(`date_from (${date_from}) must not be in the future`);
    }
    if (date_to && date_to > todayYmd) date_to = todayYmd;
    // Обходим диапазон по дням: на каждый день делаем отдельный запрос и сохраняем с этим днем.
    const parse = (s: string) => {
      const [y, m, d] = s.split('-').map((x) => Number(x));
      return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    };
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const start = parse(date_from);
    const end = date_to ? parse(date_to) : start;
    for (
      let cur = new Date(start);
      cur <= end;
      cur.setUTCDate(cur.getUTCDate() + 1)
    ) {
      const day = fmt(cur);
      const limit = 250;
      let offset = 0;
      while (true) {
        let resp: any;
        console.log(entity, day);
        if (entity === 'ad_plans') {
          resp = await this.vk.getAdPlansDay({
            project,
            date_from: day,
            date_to: day,
            limit,
            offset,
          } as any);
        } else if (entity === 'ad_groups') {
          resp = await this.vk.getAdGroupsDay({
            project,
            date_from: day,
            date_to: day,
            limit,
            offset,
          } as any);
        } else {
          resp = await this.vk.getBannersDay({
            project,
            date_from: day,
            date_to: day,
            limit,
            offset,
          } as any);
        }
        const items = Array.isArray(resp?.items) ? resp.items : [];
        await this.persistStats(project, entity, day, day, items);
        const count: number = Number(resp?.count || items.length);
        offset += limit;
        if (offset >= count || !items.length) break;
      }
    }
  }
}
