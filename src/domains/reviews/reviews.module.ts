import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    FilesModule, // Подключаем FilesModule
  ],
  providers: [ReviewsService],
  controllers: [ReviewsController]
})
export class ReviewsModule {}
