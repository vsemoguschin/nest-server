import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { AiAssistantService } from './ai-assistant.service';
import { AssistantPlaygroundRespondDto } from './dto/assistant-playground-respond.dto';

@ApiTags('crm-ai-assistant')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('crm/ai-assistant')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

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
