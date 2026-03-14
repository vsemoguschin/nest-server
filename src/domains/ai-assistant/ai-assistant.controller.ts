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
import { Request, Response } from 'express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { AiAssistantService } from './ai-assistant.service';
import { AssistantPlaygroundRespondDto } from './dto/assistant-playground-respond.dto';
import { CodexChatDto } from './dto/codex-chat.dto';
import { CODEX_RUNTIME, CodexRuntime } from './codex-runtime';

@ApiTags('crm-ai-assistant')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('crm/ai-assistant')
export class AiAssistantController {
  private readonly logger = new Logger(AiAssistantController.name);

  constructor(
    private readonly aiAssistantService: AiAssistantService,
    @Inject(CODEX_RUNTIME) private readonly codexRuntime: CodexRuntime,
  ) {}

  @Post('respond')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Прокси-запрос к assistant-service для playground',
    description:
      'Отправляет тестовое сообщение в assistant-service и возвращает ответ для страницы CRM AI-ассистента.',
  })
  async respond(@Body() body: AssistantPlaygroundRespondDto) {
    return this.aiAssistantService.respond(body);
  }

  @Post('codex/respond')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'MVP-прокси к локальному Codex',
    description:
      'Вызывает локальный Codex из codex-test/assistant и возвращает text + threadId для простого CRM-чата.',
  })
  async respondWithCodex(
    @Body() body: CodexChatDto,
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
  ) {
    this.logger.log(
      JSON.stringify({
        event: 'codex.http.request',
        path: req.originalUrl,
        method: req.method,
        userId: req.user?.id ?? null,
        userFullName: req.user?.fullName ?? null,
        mode: body.threadId ? 'resume' : 'new',
        inputThreadId: body.threadId ?? null,
        promptLength: body.prompt.length,
      }),
    );

    return body.threadId
      ? this.codexRuntime.resumeThread(body.threadId, body.prompt)
      : this.codexRuntime.sendMessage(body);
  }

  @Post('respond-debug')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Debug-прокси-запрос к assistant-service для playground',
    description:
      'Отправляет тестовое сообщение в assistant-service и возвращает структурированный debug-ответ для страницы CRM AI-ассистента.',
  })
  async respondDebug(@Body() body: AssistantPlaygroundRespondDto) {
    return this.aiAssistantService.respondDebug(body);
  }

  @Post('respond/stream')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Потоковый прокси-запрос к assistant-service для playground',
    description:
      'Открывает потоковый ответ assistant-service для страницы CRM AI-ассистента.',
  })
  async streamRespond(
    @Body() body: AssistantPlaygroundRespondDto,
    @Res() res: Response,
  ) {
    await this.aiAssistantService.streamRespond(body, res);
  }
}
