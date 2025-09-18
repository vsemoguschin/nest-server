import { IsInt, IsOptional, IsString, Max, Min, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

// Common types
export type AdPlanStatus = 'active' | 'blocked' | 'deleted';

// Public API response types
export interface AdPlanItem {
  id: number;
  name?: string;
  status?: AdPlanStatus;
}

export interface AdPlansListResponse {
  count: number;
  offset: number;
  items: AdPlanItem[];
}

// Detailed AdPlan (single resource) per docs
export interface AdPlan {
  id: number;
  created?: string; // datetime
  updated?: string; // datetime
  name: string;
  status?: AdPlanStatus;
  vkads_status?: Record<string, any>;
  ad_groups?: any[]; // list of AdGroup (structure omitted here)
  autobidding_mode?: string; // e.g. 'max_goals'
  budget_limit?: string; // decimal as string
  budget_limit_day?: string; // decimal as string
  date_start?: string; // date
  date_end?: string; // date
  max_price?: string; // decimal as string
  objective?: string;
  priced_goal?: Record<string, any>;
  pricelist_id?: number;
  enable_offline_goals?: boolean;
}

export class AdPlansQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(250)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  // Filters
  @IsOptional() @IsString() _id?: string;
  @IsOptional() @IsString() _id__in?: string; // comma-separated ids

  @IsOptional() @IsString() _status?: string; // active|blocked|deleted (pass-through)
  @IsOptional() @IsString() _status__ne?: string;
  @IsOptional() @IsString() _status__in?: string; // comma-separated

  // Sorting: e.g. "id", "-id", "status,name,-id"
  @IsOptional() @IsString() sorting?: string;
}

export class AdPlanCreateDto {
  @IsString()
  name!: string;

  @IsOptional() @IsString() status?: AdPlanStatus; // pass-through

  // Datetimes in "YYYY-MM-DD HH:mm:ss"
  @IsOptional() @IsString() date_start?: string;
  @IsOptional() @IsString() date_end?: string;

  @IsOptional() @IsString() autobidding_mode?: string;
  @IsOptional() @IsString() budget_limit_day?: string;
  @IsOptional() @IsString() budget_limit?: string;

  // VK API expects strings "True"/"False"; pass-through as string
  @IsOptional() @IsString() enable_utm?: string;
  @IsOptional() @IsString() enable_offline_goals?: string;

  @IsOptional() @IsString() objective?: string;

  // Pass-through: VK allows creating with ad_groups list
  @IsOptional()
  @IsArray()
  ad_groups?: any[];
}

// Params and query DTOs for single AdPlan GET

export class AdPlanIdParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id!: number;
}

export class AdPlanGetQueryDto {
  @IsOptional()
  @IsString()
  fields?: string; // comma-separated fields
}
