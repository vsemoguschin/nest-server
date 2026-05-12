import { IsOptional, IsBoolean, IsInt, IsString, IsNotEmpty, IsIn, Matches, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class AdPlanDealsQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
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

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'false' || value === '0') return false;
    if (value === 'true' || value === '1') return true;
    return value;
  })
  @IsBoolean()
  includeFallbackKeys?: boolean;
}
