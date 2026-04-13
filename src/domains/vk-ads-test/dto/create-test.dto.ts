import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class CreateTestDto {
  @Type(() => Number)
  @IsInt()
  accountIntegrationId: number;

  @IsString()
  name: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  startBudget: number;

  @IsOptional()
  @IsUrl({ require_tld: false })
  landingUrl?: string;
}
