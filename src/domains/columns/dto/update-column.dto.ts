import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateColumnDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  // Позволяем менять порядок
  @IsOptional()
  @IsNumber()
  position?: number;
}
