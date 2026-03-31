import { Body, Controller, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from 'src/auth/public.decorator';
import { VkCallbackService } from './vk-callback.service';

@Controller('vk')
export class VkCallbackController {
  constructor(private readonly vkCallbackService: VkCallbackService) {}

  @Post('callback')
  @Public()
  async handleCallback(@Body() body: any, @Res() res: Response): Promise<void> {
    const result = await this.vkCallbackService.handleCallback(body);

    res.status(200).type('text/plain').send(result);
  }
}
