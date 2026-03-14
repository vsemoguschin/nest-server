import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import type { Request, Response } from 'express';
import { CodexEventMapper, CodexMapperState } from './codex-event.mapper';
import { CodexCancelDto } from './dto/codex-cancel.dto';
import { CodexChatDto } from './dto/codex-chat.dto';
import { CodexChatResponseDto } from './dto/codex-chat-response.dto';
import {
  CodexCancelResult,
  CodexRuntime,
} from './codex-runtime';

type ActiveRun = {
  requestId: string;
  child: ChildProcess;
  response: Response;
  outputFilePath: string;
  mapperState: CodexMapperState;
  stdoutBuffer: string;
  stderrBuffer: string;
  lineBuffer: string;
  cancelled: boolean;
  terminalEventSent: boolean;
  requestClosed: boolean;
  cleanupDone: boolean;
};

@Injectable()
export class CliSpawnCodexRuntime implements CodexRuntime {
  private readonly logger = new Logger(CliSpawnCodexRuntime.name);
  private readonly codexBinPath: string;
  private readonly codexWorkspaceDir: string;
  private readonly timeoutMs: number;
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(
    private readonly config: ConfigService,
    private readonly mapper: CodexEventMapper,
  ) {
    this.codexBinPath = this.config.get<string>('CODEX_BIN_PATH') || 'codex';
    this.codexWorkspaceDir =
      this.config.get<string>('CODEX_WORKSPACE_DIR') ||
      resolve(process.cwd(), '..', '..', 'codex-test', 'assistant');
    this.timeoutMs = Number(
      this.config.get<string>('CODEX_TIMEOUT_MS') || 120000,
    );
  }

  async sendMessage(dto: CodexChatDto): Promise<CodexChatResponseDto> {
    await this.ensureWorkspaceExists();

    const outputFilePath = join(tmpdir(), `codex-last-message-${randomUUID()}.txt`);
    const args = this.buildArgs(dto, outputFilePath, 'non_stream');
    const requestId = randomUUID();

    this.logger.log(
      JSON.stringify({
        event: 'codex.request.start',
        requestId,
        runtime: 'cli_spawn',
        mode: dto.threadId ? 'resume' : 'new',
        inputThreadId: dto.threadId ?? null,
        promptLength: dto.prompt.length,
        codexBinPath: this.codexBinPath,
        codexWorkspaceDir: this.codexWorkspaceDir,
        timeoutMs: this.timeoutMs,
        argsPreview: this.formatArgsForLog(args),
      }),
    );

    const result = await this.runCodexProcess({
      args,
      outputFilePath,
      fallbackThreadId: dto.threadId,
      requestId,
    });

    if (!result.text) {
      throw new BadGatewayException({
        message: 'Codex returned an empty response',
        threadId: result.threadId,
        requestId,
      });
    }

    this.logger.log(
      JSON.stringify({
        event: 'codex.request.success',
        requestId,
        runtime: 'cli_spawn',
        outputThreadId: result.threadId,
        textLength: result.text.length,
      }),
    );

    return result;
  }

  async resumeThread(
    threadId: string,
    prompt: string,
  ): Promise<CodexChatResponseDto> {
    return this.sendMessage({
      prompt,
      threadId,
    });
  }

  async streamMessage(
    dto: CodexChatDto,
    req: Request,
    res: Response,
  ): Promise<void> {
    await this.ensureWorkspaceExists();

    const requestId = randomUUID();
    const outputFilePath = join(
      tmpdir(),
      `codex-stream-last-message-${randomUUID()}.txt`,
    );
    const args = this.buildArgs(dto, outputFilePath, 'stream');

    this.openSse(res);
    this.sendEvent(res, this.mapper.createRuntimeStartedEvent(requestId));

    this.logger.log(
      JSON.stringify({
        event: 'codex.stream.start',
        requestId,
        runtime: 'cli_spawn',
        mode: dto.threadId ? 'resume' : 'new',
        inputThreadId: dto.threadId ?? null,
        promptLength: dto.prompt.length,
        codexWorkspaceDir: this.codexWorkspaceDir,
        codexBinPath: this.codexBinPath,
        argsPreview: this.formatArgsForLog(args),
      }),
    );

    const child = spawn(this.codexBinPath, args, {
      cwd: this.codexWorkspaceDir,
      env: this.buildEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    const activeRun: ActiveRun = {
      requestId,
      child,
      response: res,
      outputFilePath,
      mapperState: {
        ...this.mapper.createInitialState(),
        threadId: dto.threadId ?? null,
      },
      stdoutBuffer: '',
      stderrBuffer: '',
      lineBuffer: '',
      cancelled: false,
      terminalEventSent: false,
      requestClosed: false,
      cleanupDone: false,
    };

    this.activeRuns.set(requestId, activeRun);

    const timeout = setTimeout(() => {
      this.logger.error(
        JSON.stringify({
          event: 'codex.stream.timeout',
          requestId,
          runtime: 'cli_spawn',
          pid: child.pid ?? null,
          timeoutMs: this.timeoutMs,
        }),
      );
      this.failRun(activeRun, 'Codex runtime timed out');
      child.kill('SIGTERM');
    }, this.timeoutMs);

    const cleanup = async () => {
      if (activeRun.cleanupDone) {
        return;
      }

      activeRun.cleanupDone = true;
      clearTimeout(timeout);
      this.activeRuns.delete(requestId);
      await fs.rm(outputFilePath, { force: true });
    };

    req.on('close', () => {
      if (res.writableEnded) {
        return;
      }

      activeRun.requestClosed = true;
      this.logger.warn(
        JSON.stringify({
          event: 'codex.stream.client_closed',
          requestId,
          runtime: 'cli_spawn',
          pid: child.pid ?? null,
        }),
      );
      child.kill('SIGTERM');
    });

    child.stdout.on('data', chunk => {
      activeRun.stdoutBuffer += chunk;
      activeRun.lineBuffer += chunk;
      this.consumeJsonlBuffer(activeRun);
    });

    child.stderr.on('data', chunk => {
      activeRun.stderrBuffer += chunk;
    });

    child.once('error', async (error) => {
      this.logger.error(
        JSON.stringify({
          event: 'codex.stream.spawn_error',
          requestId,
          runtime: 'cli_spawn',
          error: error.message,
        }),
      );
      this.failRun(activeRun, 'Failed to start Codex CLI');
      await cleanup();
    });

    child.once('close', async (exitCode) => {
      this.consumeJsonlBuffer(activeRun, true);
      const finalText = await this.readOutputMessage(outputFilePath);

      this.logger.log(
        JSON.stringify({
          event: 'codex.stream.finished',
          requestId,
          runtime: 'cli_spawn',
          pid: child.pid ?? null,
          exitCode,
          cancelled: activeRun.cancelled,
          requestClosed: activeRun.requestClosed,
          threadId: activeRun.mapperState.threadId,
          stdoutTail: this.tail(activeRun.stdoutBuffer),
          stderrTail: this.tail(activeRun.stderrBuffer),
          finalTextLength: finalText.length,
        }),
      );

      if (!activeRun.requestClosed && !activeRun.terminalEventSent) {
        if (activeRun.cancelled) {
          this.failRun(activeRun, 'Generation cancelled');
        } else if (exitCode === 0) {
          const completedText = finalText || activeRun.mapperState.assistantText;
          this.sendEvent(res, this.mapper.createCompletedEvent(completedText));
          this.sendEvent(res, this.mapper.createRuntimeFinishedEvent(requestId));
          activeRun.terminalEventSent = true;
          res.end();
        } else {
          this.failRun(
            activeRun,
            this.buildFailureMessage(exitCode, activeRun.stderrBuffer),
          );
        }
      }

      await cleanup();
    });
  }

  async cancelRun(dto: CodexCancelDto): Promise<CodexCancelResult> {
    const activeRun = this.activeRuns.get(dto.requestId);
    if (!activeRun) {
      throw new NotFoundException({
        message: 'Active Codex run not found',
        requestId: dto.requestId,
      });
    }

    activeRun.cancelled = true;

    this.logger.warn(
      JSON.stringify({
        event: 'codex.stream.cancel',
        requestId: dto.requestId,
        runtime: 'cli_spawn',
        pid: activeRun.child.pid ?? null,
      }),
    );

    this.failRun(activeRun, 'Generation cancelled by user');
    activeRun.child.kill('SIGTERM');

    setTimeout(() => {
      if (!activeRun.cleanupDone) {
        activeRun.child.kill('SIGKILL');
      }
    }, 3000);

    return {
      ok: true,
      requestId: dto.requestId,
    };
  }

  private async runCodexProcess(params: {
    args: string[];
    outputFilePath: string;
    fallbackThreadId?: string;
    requestId: string;
  }): Promise<CodexChatResponseDto> {
    const { args, outputFilePath, fallbackThreadId, requestId } = params;
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let resolvedThreadId = fallbackThreadId || '';
    let didTimeout = false;
    const startedAt = Date.now();

    const child = spawn(this.codexBinPath, args, {
      cwd: this.codexWorkspaceDir,
      env: this.buildEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timeout = setTimeout(() => {
      didTimeout = true;
      this.logger.error(
        JSON.stringify({
          event: 'codex.process.timeout',
          requestId,
          runtime: 'cli_spawn',
          pid: child.pid ?? null,
          timeoutMs: this.timeoutMs,
          resolvedThreadId: resolvedThreadId || null,
        }),
      );
      child.kill('SIGTERM');
    }, this.timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', chunk => {
      stdoutBuffer += chunk;
      const nextThreadId = this.extractThreadId(stdoutBuffer);
      if (nextThreadId && nextThreadId !== resolvedThreadId) {
        resolvedThreadId = nextThreadId;
        this.logger.log(
          JSON.stringify({
            event: 'codex.thread.detected',
            requestId,
            runtime: 'cli_spawn',
            threadId: resolvedThreadId,
          }),
        );
      }
    });

    child.stderr.on('data', chunk => {
      stderrBuffer += chunk;
    });

    let exitCode: number | null;

    try {
      exitCode = await new Promise<number | null>((resolveExit, reject) => {
        child.once('error', reject);
        child.once('close', code => resolveExit(code));
      });
    } catch (error: any) {
      await fs.rm(outputFilePath, { force: true });
      this.logger.error(
        JSON.stringify({
          event: 'codex.process.spawn_error',
          requestId,
          runtime: 'cli_spawn',
          error: error?.message ?? String(error),
        }),
      );
      throw new BadGatewayException({
        message: 'Failed to start Codex CLI',
        error: error?.message ?? String(error),
        requestId,
        codexWorkspaceDir: this.codexWorkspaceDir,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await this.readOutputMessage(outputFilePath);
    await fs.rm(outputFilePath, { force: true });
    const durationMs = Date.now() - startedAt;

    this.logger.log(
      JSON.stringify({
        event: 'codex.process.finished',
        requestId,
        runtime: 'cli_spawn',
        pid: child.pid ?? null,
        exitCode,
        durationMs,
        resolvedThreadId: resolvedThreadId || null,
        stdoutTail: this.tail(stdoutBuffer),
        stderrTail: this.tail(stderrBuffer),
        textLength: text.length,
      }),
    );

    if (didTimeout) {
      throw new GatewayTimeoutException({
        message: 'Codex process timed out',
        timeoutMs: this.timeoutMs,
        threadId: resolvedThreadId || null,
        requestId,
        codexWorkspaceDir: this.codexWorkspaceDir,
        stderrTail: this.tail(stderrBuffer),
      });
    }

    if (exitCode !== 0) {
      throw new BadGatewayException({
        message: 'Codex CLI failed',
        exitCode,
        requestId,
        codexWorkspaceDir: this.codexWorkspaceDir,
        codexBinPath: this.codexBinPath,
        argsPreview: this.formatArgsForLog(args),
        stderr: stderrBuffer.slice(0, 4000),
        stderrTail: this.tail(stderrBuffer),
        stdoutTail: this.tail(stdoutBuffer),
        threadId: resolvedThreadId || null,
      });
    }

    if (!resolvedThreadId) {
      this.logger.error(
        JSON.stringify({
          event: 'codex.thread.missing',
          requestId,
          runtime: 'cli_spawn',
          stdoutTail: this.tail(stdoutBuffer),
          stderrTail: this.tail(stderrBuffer),
        }),
      );
      throw new BadGatewayException({
        message: 'Codex threadId was not detected',
        requestId,
        stdoutTail: this.tail(stdoutBuffer),
        stderrTail: this.tail(stderrBuffer),
      });
    }

    return {
      text,
      threadId: resolvedThreadId,
    };
  }

  private consumeJsonlBuffer(activeRun: ActiveRun, flush = false) {
    let buffer = activeRun.lineBuffer;
    const lines: string[] = [];

    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        break;
      }

      lines.push(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
    }

    if (flush && buffer.trim()) {
      lines.push(buffer);
      buffer = '';
    }

    activeRun.lineBuffer = buffer;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('{')) {
        continue;
      }

      try {
        const rawEvent = JSON.parse(line) as Record<string, any>;
        const { nextState, events } = this.mapper.mapRawEvent(
          rawEvent,
          activeRun.mapperState,
        );
        activeRun.mapperState = nextState;

        for (const event of events) {
          this.sendEvent(activeRun.response, event);
        }
      } catch (error: any) {
        this.logger.warn(
          JSON.stringify({
            event: 'codex.stream.parse_warning',
            requestId: activeRun.requestId,
            runtime: 'cli_spawn',
            line: line.slice(0, 500),
            error: error?.message ?? String(error),
          }),
        );
      }
    }
  }

  private openSse(res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
  }

  private sendEvent(res: Response, event: ReturnType<CodexEventMapper['createFailedEvent']> | ReturnType<CodexEventMapper['createCompletedEvent']> | ReturnType<CodexEventMapper['createRuntimeFinishedEvent']> | ReturnType<CodexEventMapper['createRuntimeStartedEvent']> | { type: 'thread.started'; threadId: string } | { type: 'assistant.delta'; text: string }) {
    if (res.writableEnded) {
      return;
    }

    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  private failRun(activeRun: ActiveRun, message: string) {
    if (activeRun.terminalEventSent || activeRun.response.writableEnded) {
      return;
    }

    this.sendEvent(activeRun.response, this.mapper.createFailedEvent(message));
    this.sendEvent(
      activeRun.response,
      this.mapper.createRuntimeFinishedEvent(activeRun.requestId),
    );
    activeRun.terminalEventSent = true;
    activeRun.response.end();
  }

  private buildArgs(
    dto: CodexChatDto,
    outputFilePath: string,
    mode: 'non_stream' | 'stream',
  ): string[] {
    if (dto.threadId) {
      return [
        'exec',
        'resume',
        '--json',
        '--skip-git-repo-check',
        ...(mode === 'non_stream'
          ? ['--output-last-message', outputFilePath]
          : []),
        dto.threadId,
        dto.prompt,
      ];
    }

    return [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--sandbox',
      'workspace-write',
      ...(mode === 'non_stream'
        ? ['--output-last-message', outputFilePath]
        : []),
      dto.prompt,
    ];
  }

  private buildEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      NO_COLOR: '1',
      OTEL_SDK_DISABLED: 'true',
    };
  }

  private extractThreadId(stdoutBuffer: string): string | null {
    const lines = stdoutBuffer.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('{')) {
        continue;
      }

      try {
        const event = JSON.parse(line) as { type?: string; thread_id?: string };
        if (event.type === 'thread.started' && event.thread_id) {
          return event.thread_id;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private buildFailureMessage(exitCode: number | null, stderr: string): string {
    const stderrTail = this.tail(stderr, 400);
    if (stderrTail) {
      return `Codex CLI failed (exitCode=${exitCode ?? 'null'}): ${stderrTail}`;
    }

    return `Codex CLI failed (exitCode=${exitCode ?? 'null'})`;
  }

  private async readOutputMessage(outputFilePath: string): Promise<string> {
    try {
      const text = await fs.readFile(outputFilePath, 'utf8');
      return text.trim();
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return '';
      }

      throw new BadGatewayException({
        message: 'Failed to read Codex output',
        error: error?.message ?? String(error),
      });
    }
  }

  private async ensureWorkspaceExists(): Promise<void> {
    try {
      const stats = await fs.stat(this.codexWorkspaceDir);
      if (!stats.isDirectory()) {
        throw new Error('Workspace path is not a directory');
      }
    } catch (error: any) {
      throw new BadGatewayException({
        message: 'Codex workspace directory is unavailable',
        workspaceDir: this.codexWorkspaceDir,
        error: error?.message ?? String(error),
      });
    }
  }

  private tail(value: string, maxLength = 2000): string | null {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    return normalized.slice(-maxLength);
  }

  private formatArgsForLog(args: string[]): string[] {
    return args.map((arg, index) => {
      const isOutputFileValue = args[index - 1] === '--output-last-message';
      if (isOutputFileValue) {
        return '<temp-output-file>';
      }

      if (arg.length > 240) {
        return `${arg.slice(0, 240)}...<trimmed>`;
      }

      return arg;
    });
  }
}
