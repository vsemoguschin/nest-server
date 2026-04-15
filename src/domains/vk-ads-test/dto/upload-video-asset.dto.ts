import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UploadVideoAssetDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  testId: number;

  @IsOptional()
  @IsString()
  name?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  width: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  height: number;
}
