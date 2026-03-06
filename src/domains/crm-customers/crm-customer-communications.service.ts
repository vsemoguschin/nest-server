import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { VkMessagesProxyService } from '../vk-messages/vk-messages.service';

@Injectable()
export class CrmCustomerCommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vk: VkMessagesProxyService,
  ) {}

  private pickString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
  }

  private pickOptionalString(value: unknown): string | undefined {
    const normalized = this.pickString(value).trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private async resolveCustomerVkContext(customerId: number) {
    const customer = await this.prisma.crmCustomer.findFirst({
      where: { id: customerId },
      select: {
        id: true,
        account: {
          select: {
            code: true,
          },
        },
        vk: {
          select: {
            externalId: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('CRM-клиент не найден');
    }

    const source = customer.account?.code?.trim().toLowerCase();
    if (!source) {
      throw new BadRequestException('У клиента не указан CRM-аккаунт');
    }

    const vkExternalId = customer.vk?.externalId?.trim();
    if (!vkExternalId) {
      throw new BadRequestException('У клиента не указан VK externalId');
    }

    const peerId = Number(vkExternalId);
    if (!Number.isFinite(peerId) || peerId <= 0) {
      throw new BadRequestException('Некорректный VK externalId у клиента');
    }

    return { source, peerId };
  }

  async getVkDialogHistory(
    customerId: number,
    query: Record<string, unknown>,
  ) {
    const { source, peerId } = await this.resolveCustomerVkContext(customerId);

    return this.vk.post('/api/vk/messages/get-history', {
      source,
      v: this.pickOptionalString(query.v) ?? '5.199',
      peer_id: peerId,
      offset: this.pickOptionalString(query.offset) ?? '0',
      count: this.pickOptionalString(query.count) ?? '30',
    });
  }

  async sendVkDialogMessage(
    customerId: number,
    body: Record<string, unknown>,
    files: Express.Multer.File[] = [],
  ) {
    const { source, peerId } = await this.resolveCustomerVkContext(customerId);

    const normalizedBody: Record<string, unknown> = {
      source,
      peer_id: peerId,
      v: this.pickOptionalString(body.v) ?? '5.199',
      random_id:
        this.pickOptionalString(body.random_id) ??
        String(Math.floor(Math.random() * 1000000)),
      payload: this.pickOptionalString(body.payload),
      message: this.pickOptionalString(body.message),
    };

    const hasFiles = Array.isArray(files) && files.length > 0;
    const result = hasFiles
      ? await this.vk.postMultipart(
          '/api/vk/messages/send-with-files',
          normalizedBody,
          files,
        )
      : await this.vk.post('/api/vk/messages/send', normalizedBody);

    if (result.status < 400) {
      this.vk.notifySourceUpdated(source, 'send');
    }

    return result;
  }
}
