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
