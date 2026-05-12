import {
  IsIn,
  IsOptional,
  IsString,
  IsNotEmpty,
  Matches,
  IsInt,
  IsBoolean,
  Min,
  Max,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

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
          return 'date_from cannot be in the future';
        },
      },
    });
  };
}

export class AdPlansReportQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsNotFutureYmd({ message: 'date_from cannot be in the future' })
  date_from!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  integrationId?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsIn(['neon', 'book'])
  project?: 'neon' | 'book';

  // Comma-separated ad_plan ids filter. When set, status/limit are ignored for enumeration.
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined;
    if (Array.isArray(value)) return value.map((v) => String(v)).join(',');
    return String(value);
  })
  @IsString()
  adPlanIds?: string;

  // Which ad_plan statuses to include. Default (no param): all statuses (active + blocked + deleted). Optional, backward-compatible.
  @IsOptional()
  @IsString()
  @IsIn(['active', 'blocked', 'deleted', 'active,blocked', 'all'])
  status?: 'active' | 'blocked' | 'deleted' | 'active,blocked' | 'all';

  // Max number of ad_plans to fetch (before stats filter). Default 100, max 500.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  // When true (default true), plans with shows=0 AND clicks=0 AND spent=0 are excluded.
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'false' || value === '0') return false;
    if (value === 'true' || value === '1') return true;
    return value;
  })
  @IsBoolean()
  onlyWithStats?: boolean;

  // When true (default), banner fallback keys are included in attribution
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'false' || value === '0') return false;
    if (value === 'true' || value === '1') return true;
    return value;
  })
  @IsBoolean()
  includeFallbackKeys?: boolean;

  // Debug: when true, response includes sample Deal.adTag values from DB for matching inspection
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'false' || value === '0') return false;
    if (value === 'true' || value === '1') return true;
    return value;
  })
  @IsBoolean()
  debugDeals?: boolean;
}
