// task-orders/dto/create-task-order.dto.ts
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { NeonDto } from './neon.dto';
import { LightingDto } from './lighting.dto';
import { PackageItemDto } from './package-item.dto';

const HOLE_TYPES = ['Нет', '6мм', '8мм', '10мм', '4мм', 'Другое'] as const;
const ADAPTER_TYPES = ['Помещение', 'Уличный', 'Нет', 'Другое'] as const;
const PLUG_TYPES = ['Нет', 'Другое', 'Подарочный', 'Стандарт', 'USB'] as const;
const PLUG_COLORS = ['Черный', 'Белый', 'Другое'] as const;
const WIRE_TYPES = ['Акустический', 'Белый', 'Черный'] as const;

export class CreateTaskOrderDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() deadline?: string; // YYYY-MM-DD
  @IsOptional() @IsString() material?: string;
  @IsOptional() @IsInt() @Min(0) boardWidth?: number;
  @IsOptional() @IsInt() @Min(0) boardHeight?: number;
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @IsIn(HOLE_TYPES)
  holeType?: string;
  @IsOptional() @IsString() holeInfo?: string;
  @IsOptional() @IsBoolean() stand?: boolean;
  @IsOptional() @IsString() laminate?: string;
  @IsOptional() @IsBoolean() print?: boolean;
  @IsOptional() @IsBoolean() printQuality?: boolean;
  @IsOptional() @IsBoolean() isAcrylic?: boolean;
  @IsOptional() @IsString() acrylic?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() wireInfo?: string;
  @IsOptional() @IsString() @IsIn(WIRE_TYPES) wireType?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  wireLength?: number;
  @IsOptional() @IsInt() @Min(0) elements?: number;
  @IsOptional() @IsBoolean() gift?: boolean;
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @IsIn(ADAPTER_TYPES)
  adapter?: string;
  @IsOptional() @IsString() adapterInfo?: string;
  @IsOptional() @IsString() @MaxLength(255) adapterModel?: string;
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @IsIn(PLUG_TYPES)
  plug?: string;
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @IsIn(PLUG_COLORS)
  plugColor?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  plugLength?: number;
  @IsOptional() @IsString() fitting?: string;
  @IsOptional() @IsBoolean() dimmer?: boolean;
  @IsOptional() @IsBoolean() switch?: boolean;
  @IsOptional() @IsBoolean() giftPack?: boolean;
  @IsOptional() @IsBoolean() docs?: boolean;
  @IsOptional() @IsString() description?: string;

  /** Если dealId в схеме опциональный — можно передавать; если обязателен, не отправляйте или установите на бэке по умолчанию */
  @IsOptional() @IsInt() dealId?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NeonDto)
  neons?: NeonDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LightingDto)
  lightings?: LightingDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageItemDto)
  packageItems?: PackageItemDto[];
}
