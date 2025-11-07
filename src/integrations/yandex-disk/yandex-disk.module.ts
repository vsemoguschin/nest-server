import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { YandexDiskClient } from './yandex-disk.client';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [YandexDiskClient],
  exports: [YandexDiskClient],
})
export class YandexDiskModule {}
