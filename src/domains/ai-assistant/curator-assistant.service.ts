import {
  BadGatewayException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import { CuratorAnalyzeDto } from './dto/curator-analyze.dto';
import {
  CuratorDecisionCreateDto,
  CuratorDecisionExecutionResponse,
  CuratorDecisionRecord,
} from './dto/curator-decision.dto';
import {
  CuratorProposalCreateDto,
  CuratorProposalListQueryDto,
  CuratorProposalRecord,
  CuratorStructuredProposalDraft,
  CuratorStructuredRecommendation,
} from './dto/curator-proposal.dto';
import {
  CuratorSessionClassification,
  CuratorSessionExecutionResponse,
  CuratorSessionMessageDto,
  CuratorSessionReanalyzeDto,
  CuratorSessionRecord,
  CuratorSessionStartDto,
} from './dto/curator-session.dto';
import {
  CURATOR_DECISION_STORAGE,
  CuratorDecisionStorage,
} from './curator-decision.storage';
import {
  CURATOR_PROPOSAL_STORAGE,
  CuratorProposalStorage,
} from './curator-proposal.storage';
import {
  CURATOR_SESSION_STORAGE,
  CuratorSessionStorage,
} from './curator-session.storage';

type CuratorRuntimeResponse = {
  requestId: string;
  text: string;
  workspace: string;
  service: string;
};

type CuratorPromptTier = {
  maxMessages: number;
  maxMessageChars: number;
  maxSummaryChars: number;
  maxQuestionChars: number;
  maxCrmContextChars: number;
  maxReviewRecordChars: number;
};

type CuratorAnalysisResult = {
  analysisId: string;
  conversationId: string;
  workspace: 'assistant-dev';
  requestId: string;
  question: string;
  structuredRecommendation: CuratorStructuredRecommendation;
  rawText: string;
  createdAt: string;
};

type CuratorDeltaContext = {
  mode: 'summary_only' | 'summary_plus_delta';
  hasAnchorMessage: boolean;
  messages: Array<{
    id: string | null;
    role: 'assistant' | 'customer';
    createdAt: string | null;
    text: string;
  }>;
};

const CURATOR_PROMPT_MAX_CHARS = 9500;
const CURATOR_PROMPT_TIERS: CuratorPromptTier[] = [
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
];

const CURATOR_FOLLOW_UP_DELTA_MAX_MESSAGES = 4;
const CURATOR_FOLLOW_UP_DELTA_MAX_MESSAGE_CHARS = 280;
const CURATOR_FOLLOW_UP_SUMMARY_MAX_CHARS = 900;
const CURATOR_FOLLOW_UP_SNAPSHOT_ITEMS = 5;
const CURATOR_FOLLOW_UP_SNAPSHOT_ITEM_MAX_CHARS = 120;
const CURATOR_FOLLOW_UP_QUESTION_MAX_CHARS = 900;

@Injectable()
export class CuratorAssistantService {
  private readonly logger = new Logger(CuratorAssistantService.name);
  private readonly assistantHttp: AxiosInstance;
  private readonly assistantBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(CURATOR_DECISION_STORAGE)
    private readonly decisionStorage: CuratorDecisionStorage,
    @Inject(CURATOR_PROPOSAL_STORAGE)
    private readonly proposalStorage: CuratorProposalStorage,
    @Inject(CURATOR_SESSION_STORAGE)
    private readonly sessionStorage: CuratorSessionStorage,
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
    const analysis = await this.runInitialAnalysis(dto, actor);

    return {
      ...analysis,
      deferred: this.getDeferredScope(),
    };
  }

  async startSession(
    dto: CuratorSessionStartDto,
    actor: { id: string | number | null; fullName: string | null },
  ): Promise<CuratorSessionExecutionResponse> {
    const analysis = await this.runInitialAnalysis(dto, actor);
    const session = await this.sessionStorage.create(
      this.buildSessionRecord(dto, analysis, actor),
    );

    this.logger.log(
      JSON.stringify({
        event: 'curator.session.started',
        sessionId: session.id,
        conversationId: session.conversationId,
        assistantThreadId: session.assistantThreadId,
        actorId: actor.id,
      }),
    );

    return {
      analysisMode: true,
      mode: 'initial',
      workspace: 'assistant-dev',
      conversationId: dto.conversationId,
      session,
      analysis: this.toSessionAnalysisPayload(analysis),
      deferred: this.getDeferredScope(),
    };
  }

  async sendSessionMessage(
    sessionId: string,
    dto: CuratorSessionMessageDto,
    actor: { id: string | number | null; fullName: string | null },
  ): Promise<CuratorSessionExecutionResponse> {
    const session = await this.getSessionOrThrow(sessionId);
    this.assertSessionContext(session, dto);
    const analysis = await this.runFollowUpAnalysis(session, dto, actor);
    const updatedSession = await this.sessionStorage.save(
      this.updateSessionAfterDiscussion(session, dto, analysis),
    );

    return {
      analysisMode: false,
      mode: 'follow_up',
      workspace: 'assistant-dev',
      conversationId: dto.conversationId,
      session: updatedSession,
      analysis: this.toSessionAnalysisPayload(analysis),
      deferred: this.getDeferredScope(),
    };
  }

  async getSession(sessionId: string): Promise<CuratorSessionRecord> {
    return this.getSessionOrThrow(sessionId);
  }

  async reanalyzeSession(
    sessionId: string,
    dto: CuratorSessionReanalyzeDto,
    actor: { id: string | number | null; fullName: string | null },
  ): Promise<CuratorSessionExecutionResponse> {
    const session = await this.getSessionOrThrow(sessionId);
    this.assertSessionContext(session, dto);
    const analysis = await this.runInitialAnalysis(dto, actor);
    const updatedSession = await this.sessionStorage.save(
      this.rebuildSessionAfterAnalysis(session, dto, analysis),
    );

    this.logger.log(
      JSON.stringify({
        event: 'curator.session.reanalyzed',
        sessionId: updatedSession.id,
        conversationId: updatedSession.conversationId,
        actorId: actor.id,
      }),
    );

    return {
      analysisMode: true,
      mode: 'reanalysis',
      workspace: 'assistant-dev',
      conversationId: dto.conversationId,
      session: updatedSession,
      analysis: this.toSessionAnalysisPayload(analysis),
      deferred: this.getDeferredScope(),
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

  async createSessionDecision(
    sessionId: string,
    dto: CuratorDecisionCreateDto,
    actor: { id: string | number | null; fullName: string | null },
  ): Promise<CuratorDecisionExecutionResponse> {
    const session = await this.getSessionOrThrow(sessionId);
    let createdProposal: CuratorProposalRecord | null = null;

    if (dto.decisionType === 'CREATE_DRAFT') {
      if (!dto.proposalDraft) {
        throw new BadGatewayException({
          message:
            'CREATE_DRAFT decision requires proposalDraft payload',
          sessionId,
        });
      }

      createdProposal = await this.createProposalDraft(
        {
          conversationId: session.conversationId,
          sourceReference: dto.sourceReference,
          targetWorkspace: 'assistant-dev',
          artifactType: dto.proposalDraft.artifactType,
          targetKey: dto.proposalDraft.targetKey ?? undefined,
          targetPath: dto.proposalDraft.targetPath ?? undefined,
          changeType: dto.proposalDraft.changeType,
          reason: dto.proposalDraft.reason,
          proposedContent: dto.proposalDraft.proposedContent,
          sourceAnalysisId: dto.sourceAnalysisId,
        },
        actor,
      );
    }

    const decision = await this.decisionStorage.create({
      sessionId: session.id,
      conversationId: session.conversationId,
      decisionType: dto.decisionType,
      targetDraftKey:
        dto.targetDraftKey ??
        this.buildDraftKey(dto.proposalDraft ?? null),
      reason: dto.reason,
      createdProposalId: createdProposal?.id ?? null,
      createdBy: actor,
    });

    this.logger.log(
      JSON.stringify({
        event: 'curator.session.decision_created',
        sessionId: session.id,
        conversationId: session.conversationId,
        decisionId: decision.id,
        decisionType: decision.decisionType,
        createdProposalId: createdProposal?.id ?? null,
        actorId: actor.id,
      }),
    );

    return {
      decision,
      createdProposal,
    };
  }

  async listSessionDecisions(
    sessionId: string,
  ): Promise<CuratorDecisionRecord[]> {
    await this.getSessionOrThrow(sessionId);
    return this.decisionStorage.listBySession(sessionId);
  }

  private async runInitialAnalysis(
    dto: CuratorAnalyzeDto,
    actor: { id: string | number | null; fullName: string | null },
  ): Promise<CuratorAnalysisResult> {
    const analysisId = randomUUID();

    this.logger.log(
      JSON.stringify({
        event: 'curator.analysis.request',
        mode: 'initial',
        analysisId,
        conversationId: dto.conversationId,
        actorId: actor.id,
        actorFullName: actor.fullName,
        messageCount: dto.conversationContext.messages.length,
        hasReviewRecord: Boolean(dto.reviewRecord),
      }),
    );

    const prompt = this.buildCuratorPrompt(dto);
    return this.executeCuratorPrompt({
      analysisId,
      prompt,
      question: dto.curatorQuestion,
      conversationId: dto.conversationId,
    });
  }

  private async runFollowUpAnalysis(
    session: CuratorSessionRecord,
    dto: CuratorSessionMessageDto,
    actor: { id: string | number | null; fullName: string | null },
  ): Promise<CuratorAnalysisResult> {
    const analysisId = randomUUID();
    const deltaContext = this.buildDeltaContext(session, dto);

    this.logger.log(
      JSON.stringify({
        event: 'curator.analysis.request',
        mode: 'follow_up',
        analysisId,
        sessionId: session.id,
        conversationId: dto.conversationId,
        actorId: actor.id,
        actorFullName: actor.fullName,
        deltaMessageCount: deltaContext.messages.length,
        hasAnchorMessage: deltaContext.hasAnchorMessage,
      }),
    );

    const prompt = this.buildCuratorFollowUpPrompt(session, dto, deltaContext);
    return this.executeCuratorPrompt({
      analysisId,
      prompt,
      question: dto.curatorQuestion,
      conversationId: dto.conversationId,
    });
  }

  private async executeCuratorPrompt(input: {
    analysisId: string;
    prompt: string;
    question: string;
    conversationId: string;
  }): Promise<CuratorAnalysisResult> {
    this.logger.log(
      JSON.stringify({
        event: 'curator.analysis.prompt_built',
        analysisId: input.analysisId,
        conversationId: input.conversationId,
        promptLength: input.prompt.length,
      }),
    );

    const runtimeResponse = await this.runCuratorRuntime(input.prompt, input.analysisId);
    const structuredRecommendation = this.parseStructuredRecommendation(
      runtimeResponse.text,
    );

    return {
      analysisId: input.analysisId,
      conversationId: input.conversationId,
      workspace: 'assistant-dev',
      requestId: runtimeResponse.requestId,
      question: input.question,
      structuredRecommendation,
      rawText: runtimeResponse.text,
      createdAt: new Date().toISOString(),
    };
  }

  private buildSessionRecord(
    dto: CuratorAnalyzeDto,
    analysis: CuratorAnalysisResult,
    actor: { id: string | number | null; fullName: string | null },
  ): CuratorSessionRecord {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      assistantThreadId: this.extractAssistantThreadId(dto),
      conversationId: dto.conversationId,
      analysisSummary: this.buildCompactAnalysisSummary(
        analysis.structuredRecommendation,
      ),
      classification: this.deriveClassification(
        analysis.structuredRecommendation.proposalDrafts,
      ),
      recommendedDraftsSnapshot: this.buildRecommendedDraftsSnapshot(
        analysis.structuredRecommendation.proposalDrafts,
      ),
      discussionState: null,
      lastProcessedAssistantMessageId: this.findLastMessageId(dto, 'assistant'),
      lastProcessedCustomerMessageId: this.findLastMessageId(dto, 'customer'),
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
    };
  }

  private updateSessionAfterDiscussion(
    session: CuratorSessionRecord,
    dto: CuratorAnalyzeDto,
    analysis: CuratorAnalysisResult,
  ): CuratorSessionRecord {
    return {
      ...session,
      assistantThreadId: this.extractAssistantThreadId(dto) ?? session.assistantThreadId,
      conversationId: dto.conversationId,
      discussionState: this.buildDiscussionState(
        session.discussionState,
        analysis.question,
        analysis.structuredRecommendation,
      ),
      lastProcessedAssistantMessageId: this.findLastMessageId(dto, 'assistant'),
      lastProcessedCustomerMessageId: this.findLastMessageId(dto, 'customer'),
      updatedAt: new Date().toISOString(),
    };
  }

  private rebuildSessionAfterAnalysis(
    session: CuratorSessionRecord,
    dto: CuratorAnalyzeDto,
    analysis: CuratorAnalysisResult,
  ): CuratorSessionRecord {
    return {
      ...session,
      assistantThreadId: this.extractAssistantThreadId(dto) ?? session.assistantThreadId,
      conversationId: dto.conversationId,
      analysisSummary: this.buildCompactAnalysisSummary(
        analysis.structuredRecommendation,
      ),
      classification: this.deriveClassification(
        analysis.structuredRecommendation.proposalDrafts,
      ),
      recommendedDraftsSnapshot: this.buildRecommendedDraftsSnapshot(
        analysis.structuredRecommendation.proposalDrafts,
      ),
      discussionState: null,
      lastProcessedAssistantMessageId: this.findLastMessageId(dto, 'assistant'),
      lastProcessedCustomerMessageId: this.findLastMessageId(dto, 'customer'),
      updatedAt: new Date().toISOString(),
    };
  }

  private toSessionAnalysisPayload(analysis: CuratorAnalysisResult) {
    return {
      analysisId: analysis.analysisId,
      requestId: analysis.requestId,
      question: analysis.question,
      structuredRecommendation: analysis.structuredRecommendation,
      rawText: analysis.rawText,
      createdAt: analysis.createdAt,
    };
  }

  private async getSessionOrThrow(sessionId: string): Promise<CuratorSessionRecord> {
    const session = await this.sessionStorage.get(sessionId);
    if (!session) {
      throw new NotFoundException('Curator session not found');
    }

    return session;
  }

  private assertSessionContext(
    session: CuratorSessionRecord,
    dto: CuratorAnalyzeDto,
  ) {
    if (session.conversationId !== dto.conversationId) {
      throw new BadGatewayException({
        message: 'Curator session conversation mismatch',
        sessionId: session.id,
        sessionConversationId: session.conversationId,
        requestConversationId: dto.conversationId,
      });
    }

    const requestThreadId = this.extractAssistantThreadId(dto);
    if (
      session.assistantThreadId &&
      requestThreadId &&
      session.assistantThreadId !== requestThreadId
    ) {
      throw new BadGatewayException({
        message: 'Curator session assistant thread mismatch',
        sessionId: session.id,
        sessionAssistantThreadId: session.assistantThreadId,
        requestAssistantThreadId: requestThreadId,
      });
    }
  }

  private extractAssistantThreadId(dto: CuratorAnalyzeDto): string | null {
    const crmContext = dto.conversationContext.crmContext ?? {};
    if (
      typeof crmContext.threadId === 'string' &&
      crmContext.threadId.trim().length > 0
    ) {
      return crmContext.threadId;
    }

    return null;
  }

  private findLastMessageId(
    dto: CuratorAnalyzeDto,
    role: 'assistant' | 'customer',
  ): string | null {
    const target = [...dto.conversationContext.messages]
      .reverse()
      .find((message) => message.role === role && message.id);

    return target?.id ?? null;
  }

  private buildCompactAnalysisSummary(
    recommendation: CuratorStructuredRecommendation,
  ): string {
    const parts = [
      recommendation.summary,
      recommendation.whyAssistantAnsweredThisWay,
      recommendation.improvementFocus.slice(0, 3).join('; '),
    ].filter(Boolean);

    return this.truncateText(parts.join(' '), CURATOR_FOLLOW_UP_SUMMARY_MAX_CHARS);
  }

  private deriveClassification(
    drafts: CuratorStructuredProposalDraft[],
  ): CuratorSessionClassification {
    if (!drafts.length) {
      return 'behavior';
    }

    const behaviorArtifacts = new Set(['instruction', 'script', 'rule', 'template']);
    const knowledgeArtifacts = new Set(['faq', 'pricing']);

    const hasBehavior = drafts.some((draft) =>
      behaviorArtifacts.has(draft.artifactType),
    );
    const hasKnowledge = drafts.some((draft) =>
      knowledgeArtifacts.has(draft.artifactType),
    );

    if (hasBehavior && hasKnowledge) {
      return 'mixed';
    }

    if (hasKnowledge) {
      return 'knowledge';
    }

    return 'behavior';
  }

  private buildRecommendedDraftsSnapshot(
    drafts: CuratorStructuredProposalDraft[],
  ): string[] {
    return drafts.slice(0, CURATOR_FOLLOW_UP_SNAPSHOT_ITEMS).map((draft) =>
      this.truncateText(
        [
          draft.changeType,
          draft.artifactType,
          draft.targetKey || draft.targetPath || 'unspecified-target',
        ].join(': '),
        CURATOR_FOLLOW_UP_SNAPSHOT_ITEM_MAX_CHARS,
      ),
    );
  }

  private buildDraftKey(
    draft: CuratorStructuredProposalDraft | CuratorDecisionCreateDto['proposalDraft'] | null,
  ): string | null {
    if (!draft) {
      return null;
    }

    return [
      draft.changeType,
      draft.artifactType,
      draft.targetKey || draft.targetPath || 'unspecified-target',
    ].join(':');
  }

  private buildDiscussionState(
    previousState: string | null,
    operatorQuestion: string,
    recommendation: CuratorStructuredRecommendation,
  ): string | null {
    const turnSummary = [
      `Q: ${this.truncateText(operatorQuestion, 120)}`,
      `A: ${this.truncateText(
        recommendation.summary || recommendation.whyAssistantAnsweredThisWay,
        180,
      )}`,
    ].join(' ');

    const nextState = [previousState, turnSummary]
      .filter(Boolean)
      .join(' | ')
      .trim();

    if (!nextState) {
      return null;
    }

    return this.truncateText(nextState, 420);
  }

  private buildDeltaContext(
    session: CuratorSessionRecord,
    dto: CuratorSessionMessageDto,
  ): CuratorDeltaContext {
    const relevantMessages = dto.conversationContext.messages.filter(
      (message) => message.role === 'assistant' || message.role === 'customer',
    );

    const assistantIndex = session.lastProcessedAssistantMessageId
      ? relevantMessages.findIndex(
          (message) => message.id === session.lastProcessedAssistantMessageId,
        )
      : -1;

    const customerIndex = session.lastProcessedCustomerMessageId
      ? relevantMessages.findIndex(
          (message) => message.id === session.lastProcessedCustomerMessageId,
        )
      : -1;

    const lastProcessedIndex = Math.max(assistantIndex, customerIndex);
    const newMessages =
      lastProcessedIndex >= 0
        ? relevantMessages.slice(lastProcessedIndex + 1)
        : relevantMessages;

    if (!newMessages.length) {
      return {
        mode: 'summary_only' as const,
        hasAnchorMessage: false,
        messages: [] as Array<{
          id: string | null;
          role: 'assistant' | 'customer';
          createdAt: string | null;
          text: string;
        }>,
      };
    }

    const anchorMessage =
      lastProcessedIndex >= 0 ? relevantMessages[lastProcessedIndex] : null;

    const combinedMessages = anchorMessage
      ? [anchorMessage, ...newMessages]
      : [...newMessages];

    return {
      mode: 'summary_plus_delta' as const,
      hasAnchorMessage: Boolean(anchorMessage),
      messages: combinedMessages
        .slice(-CURATOR_FOLLOW_UP_DELTA_MAX_MESSAGES)
        .map((message) => ({
          id: message.id ?? null,
          role: message.role as 'assistant' | 'customer',
          createdAt: message.createdAt ?? null,
          text: this.truncateText(
            message.text,
            CURATOR_FOLLOW_UP_DELTA_MAX_MESSAGE_CHARS,
          ),
        })),
    };
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

  private buildCuratorFollowUpPrompt(
    session: CuratorSessionRecord,
    dto: CuratorSessionMessageDto,
    deltaContext: CuratorDeltaContext,
  ) {
    const preamble = [
      'Ты продолжаешь curator analysis session для assistant brain.',
      'Это discussion mode, а не новый полный analysis report.',
      'Оператор уже видел исходный анализ.',
      'Не повторяй полный анализ, полный improvement list и полный список draft recommendations.',
      'Отвечай прямо на текущий вопрос оператора.',
      'Если можно ответить одним коротким выводом, отвечай кратко.',
      'Не пересказывай заново причины, если оператор не просит этого явно.',
      'Если оператор спрашивает о типе проблемы, ответь коротко: behavior, knowledge или mixed, затем добавь одно короткое пояснение.',
      'Если оператор спрашивает, какой draft важнее, выбери один самый приоритетный из already suggested drafts и объясни причину в одном-двух предложениях.',
      'Если нужно сослаться на уже предложенные drafts, используй только recommended drafts snapshot и не печатай их заново полным списком.',
      'Используй только session summary, optional discussion state, recommended drafts snapshot, текущий вопрос оператора и delta context, если он передан.',
      'Не придумывай отсутствующие части диалога.',
      'Не редактируй файлы и не публикуй изменения.',
      'Верни ТОЛЬКО JSON без markdown и без пояснений вне JSON.',
    ].join('\n\n');

    const primaryPayload = {
      sessionId: session.id,
      conversationId: session.conversationId,
      assistantThreadId: session.assistantThreadId,
      analysisMode: false,
      sessionSummary: this.truncateText(
        session.analysisSummary,
        CURATOR_FOLLOW_UP_SUMMARY_MAX_CHARS,
      ),
      classification: session.classification,
      discussionState: session.discussionState
        ? this.truncateText(session.discussionState, 320)
        : null,
      recommendedDraftsSnapshot: session.recommendedDraftsSnapshot
        .slice(0, CURATOR_FOLLOW_UP_SNAPSHOT_ITEMS)
        .map((item) =>
          this.truncateText(item, CURATOR_FOLLOW_UP_SNAPSHOT_ITEM_MAX_CHARS),
        ),
      operatorQuestion: this.truncateText(
        dto.curatorQuestion,
        CURATOR_FOLLOW_UP_QUESTION_MAX_CHARS,
      ),
      deltaContext:
        deltaContext.mode === 'summary_plus_delta'
          ? {
              mode: deltaContext.mode,
              hasAnchorMessage: deltaContext.hasAnchorMessage,
              messages: deltaContext.messages,
            }
          : null,
      explicitNotice:
        deltaContext.mode === 'summary_plus_delta'
          ? 'Delta context contains only new assistant/customer messages after the last processed message id, plus at most one anchor message.'
          : 'No new assistant/customer messages appeared after the last processed ids. Use only the session summary, recommended drafts snapshot and the operator question.',
      responseRules: [
        'Return a short direct answer in summary.',
        'Do not restate the full prior analysis.',
        'Keep whyAssistantAnsweredThisWay short and supportive, not a second report.',
        'Return improvementFocus only if the operator asks what should be improved or how to fix it.',
        'Return proposalDrafts only if the operator explicitly asks which draft to create, revise or prioritize.',
        'If no draft needs to be printed, return proposalDrafts: [].',
      ],
      outputSchema: {
        summary: 'string // direct short answer to the operator question',
        whyAssistantAnsweredThisWay:
          'string // short supporting explanation, do not restate full report',
        improvementFocus:
          ['string // only if explicitly needed for the answer, otherwise []'],
        guardrails:
          ['string // only if directly relevant to the follow-up question, otherwise []'],
        proposalDrafts: [
          {
            targetWorkspace: 'assistant-dev',
            artifactType: 'instruction | script | faq | pricing | rule | template',
            targetKey: 'string | null',
            targetPath: 'string | null',
            changeType: 'add | update | clarify | remove',
            reason:
              'string // include only if the operator explicitly asks for a draft recommendation',
            proposedContent:
              'string // include only if explicitly needed; otherwise return an empty array',
          },
        ],
      },
    };

    const prompt = [preamble, JSON.stringify(primaryPayload, null, 2)].join('\n\n');
    if (prompt.length <= CURATOR_PROMPT_MAX_CHARS) {
      return prompt;
    }

    const fallbackPayload = {
      ...primaryPayload,
      sessionSummary: this.truncateText(session.analysisSummary, 600),
      discussionState: session.discussionState
        ? this.truncateText(session.discussionState, 180)
        : null,
      recommendedDraftsSnapshot: session.recommendedDraftsSnapshot
        .slice(0, 3)
        .map((item) => this.truncateText(item, 80)),
      operatorQuestion: this.truncateText(dto.curatorQuestion, 500),
      deltaContext:
        deltaContext.mode === 'summary_plus_delta'
          ? {
              mode: deltaContext.mode,
              hasAnchorMessage: deltaContext.hasAnchorMessage,
              messages: deltaContext.messages.slice(-2).map((message) => ({
                ...message,
                text: this.truncateText(message.text, 160),
              })),
            }
          : null,
    };

    const fallbackPrompt = [
      preamble,
      JSON.stringify(fallbackPayload, null, 2),
    ].join('\n\n');

    if (fallbackPrompt.length <= CURATOR_PROMPT_MAX_CHARS) {
      return fallbackPrompt;
    }

    throw new BadGatewayException({
      message: 'Curator session prompt budget overflow',
      maxPromptChars: CURATOR_PROMPT_MAX_CHARS,
      conversationId: dto.conversationId,
      sessionId: session.id,
    });
  }

  private composePromptFromTier(
    dto: CuratorAnalyzeDto,
    preamble: string,
    tier: CuratorPromptTier,
  ) {
    const payload = {
      conversationId: dto.conversationId,
      curatorQuestion: this.truncateText(
        dto.curatorQuestion,
        tier.maxQuestionChars,
      ),
      sourceReference: dto.sourceReference ?? null,
      conversationContext: {
        messages: this.buildBudgetedMessages(dto, tier),
        summary: dto.conversationContext.summary
          ? this.truncateText(
              dto.conversationContext.summary,
              tier.maxSummaryChars,
            )
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
    } catch {
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

  private getDeferredScope() {
    return [
      'direct brain file editing',
      'diff/review/publish',
      'analytics loop',
      'self-improvement loop',
    ];
  }
}
