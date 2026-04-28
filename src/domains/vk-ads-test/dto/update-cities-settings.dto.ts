import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpdateCitiesSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(12)
  @Max(75)
  ageFrom?: number | null;

  @IsOptional()
  @IsInt()
  @Min(12)
  @Max(75)
  ageTo?: number | null;

  @IsOptional()
  @IsIn(['male', 'female', null])
  sex?: 'male' | 'female' | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  budget?: number;
}
