import {
  IsIn,
  IsOptional,
  IsString,
  IsNotEmpty,
  Matches,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const ENTITIES = ['banners', 'ad_groups', 'ad_plans', 'users'] as const;
const ATTR = ['conversion', 'impression'] as const;
const DIR = ['asc', 'desc'] as const;

export class StatisticsDayDto {
  @IsIn(ENTITIES as unknown as string[]) entity: string;

  // Accept both `ids` and `id` from query; normalize into `ids`
  @IsString()
  @IsNotEmpty()
  @Transform(({ value, obj }) => value ?? obj.id)
  ids: string; // "1,2,3"

  // Optional alias to satisfy whitelist=true while allowing `id`
  @IsOptional()
  @IsString()
  id?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/) date_from: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date_to?: string;

  @IsOptional()
  @IsString()
  fields?: string; // "base,video,..." | "all"

  @IsOptional() @IsIn(ATTR as unknown as string[]) attribution?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(250) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;

  @IsOptional()
  @IsString()
  sort_by?: string; // e.g. "base.clicks"

  @IsOptional() @IsIn(DIR as unknown as string[]) d?: string;

  // Additional v3 filters
  @IsOptional() @IsString() id_ne?: string;

  // status filters accept comma-separated list: all,active,blocked,deleted
  @IsOptional() @IsString() banner_status?: string;
  @IsOptional() @IsString() banner_status_ne?: string;
  @IsOptional() @IsString() ad_group_status?: string;
  @IsOptional() @IsString() ad_group_status_ne?: string;

  // relational filters
  @IsOptional() @IsString() ad_group_id?: string;
  @IsOptional() @IsString() ad_group_id_ne?: string;
  @IsOptional() @IsString() package_id?: string;
  @IsOptional() @IsString() package_id_ne?: string;
}
