import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
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
        .map((chunk) => chunk.trim()),
    )
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (!result.length) {
    return undefined;
  }

  return Array.from(new Set(result));
}

export class ListCrmVkDialogsQueryDto {
  @ApiPropertyOptional({
    description: 'Источник VK-диалогов, совпадает с CrmAccount.code',
    example: 'easybook',
  })
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  source!: string;

  @ApiPropertyOptional({
    description: 'Фильтр списка диалогов',
    enum: ['all', 'unread', 'unanswered'],
    default: 'all',
  })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'unread', 'unanswered'])
  filter?: 'all' | 'unread' | 'unanswered';

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

  @ApiPropertyOptional({
    description: 'Номер страницы для CRM-фильтрации списка диалогов',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsNumber()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Размер страницы для CRM-фильтрации списка диалогов',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsNumber()
  @IsInt()
  @Min(1)
  limit?: number;
}
