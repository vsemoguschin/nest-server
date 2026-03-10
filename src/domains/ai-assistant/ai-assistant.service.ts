import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { Response as ExpressResponse } from 'express';
import { AssistantPlaygroundRespondDto } from './dto/assistant-playground-respond.dto';

type AssistantRespondResponse = {
  reply: string;
  model: string | null;
  provider: string;
  requestId: string | null;
  messageId?: string | null;
  conversationId: string | null;
};

type AssistantDebugResponse = {
  reply: string;
  model: string | null;
  provider: string;
  requestId: string | null;
  conversationId: string | null;
  providerDiagnostics?: {
    finishReason: string | null;
    truncated: boolean;
    usage: {
      promptTokens: number | null;
      completionTokens: number | null;
      totalTokens: number | null;
    } | null;
  };
  debugSchemaVersion: string;
  debug: {
    matchedIntents: Array<{
      id: string;
      code: string;
      title: string;
      source: string;
      version: number;
      matchedBy: string;
    }>;
    matchedKnowledgeIds: string[];
    matchedKnowledge: Array<{
      id: string;
      title: string;
      source: string;
      version: number;
      sourceType: string;
      matchedBy: string;
    }>;
    suggestedStatus: string | null;
    suggestedTags: string[];
    shouldHandoff: boolean;
    handoffReason: string | null;
    appliedPolicies: Array<{
      policyCode: string;
      title: string;
      result: 'applied' | 'warning';
      source: string;
      version: number;
      details: string;
    }>;
    decisionSummary: string[];
    warnings: string[];
    confidenceBand: 'low' | 'medium' | 'high';
    fallbackUsed: boolean;
  };
};

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);
  private readonly assistantHttp: AxiosInstance;
  private readonly assistantBaseUrl: string;
  private readonly streamDebugEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.assistantBaseUrl =
      this.config.get<string>('ASSISTANT_SERVICE_URL') ||
      'http://127.0.0.1:8090';

    this.assistantHttp = axios.create({
      baseURL: this.assistantBaseUrl,
      timeout: Number(
        this.config.get<string>('ASSISTANT_SERVICE_TIMEOUT_MS') || 30000,
      ),
    });

    this.streamDebugEnabled =
      String(this.config.get<string>('AI_ASSISTANT_STREAM_DEBUG') || '')
        .toLowerCase() === 'true';
  }

  async respond(dto: AssistantPlaygroundRespondDto) {
    try {
      const response = await this.assistantHttp.post<AssistantRespondResponse>(
        '/api/chat/respond/timeweb-native',
        {
          message: dto.message,
          conversationId: dto.conversationId,
          parentMessageId: dto.parentMessageId,
          channel: dto.channel || 'crm',
          customerContext: dto.customerContext,
          systemPrompt: dto.systemPrompt,
          maxOutputTokens: dto.maxOutputTokens,
        },
      );

      return response.data;
    } catch (error: any) {
      if (error?.response) {
        throw new BadGatewayException({
          message: 'assistant-service returned an error',
          assistantUrl: this.assistantBaseUrl,
          assistantStatus: error.response.status,
          assistantData: error.response.data,
        });
      }

      throw new BadGatewayException({
        message: 'assistant-service is unavailable',
        assistantUrl: this.assistantBaseUrl,
        assistantErrorCode: error?.code ?? null,
        assistantErrorMessage: error?.message ?? 'Unknown assistant error',
      });
    }
  }

  async respondDebug(dto: AssistantPlaygroundRespondDto) {
    try {
      const response = await this.assistantHttp.post<AssistantDebugResponse>(
        '/api/chat/respond-debug',
        {
          message: dto.message,
          conversationId: dto.conversationId,
          parentMessageId: dto.parentMessageId,
          channel: dto.channel || 'crm',
          customerContext: dto.customerContext,
          maxOutputTokens: dto.maxOutputTokens,
        },
      );

      return response.data;
    } catch (error: any) {
      if (error?.response) {
        throw new BadGatewayException({
          message: 'assistant-service returned an error',
          assistantUrl: this.assistantBaseUrl,
          assistantStatus: error.response.status,
          assistantData: error.response.data,
        });
      }

      throw new BadGatewayException({
        message: 'assistant-service is unavailable',
        assistantUrl: this.assistantBaseUrl,
        assistantErrorCode: error?.code ?? null,
        assistantErrorMessage: error?.message ?? 'Unknown assistant error',
      });
    }
  }

  async streamRespond(
    dto: AssistantPlaygroundRespondDto,
    res: ExpressResponse,
  ): Promise<void> {
    let upstream: globalThis.Response;

    if (this.streamDebugEnabled) {
      this.logger.debug(
        `proxy stream start conversationId=${dto.conversationId ?? 'null'} parentMessageId=${dto.parentMessageId ?? 'null'} messageLength=${dto.message?.length ?? 0}`,
      );
    }

    try {
      upstream = (await fetch(
        `${this.assistantBaseUrl}/api/chat/respond/timeweb/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: dto.message,
            conversationId: dto.conversationId,
            parentMessageId: dto.parentMessageId,
            channel: dto.channel || 'crm',
            customerContext: dto.customerContext,
            systemPrompt: dto.systemPrompt,
            maxOutputTokens: dto.maxOutputTokens,
          }),
        },
      )) as any;
    } catch (error: any) {
      throw new BadGatewayException({
        message: 'assistant-service is unavailable',
        assistantUrl: this.assistantBaseUrl,
        assistantErrorCode: error?.code ?? null,
        assistantErrorMessage: error?.message ?? 'Unknown assistant error',
      });
    }

    if (!upstream.ok) {
      const rawBody = await upstream.text();
      throw new BadGatewayException({
        message: 'assistant-service returned an error',
        assistantUrl: this.assistantBaseUrl,
        assistantStatus: upstream.status,
        assistantData: rawBody,
      });
    }

    if (!upstream.body) {
      throw new BadGatewayException({
        message: 'assistant-service stream body is empty',
        assistantUrl: this.assistantBaseUrl,
      });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const reader = upstream.body.getReader();
    let chunkCount = 0;
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunkCount += 1;
        totalBytes += value.byteLength;
        if (this.streamDebugEnabled && chunkCount <= 5) {
          const preview = Buffer.from(value)
            .toString('utf-8')
            .replace(/\s+/g, ' ')
            .slice(0, 180);
          this.logger.debug(
            `proxy stream chunk#${chunkCount} bytes=${value.byteLength} preview=${preview}`,
          );
        }
        res.write(Buffer.from(value));
      }
    } finally {
      if (this.streamDebugEnabled) {
        this.logger.debug(
          `proxy stream end conversationId=${dto.conversationId ?? 'null'} chunks=${chunkCount} totalBytes=${totalBytes}`,
        );
      }
      reader.releaseLock();
      res.end();
    }
  }
}
