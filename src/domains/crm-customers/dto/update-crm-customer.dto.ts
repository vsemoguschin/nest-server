import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

function toOptionalNumberArray(value: unknown): number[] | undefined {
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

  return Array.from(new Set(result));
}

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateCrmCustomerDto {
  @ApiPropertyOptional({ example: 'Иван Иванов', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trimString)
  fullName?: string;

  @ApiPropertyOptional({ example: '06.03.1990', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(trimString)
  birthday?: string;

  @ApiPropertyOptional({ example: 'm', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(trimString)
  sex?: string;

  @ApiPropertyOptional({ example: '+7 999 123-45-67', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trimString)
  phone?: string;

  @ApiPropertyOptional({ example: 'ivan@example.com', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trimString)
  email?: string;

  @ApiPropertyOptional({ example: 'Москва, ул. Пушкина, 1', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(trimString)
  address?: string;

  @ApiPropertyOptional({ example: 'Telegram: @ivan', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trimString)
  otherContacts?: string;

  @ApiPropertyOptional({ example: '2026-03-01', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(trimString)
  firstContactDate?: string;

  @ApiPropertyOptional({ example: '2026-03-02', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(trimString)
  lastContactDate?: string;

  @ApiPropertyOptional({ example: '2026-03-10', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(trimString)
  nextContactDate?: string;

  @ApiPropertyOptional({ example: 'Короткая заметка', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(trimString)
  shortNotes?: string;

  @ApiPropertyOptional({ example: 'Комментарий по клиенту', maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  @Transform(trimString)
  comments?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  countryId?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  crmStatusId?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceId?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  salesChannelId?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  managerId?: number;

  @ApiPropertyOptional({
    type: [Number],
    example: [1, 2, 3],
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalNumberArray(value))
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  tagIds?: number[];
}
