import { Injectable } from '@nestjs/common';

@Injectable()
export class VkCallbackService {
  handleCallback(body: any): string {
    console.log('VK callback body:', body);

    if (body?.type === 'confirmation') {
      return process.env.VK_CONFIRMATION_CODE ?? '';
    }

    const expectedSecret = process.env.VK_CALLBACK_SECRET;
    const expectedGroupId = Number(process.env.VK_GROUP_EASYBOOK_ASSISTANT_ID);

    if (body?.group_id !== expectedGroupId) {
      return 'ok';
    }

    if (body?.secret !== expectedSecret) {
      return 'ok';
    }

    return 'ok';
  }
}
