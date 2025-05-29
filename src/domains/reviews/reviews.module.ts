import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { FilesModule } from '../files/files.module';
import { DealsService } from '../deals/deals.service';

@Module({
  imports: [
    FilesModule, // Подключаем FilesModule
  ],
  providers: [ReviewsService, DealsService],
  controllers: [ReviewsController]
})
export class ReviewsModule {}
