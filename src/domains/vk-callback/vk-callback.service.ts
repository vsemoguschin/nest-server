import { Injectable } from '@nestjs/common';

@Injectable()
export class VkCallbackService {
  handleCallback(body: any): string {
    console.log('VK callback body:', body);

    if (body?.type === 'confirmation') {
      return process.env.VK_CONFIRMATION_CODE || '';
    }

    return 'ok';
  }
}
