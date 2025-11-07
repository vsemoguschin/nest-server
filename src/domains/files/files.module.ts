import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { YandexDiskModule } from 'src/integrations/yandex-disk/yandex-disk.module';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads', // Временное хранилище файлов
    }),
    YandexDiskModule,
  ],
  providers: [FilesService],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}
