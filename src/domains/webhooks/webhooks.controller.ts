// src/domains/webhooks/webhooks.controller.ts
import { Body, Controller, Post, Res, HttpStatus } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { Response } from 'express';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('cdek-register')
  async registerCdekWebhook() {
    return this.webhooksService.registerCdekWebhook();
  }

  @Post('cdek')
  async handleCdekWebhook(@Body() payload: any, @Res() res: Response) {
    try {
      await this.webhooksService.processCdekWebhook(payload);
      return res.status(HttpStatus.OK).send('Webhook received');
    } catch (error) {
      console.error('Error processing CDEK webhook:', error);
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send('Error processing webhook');
    }
  }
}
