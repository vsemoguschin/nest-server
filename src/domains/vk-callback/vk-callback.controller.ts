import { Body, Controller, Header, Post } from '@nestjs/common';
import { Public } from 'src/auth/public.decorator';
import { VkCallbackService } from './vk-callback.service';

@Controller('vk')
export class VkCallbackController {
  constructor(private readonly vkCallbackService: VkCallbackService) {}

  @Post('callback')
  @Public()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  handleCallback(@Body() body: any): string {
    return this.vkCallbackService.handleCallback(body);
  }
}
