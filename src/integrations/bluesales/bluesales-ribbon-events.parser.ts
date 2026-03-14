import { Injectable } from '@nestjs/common';

export type CrmCustomerRibbonEvent = {
  id: string;
  dateLabel: string;
  occurredAt: string | null;
  contentHtml: string;
  contentText: string;
};

export type ParsedCrmCustomerRibbonEvent = {
  id: string;
  dateLabel: string;
  occurredAt: string | null;
  rawHtml: string;
  contentHtml: string;
  contentText: string;
};

export type NormalizedCrmEventType =
  | 'status_changed'
  | 'handoff_started'
  | 'manager_assigned'
  | 'tag_added'
  | 'waiting_photos_set'
  | 'order_created'
  | 'manager_message'
  | 'system_note';

export type NormalizedCrmEvent = {
  id: string;
  sourceEventId: string;
  type: NormalizedCrmEventType;
  timestamp: string | null;
  actor: 'manager' | 'assistant' | 'client' | 'system';
  payload: Record<string, unknown>;
  source: 'bluesales_ribbon';
  sourceHtmlFragment: string;
  sourceText: string;
};

export type CrmCustomerRibbonEventsResponse = {
  items: CrmCustomerRibbonEvent[];
  parsedEvents: ParsedCrmCustomerRibbonEvent[];
  normalizedEvents: NormalizedCrmEvent[];
  requestedCount: number;
  nextCount: number | null;
  hasMore: boolean;
};

const TABLE_ID_PATTERN =
  /<table\b[^>]*id=(['"])ctl00_ctl00_ContentPlaceHolder1_ContentPlaceHolder1_pgRibbonEvents_grdData\1[^>]*>([\s\S]*?)<\/table>/i;

@Injectable()
export class BlueSalesRibbonEventsParser {
  parse(
    html: string,
    requestedCount: number,
  ): CrmCustomerRibbonEventsResponse {
    const tableMatch = html.match(TABLE_ID_PATTERN);
    const tableHtml = tableMatch?.[0] ?? '';
    const tableBody = tableMatch?.[2] ?? '';
    const hasMore = /ribbon-events-show-more/i.test(html);

    if (!tableHtml || !tableBody) {
      return {
        items: [],
        parsedEvents: [],
        normalizedEvents: [],
        requestedCount,
        nextCount: null,
        hasMore: false,
      };
    }

    const rowMatches = tableBody.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
    const dataRows = rowMatches.filter((row) => /<td\b/i.test(row));
    const parsedEvents = dataRows
      .map((row, index) => this.parseRow(row, index))
      .filter((item): item is ParsedCrmCustomerRibbonEvent => Boolean(item));
    const items = parsedEvents.map<CrmCustomerRibbonEvent>((item) => ({
      id: item.id,
      dateLabel: item.dateLabel,
      occurredAt: item.occurredAt,
      contentHtml: item.contentHtml,
      contentText: item.contentText,
    }));
    const normalizedEvents = parsedEvents.map((item) =>
      this.normalizeParsedEvent(item),
    );

    return {
      items,
      parsedEvents,
      normalizedEvents,
      requestedCount,
      nextCount: hasMore ? requestedCount + 30 : null,
      hasMore,
    };
  }

  private parseRow(
    rowHtml: string,
    index: number,
  ): ParsedCrmCustomerRibbonEvent | null {
    const cells = Array.from(
      rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
      (match) => match[1] ?? '',
    );

    if (cells.length < 2) {
      return null;
    }

    const dateLabel = this.normalizeWhitespace(this.htmlToText(cells[0]));
    const contentHtml = this.sanitizeEventHtml(cells[1]);
    const contentText = this.normalizeWhitespace(this.htmlToText(cells[1]));

    if (!dateLabel && !contentText) {
      return null;
    }

    return {
      id: this.buildEventId(dateLabel, contentText, index),
      dateLabel,
      occurredAt: this.parseOccurredAt(dateLabel),
      rawHtml: cells[1].trim(),
      contentHtml,
      contentText,
    };
  }

  private normalizeParsedEvent(
    event: ParsedCrmCustomerRibbonEvent,
  ): NormalizedCrmEvent {
    const text = event.contentText;
    const lower = text.toLowerCase();
    const statusMatch = text.match(/сменил статус с\s+(.+?)\s+на\s+(.+)$/i);
    const managerAssignedMatch = text.match(
      /(?:назнач|ответственн(?:ым|ого)|менеджер(?:ом)?)[^.,\n]*?([А-ЯA-Z][^.,\n]+)$/i,
    );
    const tagMatch = text.match(/(?:добавил|добавлена|присвоен)\s+тег\s+(.+)$/i);

    if (statusMatch) {
      return {
        id: `${event.id}:status_changed`,
        sourceEventId: event.id,
        type: 'status_changed',
        timestamp: event.occurredAt,
        actor: 'system',
        payload: {
          fromStatus: this.normalizeWhitespace(statusMatch[1]),
          toStatus: this.normalizeWhitespace(statusMatch[2]),
        },
        source: 'bluesales_ribbon',
        sourceHtmlFragment: event.contentHtml,
        sourceText: event.contentText,
      };
    }

    if (
      /передал[аи]? менеджер|передача менеджер|handoff|передан менеджеру/i.test(
        lower,
      )
    ) {
      return {
        id: `${event.id}:handoff_started`,
        sourceEventId: event.id,
        type: 'handoff_started',
        timestamp: event.occurredAt,
        actor: 'system',
        payload: {
          summary: event.contentText,
        },
        source: 'bluesales_ribbon',
        sourceHtmlFragment: event.contentHtml,
        sourceText: event.contentText,
      };
    }

    if (
      /назначен менеджер|назначили менеджера|ответственный менеджер/i.test(lower)
    ) {
      return {
        id: `${event.id}:manager_assigned`,
        sourceEventId: event.id,
        type: 'manager_assigned',
        timestamp: event.occurredAt,
        actor: 'system',
        payload: {
          managerName: managerAssignedMatch
            ? this.normalizeWhitespace(managerAssignedMatch[1])
            : null,
          summary: event.contentText,
        },
        source: 'bluesales_ribbon',
        sourceHtmlFragment: event.contentHtml,
        sourceText: event.contentText,
      };
    }

    if (/жд[её]м фото|ожидаем фото|ждем фотографии|ожидаем фотографии/i.test(lower)) {
      return {
        id: `${event.id}:waiting_photos_set`,
        sourceEventId: event.id,
        type: 'waiting_photos_set',
        timestamp: event.occurredAt,
        actor: 'system',
        payload: {
          summary: event.contentText,
        },
        source: 'bluesales_ribbon',
        sourceHtmlFragment: event.contentHtml,
        sourceText: event.contentText,
      };
    }

    if (/создан заказ|создала заказ|оформил заказ|готов оформить/i.test(lower)) {
      return {
        id: `${event.id}:order_created`,
        sourceEventId: event.id,
        type: 'order_created',
        timestamp: event.occurredAt,
        actor: 'system',
        payload: {
          summary: event.contentText,
        },
        source: 'bluesales_ribbon',
        sourceHtmlFragment: event.contentHtml,
        sourceText: event.contentText,
      };
    }

    if (tagMatch || /тег|ярлык|label/i.test(lower)) {
      return {
        id: `${event.id}:tag_added`,
        sourceEventId: event.id,
        type: 'tag_added',
        timestamp: event.occurredAt,
        actor: 'system',
        payload: {
          tag: tagMatch ? this.normalizeWhitespace(tagMatch[1]) : null,
          summary: event.contentText,
        },
        source: 'bluesales_ribbon',
        sourceHtmlFragment: event.contentHtml,
        sourceText: event.contentText,
      };
    }

    if (
      /написал|ответил|сообщение|message-quote-in-ribbon-event/i.test(lower) ||
      /message-quote-in-ribbon-event/i.test(event.contentHtml)
    ) {
      return {
        id: `${event.id}:manager_message`,
        sourceEventId: event.id,
        type: 'manager_message',
        timestamp: event.occurredAt,
        actor: 'manager',
        payload: {
          summary: event.contentText,
        },
        source: 'bluesales_ribbon',
        sourceHtmlFragment: event.contentHtml,
        sourceText: event.contentText,
      };
    }

    return {
      id: `${event.id}:system_note`,
      sourceEventId: event.id,
      type: 'system_note',
      timestamp: event.occurredAt,
      actor: 'system',
      payload: {
        summary: event.contentText,
      },
      source: 'bluesales_ribbon',
      sourceHtmlFragment: event.contentHtml,
      sourceText: event.contentText,
    };
  }

  private sanitizeEventHtml(rawHtml: string) {
    let html = rawHtml;

    html = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<!--[\s\S]*?-->/g, '');

    html = html.replace(/<br\s*\/?>/gi, '<br>');

    html = html.replace(/<(\/?)([a-z0-9]+)\b([^>]*)>/gi, (_, slash, tag, attrs) => {
      const normalizedTag = String(tag).toLowerCase();
      const allowedTags = new Set(['a', 'strong', 'span', 'div', 'br']);

      if (!allowedTags.has(normalizedTag)) {
        return '';
      }

      if (slash) {
        return normalizedTag === 'br' ? '' : `</${normalizedTag}>`;
      }

      if (normalizedTag === 'br') {
        return '<br>';
      }

      if (normalizedTag === 'a') {
        const href = this.extractAttr(attrs, 'href');
        const normalizedHref = this.normalizeHref(href);
        if (!normalizedHref) {
          return '<a>';
        }

        return `<a href="${this.escapeHtmlAttribute(
          normalizedHref,
        )}" target="_blank" rel="noopener noreferrer">`;
      }

      const className = this.extractAttr(attrs, 'class');
      const safeClassName = className.replace(/[^a-zA-Z0-9_\-\s]/g, ' ').trim();
      const style = this.sanitizeStyle(this.extractAttr(attrs, 'style'));

      const attrParts: string[] = [];
      if (safeClassName) {
        attrParts.push(`class="${this.escapeHtmlAttribute(safeClassName)}"`);
      }
      if (style) {
        attrParts.push(`style="${this.escapeHtmlAttribute(style)}"`);
      }

      return `<${normalizedTag}${attrParts.length ? ` ${attrParts.join(' ')}` : ''}>`;
    });

    return html.trim();
  }

  private extractAttr(attrs: string, attrName: string) {
    const quotedMatch = attrs.match(
      new RegExp(`\\b${attrName}=(['"])([\\s\\S]*?)\\1`, 'i'),
    );
    if (quotedMatch) {
      return this.decodeHtmlEntities(quotedMatch[2]);
    }

    const rawMatch = attrs.match(new RegExp(`\\b${attrName}=([^\\s>]+)`, 'i'));
    if (rawMatch) {
      return this.decodeHtmlEntities(rawMatch[1]);
    }

    return '';
  }

  private sanitizeStyle(rawStyle: string) {
    const declarations = rawStyle
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean);

    const safeDeclarations: string[] = [];
    for (const declaration of declarations) {
      const separatorIndex = declaration.indexOf(':');
      if (separatorIndex <= 0) continue;

      const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
      const value = declaration.slice(separatorIndex + 1).trim();

      if (!value) continue;

      if (
        property === 'color' &&
        /^#[0-9a-f]{3,6}$/i.test(value)
      ) {
        safeDeclarations.push(`color: ${value}`);
      }

      if (
        property === 'font-weight' &&
        /^(bold|normal|[1-9]00)$/i.test(value)
      ) {
        safeDeclarations.push(`font-weight: ${value}`);
      }
    }

    return safeDeclarations.join('; ');
  }

  private normalizeHref(href: string) {
    const normalized = href.trim();
    if (!normalized) return '';
    if (/^https?:\/\//i.test(normalized)) return normalized;
    if (normalized.startsWith('/')) {
      return `https://bluesales.ru${normalized}`;
    }
    return '';
  }

  private htmlToText(html: string) {
    const withBreaks = html.replace(/<br\s*\/?>/gi, '\n');
    const withoutTags = withBreaks.replace(/<[^>]+>/g, ' ');
    return this.decodeHtmlEntities(withoutTags);
  }

  private normalizeWhitespace(value: string) {
    return value
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private parseOccurredAt(dateLabel: string) {
    const match = dateLabel.match(
      /^(\d{2})\.(\d{2})\.(\d{4})\s+в\s+(\d{1,2}):(\d{2})$/,
    );

    if (!match) {
      return null;
    }

    const [, day, month, year, hours, minutes] = match;
    return `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${minutes}:00+03:00`;
  }

  private buildEventId(dateLabel: string, contentText: string, index: number) {
    const raw = `${dateLabel}|${contentText}|${index}`;
    let hash = 0;
    for (let cursor = 0; cursor < raw.length; cursor += 1) {
      hash = (hash * 31 + raw.charCodeAt(cursor)) >>> 0;
    }

    return `ribbon-${hash.toString(16)}`;
  }

  private decodeHtmlEntities(value: string) {
    return String(value)
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  private escapeHtmlAttribute(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
