import { IsOptional, IsString, ValidateIf } from 'class-validator';

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
}
