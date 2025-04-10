import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async createReview(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: number,
    @Body('dealId') dealId: number,
    @Body('date') date: string,
  ) {
    return this.reviewsService.createReview(userId, dealId, date, file);
  }

  @Delete(':id')
  async deleteReview(@Param('id') reviewId: string): Promise<void> {
    const id = parseInt(reviewId, 10);
    if (isNaN(id)) {
      throw new Error('Неверный ID отзыва');
    }
    return this.reviewsService.deleteReview(id);
  }
}
