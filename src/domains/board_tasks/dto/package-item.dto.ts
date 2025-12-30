// task-orders/dto/package-item.dto.ts
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PackageItemDto {
  @IsOptional() @IsInt() id?: number;
  @IsString() @MaxLength(255) name!: string;
  @IsString() @MaxLength(255) category!: string;
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;
}
