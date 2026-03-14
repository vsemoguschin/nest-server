import {
  Body,
  Controller,
  Inject,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CODEX_RUNTIME, CodexRuntime } from './codex-runtime';
import { CodexChatDto } from './dto/codex-chat.dto';
import { CodexCancelDto } from './dto/codex-cancel.dto';

@ApiTags('codex-stream')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('api/codex')
export class CodexStreamController {
  private readonly logger = new Logger(CodexStreamController.name);

  constructor(
    @Inject(CODEX_RUNTIME) private readonly codexRuntime: CodexRuntime,
  ) {}

  @Post('stream')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Streaming proxy to local Codex via SSE',
    description:
      'Spawns local Codex CLI, normalizes stdout JSONL and streams only normalized events to frontend.',
  })
  async stream(
    @Body() body: CodexChatDto,
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
    @Res() res: Response,
  ) {
    this.logger.log(
      JSON.stringify({
        event: 'codex.http.stream_request',
        path: req.originalUrl,
        method: req.method,
        userId: req.user?.id ?? null,
        userFullName: req.user?.fullName ?? null,
        mode: body.threadId ? 'resume' : 'new',
        inputThreadId: body.threadId ?? null,
        promptLength: body.prompt.length,
      }),
    );

    await this.codexRuntime.streamMessage(body, req, res);
  }

  @Post('cancel')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Cancel active local Codex streaming run',
  })
  async cancel(@Body() body: CodexCancelDto) {
    return this.codexRuntime.cancelRun(body);
  }
}
