import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const VK_GROUPS_GET_MEMBERS_COUNT_MAX = 1000;

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function toFieldsArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const rawItems = Array.isArray(value) ? value : [value];
  const fields = rawItems
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);

  if (!fields.length) {
    return undefined;
  }

  return Array.from(new Set(fields));
}

export class GetVkGroupMembersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  source?: string;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(1)
  group_id!: number;

  @IsOptional()
  @IsIn(['id_asc', 'id_desc', 'time_asc', 'time_desc'])
  sort?: 'id_asc' | 'id_desc' | 'time_asc' | 'time_desc';

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsInt()
  @Min(1)
  @Max(VK_GROUPS_GET_MEMBERS_COUNT_MAX)
  count?: number;

  @IsOptional()
  @Transform(({ value }) => toFieldsArray(value))
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  fields?: string[];

  @IsOptional()
  @IsIn(['all', 'friends', 'unsure', 'managers', 'donut'])
  filter?: 'all' | 'friends' | 'unsure' | 'managers' | 'donut';

  @IsOptional()
  @IsString()
  v?: string;
}
