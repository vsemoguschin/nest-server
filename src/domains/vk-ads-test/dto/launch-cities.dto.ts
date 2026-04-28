import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsAgeToGreaterOrEqualAgeFrom } from './age-range.validator';

export class LaunchCityDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id: number;

  @IsString()
  @IsNotEmpty()
  label: string;
}

export class LaunchCitiesDto {
  @Type(() => Number)
  @IsInt()
  accountIntegrationId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  testId?: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUrl({ require_tld: false })
  landingUrl: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  startBudget: number;

  @IsOptional()
  @IsIn(['male', 'female'])
  sex?: 'male' | 'female';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(12)
  @Max(75)
  ageFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(12)
  @Max(75)
  @IsAgeToGreaterOrEqualAgeFrom({
    message: 'ageFrom must be less than or equal to ageTo',
  })
  ageTo?: number;

  @IsOptional()
  @IsString()
  adTitle?: string;

  @IsOptional()
  @IsString()
  adText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  videoAssetId?: number;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => LaunchCityDto)
  cities: LaunchCityDto[];
}
