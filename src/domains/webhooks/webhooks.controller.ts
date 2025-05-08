// src/domains/webhooks/webhooks.controller.ts
import { Body, Controller, Post, Res, HttpStatus } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { Response } from 'express';
import { Public } from 'src/auth/public.decorator';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('cdek-register')
  async registerCdekWebhook() {
    return this.webhooksService.registerCdekWebhook();
  }

  @Post('cdek')
  @Public()
  async handleCdekWebhook(@Body() payload: any, @Res() res: Response) {
    try {
      // console.log('Received CDEK webhook:', payload);
      await this.webhooksService.processCdekWebhook(payload);
      // return res.status(HttpStatus.OK).send('Webhook received');
    } catch (error) {
      console.error('Error processing CDEK webhook:', error);
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send('Error processing webhook');
    }
  }
}
