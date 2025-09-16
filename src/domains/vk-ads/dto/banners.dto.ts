import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BannersQueryDto {
  // Pagination
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

  // Filters (proxied as-is to VK)
  @IsOptional() @IsString() _id?: string;
  @IsOptional() @IsString() _id__in?: string; // comma-separated ids

  @IsOptional() @IsString() _ad_group_id?: string;
  @IsOptional() @IsString() _ad_group_id__in?: string; // comma-separated ids

  // status values are managed by upstream; pass-through
  @IsOptional() @IsString() _ad_group_status?: string; // active|blocked|deleted
  @IsOptional() @IsString() _ad_group_status__ne?: string;
  @IsOptional() @IsString() _ad_group_status__in?: string; // comma-separated

  @IsOptional() @IsString() _status?: string; // active|blocked|deleted
  @IsOptional() @IsString() _status__ne?: string;
  @IsOptional() @IsString() _status__in?: string; // comma-separated

  // Updated datetime filters: "YYYY-MM-DD HH:mm:ss"
  @IsOptional() @IsString() _updated__gt?: string;
  @IsOptional() @IsString() _updated__gte?: string;
  @IsOptional() @IsString() _updated__lt?: string;
  @IsOptional() @IsString() _updated__lte?: string;

  // Full-text search
  @IsOptional() @IsString() _url?: string;
  @IsOptional() @IsString() _textblock?: string;
}

