import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VkAdsService } from './vk-ads.service';
import { Prisma } from '@prisma/client';
import axios from 'axios';

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
    const bulkMode = String(process.env.VK_ADS_BULK_INSERT || '') === '1';
    const bulkRows: any[] = [];

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
            (it?.total?.base?.spent || it?.total?.base?.spend || 0) * 1.22) ||
            0,
        ),
        maketPrice: Number(it?.maketPrice || 0),
        drr: Number(it?.drr || 0),
      };

      // Мы собираем строго по одному дню (collectRange вызывает persist на date_from==date_to==day),
      // поэтому не полагаемся на items.days и всегда используем date_from как дату записи.
      const date = date_from;
      const total = it?.total ?? null;
      if (bulkMode) {
        bulkRows.push({ project, entity, entityId, date, total, ...baseMeta });
      } else {
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
    }

    // Примечание: для массива промисов Prisma не принимает опции timeout/maxWait в этой версии
    if (bulkMode) {
      // Быстрый путь: очищаем срез дня и вставляем пачкой
      await this.prisma.$transaction([
        this.prisma.vkAdsDailyStat.deleteMany({ where: { project, entity, date: date_from } }),
      ]);
      if (bulkRows.length) {
        await this.prisma.vkAdsDailyStat.createMany({ data: bulkRows });
      }
    } else {
      if (upserts.length) await this.prisma.$transaction(upserts);
    }
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
    const paceMs = Math.max(0, Number(process.env.VK_ADS_SEED_PACE_MS) || 600);
    const dayRetries = Math.max(1, Number(process.env.VK_ADS_SEED_DAY_RETRIES) || 4);
    this.logger.log(`[collectRange] project=${project} entity=${entity} from=${date_from} to=${date_to || date_from}`);
    await this.notify(`VK ADS: start ${project} ${entity} ${date_from}..${date_to || date_from}`);

    // Prefetch: собрать один раз список IDs для сущности и подставлять его в DTO
    let idsCsv: string | undefined;
    const enumerateIds = async (refDay: string): Promise<string | undefined> => {
      try {
        const limitEnum = 250;
        let off = 0;
        const acc = new Set<number>();
        while (true) {
          let resp: any;
          if (entity === 'ad_plans') {
            resp = await this.vk.getAdPlansDay({ project, date_from: refDay, date_to: refDay, limit: limitEnum, offset: off } as any);
          } else if (entity === 'ad_groups') {
            resp = await this.vk.getAdGroupsDay({ project, date_from: refDay, date_to: refDay, limit: limitEnum, offset: off } as any);
          } else {
            resp = await this.vk.getBannersDay({ project, date_from: refDay, date_to: refDay, limit: limitEnum, offset: off } as any);
          }
          const items = Array.isArray(resp?.items) ? resp.items : [];
          for (const it of items) {
            const idNum = typeof (it as any)?.id === 'number' ? (it as any).id : Number((it as any)?.id);
            if (Number.isFinite(idNum)) acc.add(idNum);
          }
          const cnt: number = Number(resp?.count || items.length);
          off += limitEnum;
          if (off >= cnt || !items.length) break;
          if (paceMs) await new Promise((r) => setTimeout(r, paceMs));
        }
        const list = Array.from(acc.values());
        return list.length ? list.join(',') : undefined;
      } catch {
        return undefined;
      }
    };
    // Соберем ids по первой дате диапазона
    idsCsv = await enumerateIds(fmt(start));
    for (let cur = new Date(start); cur <= end; cur.setUTCDate(cur.getUTCDate() + 1)) {
      const day = fmt(cur);
      const limit = 250;
      let offset = 0;
      this.logger.log(`[day:start] project=${project} entity=${entity} day=${day}`);
      await this.notify(`VK ADS: day start ${project} ${entity} ${day}`);
      let pageDone = false;
      while (!pageDone) {
        let attempt = 0;
        while (attempt < dayRetries) {
          try {
            this.logger.log(`[page:fetch] project=${project} entity=${entity} day=${day} offset=${offset} limit=${limit}`);
            let resp: any;
            if (entity === 'ad_plans') {
              const dto: any = { project, date_from: day, date_to: day, limit, offset };
              if (idsCsv) dto.ids = idsCsv;
              resp = await this.vk.getAdPlansDay(dto);
            } else if (entity === 'ad_groups') {
              const dto: any = { project, date_from: day, date_to: day, limit, offset };
              if (idsCsv) dto.ids = idsCsv;
              resp = await this.vk.getAdGroupsDay(dto);
            } else {
              const dto: any = { project, date_from: day, date_to: day, limit, offset };
              if (idsCsv) dto.ids = idsCsv;
              resp = await this.vk.getBannersDay(dto);
            }
            const items = Array.isArray(resp?.items) ? resp.items : [];
            this.logger.log(`[page:resp] project=${project} entity=${entity} day=${day} items=${items.length} count=${resp?.count ?? items.length}`);
            await this.persistStats(project, entity, day, day, items);
            this.logger.log(`[persist:done] project=${project} entity=${entity} day=${day} saved=${items.length}`);
            const count: number = Number(resp?.count || items.length);
            offset += limit;
            if (paceMs) await new Promise((r) => setTimeout(r, paceMs));
            if (offset >= count || !items.length) pageDone = true;
            break;
          } catch (e: any) {
            const status = typeof e?.getStatus === 'function' ? e.getStatus() : e?.status;
            if (status === 429) {
              const backoff = Math.min(5000, 1000 * Math.pow(2, attempt));
              this.logger.warn(`[429] project=${project} entity=${entity} day=${day} offset=${offset} attempt=${attempt + 1}/${dayRetries} backoffMs=${backoff}`);
              await new Promise((r) => setTimeout(r, backoff));
              attempt++;
              continue;
            }
            this.logger.error(`[error] project=${project} entity=${entity} day=${day} offset=${offset} msg=${e?.message || e}`);
            await this.notify(`VK ADS: ERROR ${project} ${entity} ${day}\n${e?.message || e}`);
            throw e;
          }
        }
        if (attempt >= dayRetries) {
          this.logger.warn(`Skip ${entity} ${project} ${day} after ${dayRetries} retries (429)`);
          await this.notify(`VK ADS: WARN skip ${project} ${entity} ${day} after ${dayRetries} retries (429)`);
          break;
        }
      }
      this.logger.log(`[day:done] project=${project} entity=${entity} day=${day}`);
      await this.notify(`VK ADS: day done ${project} ${entity} ${day}`);
    }
    this.logger.log(`[collectRange:done] project=${project} entity=${entity} from=${date_from} to=${date_to || date_from}`);
    await this.notify(`VK ADS: done ${project} ${entity} ${date_from}..${date_to || date_from}`);
  }

  private async notify(text: string) {
    try {
      const chatIdRaw = 317401874;
      const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN;
      if (!chatIdRaw || !token) return;
      const chat_id = Number(chatIdRaw);
      if (!Number.isFinite(chat_id)) return;
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id,
        text,
        parse_mode: 'HTML',
        disable_notification: true,
      });
    } catch (e) {
      // silent fail for notifications
    }
  }
}
