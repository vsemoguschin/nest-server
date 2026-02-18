// src/domains/webhooks/webhooks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CdekService } from 'src/services/cdek.service';
import { CdekWebhookReconcileService } from './cdek-webhook-reconcile.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cdekService: CdekService,
    private readonly reconcileService: CdekWebhookReconcileService,
  ) {}

  async processCdekWebhook(payload: any) {
    const { type, attributes } = payload;

    if (type !== 'ORDER_STATUS') {
      return;
    }

    const cdek_number = attributes?.cdek_number;
    if (!cdek_number) return;

    try {
      const token = await this.cdekService.getAccessToken();
      const entity = await this.cdekService.getOrderInfo(cdek_number, token);
      const { status, sendDate, deliveredDate, cdekStatus } =
        this.cdekService.parseOrderStatus(entity);

      const price = entity.delivery_detail.total_sum ?? 0;

      await this.prisma.delivery.updateMany({
        where: { track: cdek_number },
        data: {
          price: price,
          status,
          date: sendDate,
          deliveredDate,
          cdekStatus,
        },
      });
      // console.log(
      //   'Updated delivery:',
      //   cdek_number,
      //   status,
      //   sendDate,
      //   deliveredDate,
      //   del,
      // );
    } catch (error) {
      console.error(`Error in webhook processing: ${error.message}`);
    }
  }

  async registerCdekWebhook() {
    return this.reconcileService.reconcile({
      syncAfterCheck: false,
      syncFast: true,
    });
  }
}
