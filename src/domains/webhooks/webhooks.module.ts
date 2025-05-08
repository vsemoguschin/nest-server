import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { CdekService } from 'src/services/cdek.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, CdekService]
})
export class WebhooksModule {}
