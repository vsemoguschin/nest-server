import {
  BadGatewayException,
  HttpException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import { CuratorAnalyzeDto } from './dto/curator-analyze.dto';
import {
  CuratorProposalCreateDto,
  CuratorProposalListQueryDto,
  CuratorProposalRecord,
  CuratorStructuredRecommendation,
} from './dto/curator-proposal.dto';
import {
  CURATOR_PROPOSAL_STORAGE,
  CuratorProposalStorage,
} from './curator-proposal.storage';

type CuratorRuntimeResponse = {
  requestId: string;
  text: string;
  workspace: string;
  service: string;
};

const CURATOR_PROMPT_MAX_CHARS = 9500;
const CURATOR_PROMPT_TIERS = [
  {
    maxMessages: 8,
    maxMessageChars: 700,
    maxSummaryChars: 1200,
    maxQuestionChars: 1200,
    maxCrmContextChars: 1200,
    maxReviewRecordChars: 2200,
  },
  {
    maxMessages: 6,
    maxMessageChars: 450,
    maxSummaryChars: 900,
    maxQuestionChars: 900,
    maxCrmContextChars: 900,
    maxReviewRecordChars: 1500,
  },
  {
    maxMessages: 4,
    maxMessageChars: 280,
    maxSummaryChars: 700,
    maxQuestionChars: 700,
    maxCrmContextChars: 600,
    maxReviewRecordChars: 900,
  },
] as const;

type CuratorPromptTier = {
  maxMessages: number;
  maxMessageChars: number;
  maxSummaryChars: number;
  maxQuestionChars: number;
  maxCrmContextChars: number;
  maxReviewRecordChars: number;
};

@Injectable()
export class CuratorAssistantService {
  private readonly logger = new Logger(CuratorAssistantService.name);
  private readonly assistantHttp: AxiosInstance;
  private readonly assistantBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(CURATOR_PROPOSAL_STORAGE)
    private readonly proposalStorage: CuratorProposalStorage,
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

  async analyzeConversation(
    dto: CuratorAnalyzeDto,
    actor: { id: string | number | null; fullName: string | null },
  ) {
    const analysisId = randomUUID();

    this.logger.log(
      JSON.stringify({
        event: 'curator.analysis.request',
        analysisId,
        conversationId: dto.conversationId,
        actorId: actor.id,
        actorFullName: actor.fullName,
        messageCount: dto.conversationContext.messages.length,
        hasReviewRecord: Boolean(dto.reviewRecord),
      }),
    );

    const prompt = this.buildCuratorPrompt(dto);
    this.logger.log(
      JSON.stringify({
        event: 'curator.analysis.prompt_built',
        analysisId,
        conversationId: dto.conversationId,
        promptLength: prompt.length,
      }),
    );
    const runtimeResponse = await this.runCuratorRuntime(prompt, analysisId);
    const structuredRecommendation = this.parseStructuredRecommendation(
      runtimeResponse.text,
    );

    return {
      analysisId,
      conversationId: dto.conversationId,
      workspace: 'assistant-dev',
      requestId: runtimeResponse.requestId,
      question: dto.curatorQuestion,
      structuredRecommendation,
      rawText: runtimeResponse.text,
      createdAt: new Date().toISOString(),
      deferred: [
        'direct brain file editing',
        'diff/review/publish',
        'analytics loop',
        'self-improvement loop',
      ],
    };
  }

  async createProposalDraft(
    dto: CuratorProposalCreateDto,
    actor: { id: string | number | null; fullName: string | null },
  ): Promise<CuratorProposalRecord> {
    return this.proposalStorage.create({
      ...dto,
      createdBy: actor,
    });
  }

  async listProposalDrafts(
    query: CuratorProposalListQueryDto,
  ): Promise<CuratorProposalRecord[]> {
    return this.proposalStorage.list({
      conversationId: query.conversationId,
    });
  }

  private async runCuratorRuntime(
    prompt: string,
    analysisId: string,
  ): Promise<CuratorRuntimeResponse> {
    try {
      const response = await this.assistantHttp.post<CuratorRuntimeResponse>(
        '/api/curator/run',
        {
          prompt,
          requestId: analysisId,
        },
      );

      return response.data;
    } catch (error: any) {
      if (error?.response) {
        throw new BadGatewayException({
          message: 'assistant-service curator runtime returned an error',
          assistantUrl: this.assistantBaseUrl,
          assistantStatus: error.response.status,
          assistantData: error.response.data,
        });
      }

      throw new BadGatewayException({
        message: 'assistant-service curator runtime is unavailable',
        assistantUrl: this.assistantBaseUrl,
        assistantErrorCode: error?.code ?? null,
        assistantErrorMessage: error?.message ?? 'Unknown assistant error',
      });
    }
  }

  private buildCuratorPrompt(dto: CuratorAnalyzeDto): string {
    const preamble = [
      'Ты работаешь как curator assistant для улучшения assistant brain.',
      'Ты НЕ редактируешь файлы и НЕ публикуешь изменения.',
      'Ты анализируешь conversation context и возвращаешь только структурированные proposal drafts для assistant-dev.',
      'Не предлагай изменения CRM business logic или инфраструктуры.',
      'Не предлагай прямые изменения assistant-live.',
      'Если контекст был сокращён, учитывай только переданные фрагменты и не придумывай недостающие детали.',
      'Верни ТОЛЬКО JSON без markdown и без пояснений вне JSON.',
    ].join('\n\n');

    for (const tier of CURATOR_PROMPT_TIERS) {
      const prompt = this.composePromptFromTier(dto, preamble, tier);
      if (prompt.length <= CURATOR_PROMPT_MAX_CHARS) {
        return prompt;
      }
    }

    const lastTier = CURATOR_PROMPT_TIERS[CURATOR_PROMPT_TIERS.length - 1];
    const fallbackPrompt = this.composePromptFromTier(dto, preamble, {
      ...lastTier,
      maxMessages: 3,
      maxMessageChars: 180,
      maxSummaryChars: 450,
      maxQuestionChars: 500,
      maxCrmContextChars: 400,
      maxReviewRecordChars: 500,
    });

    if (fallbackPrompt.length <= CURATOR_PROMPT_MAX_CHARS) {
      return fallbackPrompt;
    }

    const emergencyPrompt = this.composePromptFromTier(dto, preamble, {
      ...lastTier,
      maxMessages: 2,
      maxMessageChars: 120,
      maxSummaryChars: 220,
      maxQuestionChars: 240,
      maxCrmContextChars: 0,
      maxReviewRecordChars: 0,
    });

    if (emergencyPrompt.length <= CURATOR_PROMPT_MAX_CHARS) {
      return emergencyPrompt;
    }

    throw new BadGatewayException({
      message: 'Curator prompt budget overflow',
      maxPromptChars: CURATOR_PROMPT_MAX_CHARS,
      conversationId: dto.conversationId,
    });
  }

  private composePromptFromTier(
    dto: CuratorAnalyzeDto,
    preamble: string,
    tier: CuratorPromptTier,
  ) {
    const payload = {
      conversationId: dto.conversationId,
      curatorQuestion: this.truncateText(dto.curatorQuestion, tier.maxQuestionChars),
      sourceReference: dto.sourceReference ?? null,
      conversationContext: {
        messages: this.buildBudgetedMessages(dto, tier),
        summary: dto.conversationContext.summary
          ? this.truncateText(dto.conversationContext.summary, tier.maxSummaryChars)
          : null,
        crmContext: this.stringifyAndTruncateObject(
          dto.conversationContext.crmContext ?? null,
          tier.maxCrmContextChars,
        ),
      },
      reviewRecord: this.stringifyAndTruncateObject(
        this.buildReviewRecordSummary(dto.reviewRecord ?? null),
        tier.maxReviewRecordChars,
      ),
      truncation: this.buildTruncationMeta(dto, tier),
      outputSchema: {
        summary: 'string',
        whyAssistantAnsweredThisWay: 'string',
        improvementFocus: ['string'],
        guardrails: ['string'],
        proposalDrafts: [
          {
            targetWorkspace: 'assistant-dev',
            artifactType: 'instruction | script | faq | pricing | rule | template',
            targetKey: 'string | null',
            targetPath: 'string | null',
            changeType: 'add | update | clarify | remove',
            reason: 'string',
            proposedContent: 'string',
          },
        ],
      },
    };

    return [preamble, JSON.stringify(payload, null, 2)].join('\n\n');
  }

  private parseStructuredRecommendation(
    rawText: string,
  ): CuratorStructuredRecommendation {
    const normalized = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const jsonPayload = this.extractJsonObject(normalized);

    try {
      const parsed = JSON.parse(jsonPayload) as CuratorStructuredRecommendation;

      if (
        !parsed ||
        typeof parsed.summary !== 'string' ||
        typeof parsed.whyAssistantAnsweredThisWay !== 'string' ||
        !Array.isArray(parsed.improvementFocus) ||
        !Array.isArray(parsed.guardrails) ||
        !Array.isArray(parsed.proposalDrafts)
      ) {
        throw new Error('Structured recommendation schema mismatch');
      }

      return parsed;
    } catch (error) {
      throw new HttpException(
        {
          message:
            'Curator runtime returned non-structured response. Proposal draft creation is blocked.',
          rawText,
        },
        502,
      );
    }
  }

  private extractJsonObject(rawText: string): string {
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      throw new Error('No JSON object found in curator response');
    }

    return rawText.slice(start, end + 1);
  }

  private buildBudgetedMessages(dto: CuratorAnalyzeDto, tier: CuratorPromptTier) {
    return dto.conversationContext.messages
      .slice(-tier.maxMessages)
      .map((message) => ({
        id: message.id ?? null,
        role: message.role,
        createdAt: message.createdAt ?? null,
        text: this.truncateText(message.text, tier.maxMessageChars),
      }));
  }

  private buildReviewRecordSummary(reviewRecord: Record<string, unknown> | null) {
    if (!reviewRecord || typeof reviewRecord !== 'object') {
      return null;
    }

    const source = reviewRecord as Record<string, any>;

    return {
      reviewRecordId: source.reviewRecordId ?? null,
      executionMode: source.executionMode ?? null,
      linking: source.linking ?? null,
      historical: source.historical
        ? {
            clientMessage: source.historical.clientMessage ?? null,
            assistantReply: source.historical.assistantReply ?? null,
            sessionOutcome: source.historical.sessionOutcome ?? null,
          }
        : null,
      context: source.context
        ? {
            processContext: source.context.processContext
              ? {
                  nearbyCrmEventTypes:
                    source.context.processContext.nearbyCrmEventTypes ?? [],
                  processVerdict:
                    source.context.processContext.processVerdict ?? null,
                  humanOverride:
                    source.context.processContext.humanOverride ?? null,
                  mismatchReasons:
                    source.context.processContext.mismatchReasons ?? [],
                  templateSelection:
                    source.context.processContext.templateSelection ?? null,
                  processSemantics:
                    source.context.processContext.processSemantics ?? null,
                }
              : null,
          }
        : null,
      replay: source.replay
        ? {
            reply: source.replay.reply ?? null,
            runtimeDecision: source.replay.runtimeDecision ?? null,
            runtimeVersion: source.replay.runtimeVersion ?? null,
          }
        : null,
    };
  }

  private buildTruncationMeta(
    dto: CuratorAnalyzeDto,
    tier: CuratorPromptTier,
  ) {
    return {
      mode: 'budgeted',
      originalMessageCount: dto.conversationContext.messages.length,
      includedMessageCount: Math.min(
        dto.conversationContext.messages.length,
        tier.maxMessages,
      ),
      maxMessageChars: tier.maxMessageChars,
      maxQuestionChars: tier.maxQuestionChars,
      summaryTruncated: Boolean(
        dto.conversationContext.summary &&
          dto.conversationContext.summary.length > tier.maxSummaryChars,
      ),
      crmContextIncluded: tier.maxCrmContextChars > 0,
      crmContextTruncated: Boolean(
        dto.conversationContext.crmContext &&
          this.stringifyAndTruncateObject(
            dto.conversationContext.crmContext,
            tier.maxCrmContextChars,
          ) !== JSON.stringify(dto.conversationContext.crmContext, null, 2),
      ),
      reviewRecordIncluded: tier.maxReviewRecordChars > 0,
      reviewRecordTruncated: Boolean(
        dto.reviewRecord &&
          this.stringifyAndTruncateObject(
            this.buildReviewRecordSummary(dto.reviewRecord),
            tier.maxReviewRecordChars,
          ) !==
            JSON.stringify(
              this.buildReviewRecordSummary(dto.reviewRecord),
              null,
              2,
            ),
      ),
      explicitNotice:
        'Conversation context is intentionally truncated to fit curator runtime prompt budget.',
    };
  }

  private stringifyAndTruncateObject(
    value: Record<string, unknown> | null,
    maxChars: number,
  ) {
    if (!value || maxChars <= 0) {
      return null;
    }

    return this.truncateText(JSON.stringify(value, null, 2), maxChars);
  }

  private truncateText(value: string, maxChars: number) {
    if (value.length <= maxChars) {
      return value;
    }

    const suffix = ' ...[truncated]';
    const safeMax = Math.max(0, maxChars - suffix.length);
    return `${value.slice(0, safeMax)}${suffix}`;
  }
}
