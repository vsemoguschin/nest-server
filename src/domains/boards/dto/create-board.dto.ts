import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBoardDto {
  @ApiProperty({ example: 'Новая доска' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Описание проекта', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
