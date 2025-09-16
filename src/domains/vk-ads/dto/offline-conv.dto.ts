import { IsIn, IsOptional, IsString, IsNotEmpty, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

const ENTITIES = ['users', 'ad_groups', 'ad_plans'] as const;
const MODES = ['day', 'summary'] as const;

export class OfflineConvDto {
  @IsIn(ENTITIES as unknown as string[]) entity: string;
  @IsIn(MODES as unknown as string[]) mode: string; // day | summary

  // Accept both `ids` and `id` while normalizing to `ids`
  @IsString()
  @IsNotEmpty()
  @Transform(({ value, obj }) => value ?? obj.id)
  ids: string;
  @IsOptional() @IsString() id?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/) date_from: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date_to?: string;
}

