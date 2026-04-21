import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';

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
