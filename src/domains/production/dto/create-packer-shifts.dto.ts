import { IsString, IsArray, Matches } from 'class-validator';

export class CreatePackerShiftsDto {
  @IsString({ message: 'Период должен быть строкой' })
  @Matches(/^\d{4}-\d{2}$/, { message: 'Период должен быть в формате YYYY-MM' })
  period: string;

  @IsArray({ message: 'Даты смен должны быть массивом' })
  @IsString({ each: true, message: 'Каждая дата смены должна быть строкой' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    each: true,
    message: 'Каждая дата смены должна быть в формате YYYY-MM-DD',
  })
  shiftDates: string[];
}
