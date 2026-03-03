import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function toNumberArray(value: unknown): number[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [value];

  const result = rawItems
    .flatMap((item) =>
      String(item)
        .split(',')
        .map((chunk) => chunk.trim())
    )
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (!result.length) {
    return undefined;
  }

  return Array.from(new Set(result));
}

export class ListCrmCustomersQueryDto {
  @ApiPropertyOptional({
    description: 'Максимальное количество элементов на страницу',
    default: 30,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Cursor следующей страницы (base64 payload)',
    example: 'eyJ1cGRhdGVkQXQiOiIyMDI2LTAzLTAzVDEwOjAwOjAwLjAwMFoiLCJpZCI6MTIzfQ==',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Поиск по fullName',
    example: 'иван',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  q?: string;

  @ApiPropertyOptional({
    description: 'Фильтр по CRM-статусам (мультивыбор)',
    type: [Number],
    example: [1, 2, 3],
  })
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  statusIds?: number[];

  @ApiPropertyOptional({
    description: 'Фильтр по CRM-тегам (мультивыбор)',
    type: [Number],
    example: [10, 11],
  })
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  tagIds?: number[];

  @ApiPropertyOptional({
    description: 'Фильтр по менеджерам (мультивыбор)',
    type: [Number],
    example: [3, 7],
  })
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  managerIds?: number[];
}
