import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Post,
  Query,
  Res,
  Sse,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { VkMessagesProxyService } from './vk-messages.service';

@Controller('vk/messages')
export class VkMessagesController {
  constructor(private readonly vk: VkMessagesProxyService) {}

  private pickQueryString(
    value: unknown,
    fallback = '',
  ): string {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === 'string');
      return typeof first === 'string' ? first : fallback;
    }
    return fallback;
  }

  private pickOptionalQueryString(value: unknown): string | undefined {
    const normalized = this.pickQueryString(value).trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  @Get('conversations')
  async getConversations(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.vk.post('/api/vk/messages/get-conversations', query);
    res.status(result.status);
    return result.data;
  }

  @Get('history')
  async getHistory(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.vk.post('/api/vk/messages/get-history', query);
    res.status(result.status);
    return result.data;
  }

  @Get('user')
  async getUser(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const body = {
      source: this.pickQueryString(query.source, 'easybook'),
      v: this.pickOptionalQueryString(query.v),
      user_ids: this.pickOptionalQueryString(query.user_ids),
      fields: this.pickOptionalQueryString(query.fields),
      name_case: this.pickOptionalQueryString(query.name_case),
    };

    const result = await this.vk.post('/api/vk/users/get', body);
    res.status(result.status);
    return result.data;
  }

  @Get('users/search')
  async searchUsers(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const source = this.pickQueryString(query.source, 'easybook');
    const version = this.pickQueryString(query.v);

    const params: Record<string, unknown> = { ...query };
    delete params.source;
    delete params.v;

    const result = await this.vk.post('/api/vk/users/search', {
      source,
      v: version,
      params,
    });

    res.status(result.status);
    return result.data;
  }

  @Post('send')
  @UseInterceptors(AnyFilesInterceptor())
  async send(
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[],
    @Res({ passthrough: true }) res: Response,
  ) {
    const hasFiles = Array.isArray(files) && files.length > 0;
    const result = hasFiles
      ? await this.vk.postMultipart('/api/vk/messages/send-with-files', body, files)
      : await this.vk.post('/api/vk/messages/send', body);
    const source = typeof body.source === 'string' ? body.source : '';

    if (result.status < 400 && source) {
      this.vk.notifySourceUpdated(source, 'send');
    }

    res.status(result.status);
    return result.data;
  }

  @Sse('stream')
  stream(@Query('source') source?: string): Observable<MessageEvent> {
    return this.vk.stream(source);
  }

  @Post('storage/set')
  async storageSet(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.vk.post('/api/vk/storage/set', body);
    res.status(result.status);
    return result.data;
  }
}
