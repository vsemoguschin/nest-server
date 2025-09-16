import {
  IsIn,
  IsOptional,
  IsString,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
const ENTITIES = ['banners', 'ad_groups', 'ad_plans', 'users'] as const;
const ATTR = ['conversion', 'impression'] as const;

export class GoalsDto {
  @IsIn(ENTITIES as unknown as string[]) entity: string;
  // Accept both `ids` and `id` while normalizing to `ids`
  @IsString()
  @IsNotEmpty()
  @Transform(({ value, obj }) => value ?? obj.id)
  ids: string;
  @IsOptional() @IsString() id?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date_from: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date_to?: string;
  @IsOptional() @IsIn(ATTR as unknown as string[]) attribution?: string;
  // Allow single or comma-separated values: postview,postclick,total
  @IsOptional()
  @Matches(/^(postview|postclick|total)(,(postview|postclick|total))*$/)
  conversion_type?: string;
}

export class InappDto extends GoalsDto {}
