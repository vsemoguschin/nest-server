// task-orders/dto/create-task-order.dto.ts
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NeonDto } from './neon.dto';
import { LightingDto } from './lighting.dto';

export class CreateTaskOrderDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() deadline?: string; // YYYY-MM-DD
  @IsOptional() @IsString() material?: string;
  @IsOptional() @IsInt() @Min(0) boardWidth?: number;
  @IsOptional() @IsInt() @Min(0) boardHeight?: number;
  @IsOptional() @IsString() holeType?: string;
  @IsOptional() @IsBoolean() stand?: boolean;
  @IsOptional() @IsString() laminate?: string;
  @IsOptional() @IsBoolean() print?: boolean;
  @IsOptional() @IsBoolean() printQuality?: boolean;
  @IsOptional() @IsString() acrylic?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() wireLength?: string;
  @IsOptional() @IsInt() @Min(0) elements?: number;
  @IsOptional() @IsBoolean() gift?: boolean;
  @IsOptional() @IsString() adapter?: string;
  @IsOptional() @IsString() plug?: string;
  @IsOptional() @IsString() fitting?: string;
  @IsOptional() @IsBoolean() dimmer?: boolean;
  @IsOptional() @IsBoolean() switch?: boolean;
  @IsOptional() @IsBoolean() giftPack?: boolean;
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
}
