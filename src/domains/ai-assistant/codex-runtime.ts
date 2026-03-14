import type { Request, Response } from 'express';
import { CodexCancelDto } from './dto/codex-cancel.dto';
import { CodexChatDto } from './dto/codex-chat.dto';
import { CodexChatResponseDto } from './dto/codex-chat-response.dto';

export const CODEX_RUNTIME = 'CODEX_RUNTIME';

export type CodexCancelResult = {
  ok: boolean;
  requestId: string;
};

export interface CodexRuntime {
  sendMessage(dto: CodexChatDto): Promise<CodexChatResponseDto>;
  streamMessage(dto: CodexChatDto, req: Request, res: Response): Promise<void>;
  cancelRun(dto: CodexCancelDto): Promise<CodexCancelResult> | CodexCancelResult;
  resumeThread(threadId: string, prompt: string): Promise<CodexChatResponseDto>;
}
