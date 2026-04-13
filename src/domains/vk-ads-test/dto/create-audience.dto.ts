import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { IsAgeToGreaterOrEqualAgeFrom } from './age-range.validator';

export class CreateAudienceDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsIn(['male', 'female'])
  sex?: 'male' | 'female';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ageFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsAgeToGreaterOrEqualAgeFrom({
    message: 'ageFrom must be less than or equal to ageTo',
  })
  ageTo?: number;

  @IsOptional()
  geoJson?: unknown;

  @IsOptional()
  interestsJson?: unknown;
}
