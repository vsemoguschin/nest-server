// src/dtos/create-manager-report.dto.ts
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateManagerReportDto {
  @IsString({ message: 'saleDate должно быть строкой (дата продажи).' })
  @IsNotEmpty()
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/, // Проверка формата "YYYY-MM-DD"
    { message: 'Дата должна быть в формате YYYY-MM-DD' },
  )
  @IsDateString(
    {},
    { message: 'saleDate должна быть валидной датой в формате YYYY-MM-DD' },
  )
  date: string;

  @IsInt()
  @Min(0)
  @IsNotEmpty()
  calls: number;

  @IsInt()
  @Min(0)
  @IsNotEmpty()
  makets: number;

  @IsInt()
  @Min(0)
  @IsNotEmpty()
  maketsDayToDay: number;

  @IsInt()
  @Min(0)
  @IsNotEmpty()
  redirectToMSG: number;

  @IsString({ message: 'period должно быть строкой (период).' })
  @IsOptional()
  @IsNotEmpty()
  period?: string;

  @IsInt()
  @IsNotEmpty()
  userId: number;
}
