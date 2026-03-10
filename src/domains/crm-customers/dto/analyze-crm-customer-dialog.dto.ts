import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AnalyzeCrmCustomerDialogDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  count?: number;

  @IsOptional()
  @IsString()
  customerContext?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;
}

