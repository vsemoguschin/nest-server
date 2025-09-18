import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export type AdGroupStatus = 'active' | 'blocked' | 'deleted';

export class AdGroupsQueryDto {
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

  @IsOptional() @IsString() _status?: AdGroupStatus; // pass-through
  @IsOptional() @IsString() _status__ne?: AdGroupStatus;
  @IsOptional() @IsString() _status__in?: string; // comma-separated

  @IsOptional() @IsString() _last_updated__gt?: string;
  @IsOptional() @IsString() _last_updated__gte?: string;
  @IsOptional() @IsString() _last_updated__lt?: string;
  @IsOptional() @IsString() _last_updated__lte?: string;

  // Sorting: e.g. "id", "-id", "status,name,-id"
  @IsOptional() @IsString() sorting?: string;
}

export interface AdGroupItem {
  id: number;
  name?: string;
  package_id?: number;
  last_updated?: string;
  status?: AdGroupStatus;
}

export interface AdGroupsListResponse {
  count: number;
  offset: number;
  items: AdGroupItem[];
}

