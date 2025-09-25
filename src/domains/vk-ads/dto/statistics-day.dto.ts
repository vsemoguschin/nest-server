import {
  IsIn,
  IsOptional,
  IsString,
  IsNotEmpty,
  Matches,
  IsInt,
  Min,
  Max,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const DIR = ['asc', 'desc'] as const;

function IsNotFutureYmd(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isNotFutureYmd',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
          const today = new Date().toISOString().slice(0, 10);
          return value <= today;
        },
        defaultMessage() {
          return 'Дата начала не может быть будущей';
        },
      },
    });
  };
}

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
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsNotFutureYmd({ message: 'Дата начала не может быть будущей' })
  date_from!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date_to?: string;
  @IsOptional() @IsIn(DIR as unknown as string[]) d?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(250) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsString() status?: string; // comma-separated
  @IsOptional() @IsString() sort_by?: string;
  // Accept both CSV string and repeated query (?ids=1,2 or ?ids=1&ids=2)
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined;
    if (Array.isArray(value)) return value.map((v) => String(v)).join(',');
    return String(value);
  })
  @IsString()
  ids?: string; // comma-separated group ids
}

// Query DTO for: GET /vk-ads/ad_plans/statistics/day
// Same filters as StatisticsDayDto, but without `entity`.
export class StatisticsDayAdPlansDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsNotFutureYmd({ message: 'Дата начала не может быть будущей' })
  date_from!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date_to?: string;
  @IsOptional() @IsIn(DIR as unknown as string[]) d?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(250) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsString() status?: string; // comma-separated
}

// Query DTO for: GET /vk-ads/banners/statistics/day
// Similar to groups DTO, but ids correspond to banners and `status` applies to banner status.
export class StatisticsDayBannersDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsNotFutureYmd({ message: 'Дата начала не может быть будущей' })
  date_from!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date_to?: string;
  @IsOptional() @IsIn(DIR as unknown as string[]) d?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(250) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsString() sort_by?: string;
  @IsOptional() @IsString() status?: string; // banner statuses: active,blocked,deleted or 'all'

  // Accept both CSV string and repeated query (?ids=1,2 or ?ids=1&ids=2)
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined;
    if (Array.isArray(value)) return value.map((v) => String(v)).join(',');
    return String(value);
  })
  @IsString()
  ids?: string; // comma-separated banner ids
}
