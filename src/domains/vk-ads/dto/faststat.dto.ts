import { IsIn, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
const ENTITIES = ['banners', 'campaigns', 'ad_plans', 'users'] as const;

export class FaststatDto {
  @IsIn(ENTITIES as unknown as string[]) entity: string;
  @IsString()
  @IsNotEmpty()
  @Transform(({ value, obj }) => value ?? obj.id)
  ids: string; // "1,2"
  @IsOptional() @IsString() id?: string;
}
