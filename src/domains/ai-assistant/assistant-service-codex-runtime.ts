import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CodexCancelDto } from './dto/codex-cancel.dto';
import { CodexChatDto } from './dto/codex-chat.dto';
import { CodexChatResponseDto } from './dto/codex-chat-response.dto';
import { CodexCancelResult, CodexRuntime } from './codex-runtime';

@Injectable()
export class AssistantServiceCodexRuntime implements CodexRuntime {
  private readonly logger = new Logger(AssistantServiceCodexRuntime.name);
  private readonly assistantBaseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.assistantBaseUrl =
      this.config.get<string>('ASSISTANT_SERVICE_URL') || 'http://127.0.0.1:8090';
    this.timeoutMs = Number(
      this.config.get<string>('ASSISTANT_SERVICE_TIMEOUT_MS') || 30000,
    );
  }

  async sendMessage(dto: CodexChatDto): Promise<CodexChatResponseDto> {
    const response = await this.postJson('/api/codex/respond', dto);
    return response as CodexChatResponseDto;
  }

  async resumeThread(
    threadId: string,
    prompt: string,
  ): Promise<CodexChatResponseDto> {
    return this.sendMessage({ prompt, threadId });
  }

  async cancelRun(dto: CodexCancelDto): Promise<CodexCancelResult> {
    const response = await this.postJson('/api/codex/cancel', dto);
    return response as CodexCancelResult;
  }

  async streamMessage(
    dto: CodexChatDto,
    req: Request,
    res: Response,
  ): Promise<void> {
    const controller = new AbortController();
    let requestId: string | null = null;
    let clientClosed = false;

    req.on('close', () => {
      clientClosed = true;
      controller.abort();
      if (requestId) {
        void this.cancelRemoteRun(requestId);
      }
    });

    let response: globalThis.Response;

    try {
      response = await fetch(`${this.assistantBaseUrl}/api/codex/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(dto),
        signal: controller.signal,
      });
    } catch (error: any) {
      if (error?.name === 'AbortError' && clientClosed) {
        return;
      }

      throw new BadGatewayException({
        message: 'assistant-service codex stream is unavailable',
        assistantUrl: this.assistantBaseUrl,
        assistantErrorMessage: error?.message ?? String(error),
      });
    }

    if (!response.ok || !response.body) {
      const failureText = await response.text();
      throw new BadGatewayException({
        message: 'assistant-service codex stream returned an error',
        assistantUrl: this.assistantBaseUrl,
        assistantStatus: response.status,
        assistantBody: failureText.slice(0, 4000),
      });
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';

    while (true) {
      let readResult;
      try {
        readResult = await reader.read();
      } catch (error: any) {
        if (clientClosed || error?.name === 'AbortError') {
          return;
        }

        throw new GatewayTimeoutException({
          message: 'assistant-service codex stream read failed',
          assistantUrl: this.assistantBaseUrl,
          assistantErrorMessage: error?.message ?? String(error),
        });
      }

      const { value, done } = readResult;
      if (done) {
        if (!res.writableEnded) {
          res.end();
        }
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      sseBuffer += chunk;
      requestId = this.extractRuntimeRequestId(sseBuffer) || requestId;

      if (!res.writableEnded) {
        res.write(chunk);
      }
    }
  }

  private async postJson(path: string, payload: unknown) {
    let response: globalThis.Response;

    try {
      response = await fetch(`${this.assistantBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error: any) {
      throw new BadGatewayException({
        message: 'assistant-service request failed',
        assistantUrl: this.assistantBaseUrl,
        assistantErrorMessage: error?.message ?? String(error),
      });
    }

    const bodyText = await response.text();
    const parsedBody = this.tryParseJson(bodyText);

    if (!response.ok) {
      throw new BadGatewayException({
        message: 'assistant-service returned an error',
        assistantUrl: this.assistantBaseUrl,
        assistantStatus: response.status,
        assistantBody: parsedBody ?? bodyText.slice(0, 4000),
      });
    }

    return parsedBody;
  }

  private extractRuntimeRequestId(buffer: string): string | null {
    const blocks = buffer.split('\n\n');
    const completeBlocks = blocks.slice(0, -1);

    for (const block of completeBlocks) {
      const dataLines = block
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6));

      if (!dataLines.length) {
        continue;
      }

      try {
        const event = JSON.parse(dataLines.join('\n')) as {
          type?: string;
          requestId?: string;
        };

        if (event.type === 'runtime.started' && typeof event.requestId === 'string') {
          return event.requestId;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async cancelRemoteRun(requestId: string) {
    try {
      await this.postJson('/api/codex/cancel', { requestId });
    } catch (error: any) {
      this.logger.warn(
        JSON.stringify({
          event: 'assistant_service_runtime.cancel_warning',
          requestId,
          assistantUrl: this.assistantBaseUrl,
          error: error?.message ?? String(error),
        }),
      );
    }
  }

  private tryParseJson(raw: string): any {
    if (!raw.trim()) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}
