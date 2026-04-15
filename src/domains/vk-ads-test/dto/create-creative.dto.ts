import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateCreativeDto {
  @IsString()
  name: string;

  @IsString()
  title: string;

  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  videoSourceUrl?: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  vkContentId?: string | number;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  videoContentId?: string | number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  videoAssetId?: number;
}
