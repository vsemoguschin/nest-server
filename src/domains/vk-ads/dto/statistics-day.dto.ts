import { IsIn, IsOptional, IsString, IsNotEmpty, Matches, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const DIR = ['asc', 'desc'] as const;

// Generic response type for statistics day API
export interface StatsDayResponse<TExtra = {}> {
  count?: number;
  offset?: number;
  limit?: number;
  total?: Record<string, any>;
  budget_limit?: string;
  budget_limit_day?: string;
  items: Array<{ id: number | string } & TExtra & Record<string, any>>;
}

// Query DTO for: GET /vk-ads/ad_plans/:id/groups/statistics/day
// Same as StatisticsDayDto but without `entity` and without `ids`
export class StatisticsDayGroupsDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date_from!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date_to?: string;
  @IsOptional() @IsIn(DIR as unknown as string[]) d?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(250) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsString() status?: string; // comma-separated
}

// Query DTO for: GET /vk-ads/ad_plans/statistics/day
// Same filters as StatisticsDayDto, but without `entity`.
export class StatisticsDayAdPlansDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date_from!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date_to?: string;
  @IsOptional() @IsIn(DIR as unknown as string[]) d?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(250) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsString() status?: string; // comma-separated
}

