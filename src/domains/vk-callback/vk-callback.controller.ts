import { Body, Controller, Header, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from 'src/auth/public.decorator';
import { VkCallbackService } from './vk-callback.service';

@Controller('vk')
export class VkCallbackController {
  constructor(private readonly vkCallbackService: VkCallbackService) {}

  @Post('callback')
  @Public()
  handleCallback(@Body() body: any, @Res() res: Response): void {
    const result = this.vkCallbackService.handleCallback(body);

    res.status(200).type('text/plain').send(result);
  }
}
