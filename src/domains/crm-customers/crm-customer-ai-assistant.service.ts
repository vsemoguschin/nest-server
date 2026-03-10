import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { CrmCustomerCommunicationsService } from './crm-customer-communications.service';
import { AnalyzeCrmCustomerDialogDto } from './dto/analyze-crm-customer-dialog.dto';

type VkHistoryItem = {
  id?: number;
  from_id?: number;
  peer_id?: number;
  date?: number;
  text?: string;
  out?: 0 | 1;
};

type VkHistoryResponse = {
  response?: {
    count?: number;
    items?: VkHistoryItem[];
  };
  error?: {
    error_code?: number;
    error_msg?: string;
  };
};

type AssistantQuickReplyResponse = {
  reply: string;
  model: string | null;
  provider: string;
  requestId: string | null;
  messageId: string | null;
  conversationId: string | null;
};

const QUICK_REPLY_HISTORY_LIMIT = 4;
const DIALOG_SUMMARY_HISTORY_LIMIT = 8;
const QUICK_REPLY_FETCH_COUNT = 10;
const ANALYZE_MESSAGE_MAX_LENGTH = 220;
const CRM_CONTEXT_MAX_LENGTH = 400;
const CRM_FIELD_MAX_LENGTH = 120;
const QUICK_REPLY_MAX_LENGTH = 220;
const DIALOG_SUMMARY_MAX_LENGTH = 280;

@Injectable()
export class CrmCustomerAiAssistantService {
  private readonly assistantHttp: AxiosInstance;
  private readonly assistantBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly communicationsService: CrmCustomerCommunicationsService,
  ) {
    this.assistantBaseUrl =
      this.config.get<string>('ASSISTANT_SERVICE_URL') ||
      'http://127.0.0.1:8090';

    this.assistantHttp = axios.create({
      baseURL: this.assistantBaseUrl,
      timeout: Number(
        this.config.get<string>('ASSISTANT_SERVICE_TIMEOUT_MS') || 30000,
      ),
    });
  }

  async analyzeVkDialog(
    customerId: number,
    dto: AnalyzeCrmCustomerDialogDto,
  ) {
    return this.suggestVkReply(customerId, dto);
  }

  async suggestVkReply(
    customerId: number,
    dto: AnalyzeCrmCustomerDialogDto,
  ) {
    const customer = await this.prisma.crmCustomer.findFirst({
      where: { id: customerId },
      select: {
        id: true,
        fullName: true,
        comments: true,
        shortNotes: true,
        account: {
          select: {
            code: true,
            name: true,
          },
        },
        manager: {
          select: {
            fullName: true,
          },
        },
        crmStatus: {
          select: {
            name: true,
          },
        },
        tags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
        vk: {
          select: {
            externalId: true,
            name: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('CRM-клиент не найден');
    }

    const historyResult = await this.communicationsService.getVkDialogHistory(
      customerId,
      {
        count: String(Math.min(dto.count ?? QUICK_REPLY_FETCH_COUNT, 12)),
      },
    );

    if (historyResult.status >= 400) {
      throw new BadGatewayException({
        message: 'Не удалось получить историю VK-диалога',
        vkServiceStatus: historyResult.status,
        vkServiceData: historyResult.data,
      });
    }

    const historyData = (historyResult.data || {}) as VkHistoryResponse;
    if (historyData.error) {
      throw new BadGatewayException({
        message: 'VK API returned an error',
        vkError: historyData.error,
      });
    }

    const items = Array.isArray(historyData.response?.items)
      ? historyData.response?.items || []
      : [];

    const recentHistory = this.formatHistory(items).slice(-DIALOG_SUMMARY_HISTORY_LIMIT);
    const formattedHistory = recentHistory.slice(-QUICK_REPLY_HISTORY_LIMIT);
    const latestCustomerMessage = this.pickLatestCustomerMessage(items);

    if (!latestCustomerMessage) {
      throw new BadGatewayException(
        'VK history does not contain a customer message to analyze',
      );
    }

    const dialogSummary = this.buildDialogSummary(
      recentHistory,
      latestCustomerMessage.text || '',
    );

    const assistantPayload = {
      message: this.buildReplyRequestMessage(
        formattedHistory,
        latestCustomerMessage.text || '',
        dialogSummary,
      ),
      channel: 'vk',
      conversationId: customer.vk?.externalId?.trim() || null,
      customerContext: this.buildCustomerContext(customer, dto.customerContext),
      systemPrompt: dto.systemPrompt || this.buildQuickReplySystemPrompt(),
      maxOutputTokens: 120,
    };

    let assistantData: AssistantQuickReplyResponse;
    try {
      const assistantResponse = await this.assistantHttp.post<AssistantQuickReplyResponse>(
        '/api/chat/respond/timeweb-native',
        assistantPayload,
      );
      assistantData = assistantResponse.data;
    } catch (error: any) {
      assistantData = this.buildLocalFallbackReply(formattedHistory, latestCustomerMessage.text || '');
    }

    return {
      customer: {
        id: customer.id,
        fullName: customer.fullName ?? '',
        accountCode: customer.account?.code ?? '',
        accountName: customer.account?.name ?? '',
        managerName: customer.manager?.fullName ?? '',
        crmStatusName: customer.crmStatus?.name ?? '',
        vkExternalId: customer.vk?.externalId ?? '',
        vkName: customer.vk?.name ?? '',
        tags: customer.tags
          .map((item) => item.tag?.name ?? '')
          .filter(Boolean),
      },
      latestCustomerMessage: latestCustomerMessage.text || '',
      dialogSummary,
      history: formattedHistory,
      ai: {
        suggestedReply: this.normalizeSuggestedReply(assistantData.reply),
        suggestedStatus: '',
        suggestedTags: [],
        shouldHandoff: false,
        handoffReason: '',
        provider: assistantData.provider,
        requestId: assistantData.requestId,
        messageId: assistantData.messageId,
        conversationId: assistantData.conversationId,
        raw: assistantData.reply,
      },
    };
  }

  private formatHistory(items: VkHistoryItem[]): string[] {
    return [...items]
      .sort((a, b) => (a.date ?? 0) - (b.date ?? 0))
      .map((item) => {
        const role = item.out === 1 ? 'Менеджер' : 'Клиент';
        const text = this.truncate(
          (item.text || '').trim() || '[пустое сообщение]',
          ANALYZE_MESSAGE_MAX_LENGTH,
        );
        return `${role}: ${text}`;
      });
  }

  private pickLatestCustomerMessage(items: VkHistoryItem[]): VkHistoryItem | null {
    const sorted = [...items].sort((a, b) => (a.date ?? 0) - (b.date ?? 0));

    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const item = sorted[index];
      if (item.out !== 1 && (item.text || '').trim().length > 0) {
        return item;
      }
    }

    return null;
  }

  private buildCustomerContext(
    customer: {
      fullName: string | null;
      comments: string | null;
      shortNotes: string | null;
      account: { code: string | null; name: string | null } | null;
      manager: { fullName: string | null } | null;
      crmStatus: { name: string | null } | null;
      tags: Array<{ tag: { name: string | null } | null }>;
      vk: { externalId: string | null; name: string | null } | null;
    },
    extraContext?: string,
  ) {
    const tagNames = customer.tags
      .map((item) => item.tag?.name?.trim() || '')
      .filter(Boolean);

    const parts = [
      customer.fullName ? `Клиент: ${customer.fullName}` : null,
      customer.crmStatus?.name ? `Текущий CRM-статус: ${customer.crmStatus.name}` : null,
      tagNames.length ? `Теги CRM: ${tagNames.join(', ')}` : null,
      customer.shortNotes?.trim()
        ? `Краткие заметки: ${this.truncate(customer.shortNotes.trim(), CRM_FIELD_MAX_LENGTH)}`
        : null,
      customer.comments?.trim()
        ? `Комментарий CRM: ${this.truncate(customer.comments.trim(), CRM_FIELD_MAX_LENGTH)}`
        : null,
      extraContext?.trim()
        ? `Доп. контекст: ${this.truncate(extraContext.trim(), CRM_FIELD_MAX_LENGTH)}`
        : null,
    ].filter(Boolean);

    return this.truncate(parts.join('\n'), CRM_CONTEXT_MAX_LENGTH);
  }

  private buildQuickReplySystemPrompt(): string {
    return [
      'Ты менеджер по фотокнигам.',
      'Твоя задача: предложить только один короткий ответ клиенту по последним сообщениям диалога.',
      'Отвечай как живой менеджер, спокойно и по делу.',
      'Не используй эмодзи, списки, markdown, обращения по имени и длинные объяснения.',
      'Не представляйся AI и не упоминай бота.',
      'Если данных мало, задай один короткий уточняющий вопрос.',
      'Ответ должен быть максимум 1-2 коротких предложения.',
      'Не объясняй свою позицию и не описывай процесс работы.',
      'Верни только текст ответа менеджера.',
    ].join(' ');
  }

  private buildReplyRequestMessage(
    history: string[],
    latestCustomerMessage: string,
    dialogSummary: string,
  ): string {
    const compactHistory = history.length
      ? `Последние сообщения диалога:\n${history.join('\n')}`
      : 'Последние сообщения диалога: нет';

    return [
      `Краткая сводка диалога:\n${dialogSummary}`,
      compactHistory,
      `Последнее сообщение клиента:\n${this.truncate(latestCustomerMessage, ANALYZE_MESSAGE_MAX_LENGTH)}`,
      'Предложи один короткий следующий ответ менеджера клиенту.',
      'Нужен только сам текст ответа без вступлений и пояснений.',
    ].join('\n\n');
  }

  private buildLocalFallbackReply(
    history: string[],
    latestCustomerMessage: string,
  ): AssistantQuickReplyResponse {
    const normalizedMessage = latestCustomerMessage.toLowerCase();
    const lastManagerMessage = [...history]
      .reverse()
      .find((item) => item.startsWith('Менеджер:'))
      ?.replace(/^Менеджер:\s*/u, '')
      .toLowerCase();

    let reply =
      'Подскажите, пожалуйста, для какого случая нужна фотокнига и в какие сроки хотите получить?';

    if (/(оформить|готов[ао]?\s*заказ|давайте оформ|закаж)/u.test(normalizedMessage)) {
      reply =
        'Отлично, тогда передаю ваш запрос менеджеру, чтобы быстро помочь с оформлением заказа.';
    } else if (
      /(нахрена|раскрут|бабк|обман|впар|развод|не устраивает|не нравится|что за)/u.test(
        normalizedMessage,
      )
    ) {
      reply = lastManagerMessage?.includes('макет') || lastManagerMessage?.includes('дизайн')
        ? 'Понимаю ваше недовольство. Не пытаюсь навязать лишнее. Подскажите, пожалуйста, что именно не устроило в макете или предложенном варианте?'
        : 'Понимаю ваше недовольство. Не пытаюсь навязать лишнее. Подскажите, пожалуйста, что именно вас смутило: цена, вариант или условия?';
    } else if (/(оплат|ссылк.*оплат|перевест[иь]\s+деньг)/u.test(normalizedMessage)) {
      reply =
        'Сейчас подключу менеджера, чтобы он помог с оплатой и дальнейшим оформлением.';
    } else if (/(срочн|завтр|к\s+\d{1,2}[./]\d{1,2}|к\s+выходным|горит)/u.test(normalizedMessage)) {
      reply =
        'Подскажите, пожалуйста, к какой именно дате нужна готовая фотокнига? Тогда смогу сразу сориентировать по варианту.';
    } else if (/(цен|сколько\s+стоит|стоимост)/u.test(normalizedMessage)) {
      reply =
        'Подскажите, пожалуйста, какой формат фотокниги рассматриваете и на какой повод она нужна? Тогда смогу точнее сориентировать вас по варианту.';
    } else if (
      /(подар|девушк|парн|маме|папе|ребенк|семь|день\s*рожд|юбиле)/u.test(
        normalizedMessage,
      )
    ) {
      reply =
        'Подскажите, пожалуйста, на какой повод нужна фотокнига и какой стиль вам ближе: более нежный, классический или современный?';
    } else if (/(пример|показат|фото|образец|вариант)/u.test(normalizedMessage)) {
      reply =
        'Да, конечно. Подскажите, пожалуйста, какой стиль вам ближе, чтобы я предложила наиболее подходящие варианты.';
    } else if (
      lastManagerMessage &&
      /(для какого случая|на какой повод)/u.test(lastManagerMessage)
    ) {
      reply =
        'Спасибо. Подскажите, пожалуйста, в какие сроки хотите получить фотокнигу и какой стиль вам ближе?';
    } else if (
      lastManagerMessage &&
      /(в какие сроки|к какой дате)/u.test(lastManagerMessage)
    ) {
      reply =
        'Поняла. Подскажите, пожалуйста, какой формат фотокниги вам ближе: более классический или современный?';
    }

    return {
      reply: this.normalizeSuggestedReply(reply),
      model: null,
      provider: 'local-fallback',
      requestId: null,
      messageId: null,
      conversationId: null,
    };
  }

  private normalizeSuggestedReply(value: string): string {
    const normalized = value
      .replace(/\r/g, '')
      .replace(/\n{2,}/g, '\n')
      .trim();

    const firstParagraph = normalized.split('\n')[0]?.trim() || normalized;
    const withoutName = firstParagraph.replace(
      /^[А-ЯA-ZЁ][а-яa-zё-]+,\s*/u,
      '',
    );

    return this.truncate(withoutName, QUICK_REPLY_MAX_LENGTH);
  }

  private buildDialogSummary(
    history: string[],
    latestCustomerMessage: string,
  ): string {
    const normalizedLatest = latestCustomerMessage.toLowerCase();
    const lastManagerMessage = [...history]
      .reverse()
      .find((item) => item.startsWith('Менеджер:'))
      ?.replace(/^Менеджер:\s*/u, '')
      .toLowerCase();
    const managerMessages = history
      .filter((item) => item.startsWith('Менеджер:'))
      .map((item) => item.replace(/^Менеджер:\s*/u, '').toLowerCase());
    const customerMessages = history
      .filter((item) => item.startsWith('Клиент:'))
      .map((item) => item.replace(/^Клиент:\s*/u, '').toLowerCase());
    const combinedHistory = history.join(' ').toLowerCase();

    const summaryParts: string[] = [];

    if (
      /(нахрена|раскрут|бабк|обман|впар|развод|не устраивает|не нравится|что за)/u.test(
        `${combinedHistory} ${normalizedLatest}`,
      )
    ) {
      summaryParts.push('Клиент раздражён и воспринимает предложение как навязывание.');
    }

    if (
      managerMessages.some(
        (message) =>
          message.includes('макет') ||
          message.includes('дизайн') ||
          message.includes('вариант'),
      )
    ) {
      summaryParts.push('Недавно менеджер отправлял макет или обсуждал дизайн.');
    }

    if (/(макет|дизайн|вариант)/u.test(`${combinedHistory} ${normalizedLatest}`)) {
      summaryParts.push('Сейчас обсуждается качество макета или предложенного варианта.');
    }

    if (/(цен|сколько\s+стоит|стоимост|дорого|переплат)/u.test(`${combinedHistory} ${normalizedLatest}`)) {
      summaryParts.push('Клиента беспокоит цена или ощущение переплаты.');
    }

    if (
      customerMessages.some((message) =>
        /(не понял|непонятно|что дальше|и что|что делать)/u.test(message),
      )
    ) {
      summaryParts.push('Клиенту не хватает ясности по следующему шагу.');
    }

    if (
      lastManagerMessage &&
      /(посмотрите|все ли нравится|запускаем в работу|по готовности отправлю)/u.test(
        lastManagerMessage,
      )
    ) {
      summaryParts.push('Последняя инициатива в диалоге была со стороны менеджера.');
    }

    if (!summaryParts.length) {
      summaryParts.push(
        'Нужно предложить спокойный следующий ответ менеджера по последним сообщениям без повторного старта диалога.',
      );
    }

    return this.truncate(summaryParts.join(' '), DIALOG_SUMMARY_MAX_LENGTH);
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength - 1).trimEnd()}…`;
  }
}
